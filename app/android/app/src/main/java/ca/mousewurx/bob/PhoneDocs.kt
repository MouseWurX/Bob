package ca.mousewurx.bob

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

// 🧰 "Let the phone brain use tools": Bob's documents on this phone (spreadsheets, Word documents and notes the phone
// brain makes or fills in), kept in the app's own storage. Nothing here needs a permission or touches other apps'
// files: you add a file with Android's file picker, and Save to phone copies one to Download/Bob.
// Every change keeps the version before it (the last 5 per file), so a wrong change can be put back.
// Plain Java and Kotlin only (no Android parts), so it can be built and checked on a PC with kotlinc.
class PhoneDocs(root: File) {
    val dir: File = File(root, "documents").apply { mkdirs() }
    private val old: File = File(dir, ".old").apply { mkdirs() }

    companion object {
        const val MAX_BYTES = 20L * 1024 * 1024
        const val KEEP_OLD = 5
        private val KINDS = setOf("xlsx", "docx", "txt", "md", "csv")

        /** A plain file name (no folders), with a kind the phone knows; anything else is refused. */
        fun safeName(nameIn: String): String {
            val name = nameIn.trim()
            require(name.isNotEmpty() && name.length <= 120) { "a file name needs 1 to 120 letters" }
            require(!name.contains('/') && !name.contains('\\') && !name.startsWith(".") && name.none { it < ' ' || it in "<>:\"|?*" }) { "\"$name\" can't be a file name here" }
            require(name.substringAfterLast('.', "").lowercase() in KINDS) { "only .xlsx, .docx, .txt, .md and .csv files go in Bob's documents" }
            return name
        }
    }

    private fun file(name: String) = File(dir, safeName(name))
    private fun olds(name: String) = old.listFiles { f -> f.name.startsWith("$name.") && f.name.removePrefix("$name.").all { it.isDigit() } }?.sortedByDescending { it.name.removePrefix("$name.").toLong() } ?: emptyList()

    /** [{name, bytes, modified, versions}], newest first. */
    fun list(): JSONArray {
        val out = JSONArray()
        dir.listFiles { f -> f.isFile && !f.name.startsWith(".") && !f.name.endsWith(".part") }
            ?.sortedByDescending { it.lastModified() }
            ?.forEach { f -> out.put(JSONObject().put("name", f.name).put("bytes", f.length()).put("modified", f.lastModified()).put("versions", olds(f.name).size)) }
        return out
    }

    fun read(name: String): ByteArray? = file(name).takeIf { it.isFile }?.readBytes()

    /** Writes a whole file. The version before goes to .old (the last [KEEP_OLD] are kept). */
    fun write(name: String, bytes: ByteArray): JSONObject {
        require(bytes.size <= MAX_BYTES) { "that file is bigger than 20 MB" }
        val f = file(name)
        val had = f.isFile
        if (had) keepOld(f)
        val part = File(dir, "${f.name}.part")
        part.writeBytes(bytes)
        if (!part.renameTo(f)) { f.delete(); if (!part.renameTo(f)) { part.delete(); throw IllegalStateException("the phone wouldn't save ${f.name}") } }
        return JSONObject().put("name", f.name).put("bytes", f.length()).put("kept", had)
    }

    private fun keepOld(f: File) {
        var stamp = System.currentTimeMillis()
        while (File(old, "${f.name}.$stamp").exists()) stamp++
        f.copyTo(File(old, "${f.name}.$stamp"))
        olds(f.name).drop(KEEP_OLD).forEach { it.delete() }
    }

    /** Puts back the version before the last change (the changed one goes), so undo after undo steps further back. */
    fun undo(name: String): Boolean {
        val f = file(name)
        val last = olds(f.name).firstOrNull() ?: return false
        val part = File(dir, "${f.name}.part")
        last.copyTo(part, overwrite = true)
        if (!part.renameTo(f)) { f.delete(); part.renameTo(f) }
        last.delete()
        return true
    }

    /** Takes a file out of the list. It stays as an old version, so Undo on the same name brings it back. */
    fun delete(name: String): Boolean {
        val f = file(name)
        if (!f.isFile) return false
        keepOld(f)
        return f.delete()
    }

    /** A free name like "Budget (2).xlsx" when [name] is taken (for files added from the phone). */
    fun freeName(name: String): String {
        val n = safeName(name)
        if (!File(dir, n).exists()) return n
        val stem = n.substringBeforeLast('.'); val ext = n.substringAfterLast('.')
        var i = 2
        while (File(dir, "$stem ($i).$ext").exists()) i++
        return safeName("$stem ($i).$ext")
    }
}

// 🔎 "Look things up online" (off to start with): one https page for the phone brain's look_up tool. Only https, only
// public addresses (never this phone, your home network or Tailscale), at most 2 MB, nothing sent but the address.
object WebLook {
    const val MAX_BYTES = 2 * 1024 * 1024

    fun allowed(url: String): Boolean {
        val u = runCatching { URL(url) }.getOrNull() ?: return false
        if (u.protocol != "https" || u.userInfo != null || u.host.isNullOrBlank()) return false
        val host = u.host.lowercase().trimEnd('.')
        if (host == "localhost" || host.endsWith(".local") || host.endsWith(".ts.net") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return false
        return true
    }

    private fun publicAddress(host: String): Boolean = runCatching {
        InetAddress.getAllByName(host).all { a ->
            val b = a.address
            !(a.isLoopbackAddress || a.isSiteLocalAddress || a.isLinkLocalAddress || a.isAnyLocalAddress || a.isMulticastAddress ||
                (b.size == 4 && (b[0].toInt() and 0xff) == 100 && (b[1].toInt() and 0xc0) == 64) || // Tailscale 100.64.0.0/10
                (b.size == 16 && (b[0].toInt() and 0xfe) == 0xfc)) // private IPv6
        }
    }.getOrDefault(false)

    /** {status, type, text, url}: the page's words come back as text (UTF-8 unless it says otherwise). */
    fun get(urlIn: String, timeoutMs: Int = 15000): JSONObject {
        var url = urlIn
        for (hop in 0..4) {
            if (!allowed(url)) return JSONObject().put("status", 0).put("text", "only public https:// pages").put("url", url)
            if (!publicAddress(URL(url).host)) return JSONObject().put("status", 0).put("text", "that address isn't on the public web").put("url", url)
            val c = URL(url).openConnection() as HttpURLConnection
            try {
                c.instanceFollowRedirects = false
                c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Bob")
                c.setRequestProperty("Accept", "text/html,text/plain;q=0.9,*/*;q=0.5")
                val code = c.responseCode
                if (code in 300..399) {
                    val next = c.getHeaderField("Location") ?: return JSONObject().put("status", code).put("text", "").put("url", url)
                    url = URL(URL(url), next).toString(); continue
                }
                val type = c.contentType ?: ""
                val stream = if (code >= 400) c.errorStream else c.inputStream
                val bytes = stream?.use { s -> s.readNBytes(MAX_BYTES) } ?: ByteArray(0)
                val charset = Regex("charset=([\\w-]+)", RegexOption.IGNORE_CASE).find(type)?.groupValues?.get(1)
                val text = runCatching { String(bytes, charset(charset ?: "UTF-8")) }.getOrElse { String(bytes, Charsets.UTF_8) }
                return JSONObject().put("status", code).put("type", type.substringBefore(';')).put("text", text).put("url", url)
            } finally { c.disconnect() }
        }
        return JSONObject().put("status", 0).put("text", "too many redirects").put("url", url)
    }
}
