package ca.mousewurx.bob

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

// Talks to a Bob on your network (desktop Bob with "Let my other devices in" on), over Tailscale only.
// Desktop Bob checks the same things on his side: the Tailscale range, his address list, the passcode cookie,
// the x-bob header and a JSON content type. The passcode is used once to log in and is never stored;
// only the login cookie desktop Bob hands back is kept (in the app's private storage).
class NetBob(context: Context) {
    private val prefs = context.getSharedPreferences("netbob", Context.MODE_PRIVATE)

    companion object {
        const val DEFAULT_PORT = 7777
        private val TS_IP = Regex("""^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$""")
        private val TS_NAME = Regex("""^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$""")

        // Same rule as phone.js netAddress(): Tailscale addresses only (100.64.0.0/10, or a *.ts.net name).
        fun isTailscaleHost(host: String): Boolean {
            val h = host.lowercase()
            TS_IP.find(h)?.let { m ->
                val (a, b, c) = m.destructured
                val second = a.toInt()
                return second in 64..127 && b.toInt() <= 255 && c.toInt() <= 255
            }
            return h.length <= 253 && TS_NAME.matches(h)
        }

        /** "my-pc.tail1234.ts.net" or "100.101.102.103:7777" -> "http://host:port", or null if it isn't a Tailscale address. */
        fun base(address: String): String? {
            var a = address.trim().lowercase().removePrefix("http://").removeSuffix("/")
            if (a.isEmpty() || a.contains('/') || a.contains('@') || a.startsWith("https://")) return null
            var port = DEFAULT_PORT
            val colon = a.lastIndexOf(':')
            if (colon > 0) {
                port = a.substring(colon + 1).toIntOrNull() ?: return null
                if (port !in 1..65535) return null
                a = a.substring(0, colon)
            }
            if (!isTailscaleHost(a)) return null
            return "http://$a:$port"
        }
    }

    data class Reply(val status: Int, val body: String, val type: String = "")

    private fun cookie(base: String): String? = prefs.getString("cookie:$base", null)

    fun signedIn(base: String) = cookie(base) != null

    fun forget(base: String) { prefs.edit().remove("cookie:$base").apply() }

    private fun open(base: String, path: String, method: String, timeoutMs: Int = 8000): HttpURLConnection {
        require(base(base.removePrefix("http://")) == base) { "Not a Tailscale address" }
        require(path.startsWith("/") && !path.startsWith("//")) { "Bad path" }
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.instanceFollowRedirects = false
        c.connectTimeout = 4000
        c.readTimeout = timeoutMs
        c.useCaches = false
        cookie(base)?.let { c.setRequestProperty("Cookie", it) }
        return c
    }

    /** Log in with the passcode. Returns "ok", "wrong", "busy" (too many tries), or an error message. */
    fun login(base: String, code: String): String {
        val c = open(base, "/login", "POST")
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        c.outputStream.use { it.write(("code=" + URLEncoder.encode(code, "UTF-8")).toByteArray()) }
        val status = c.responseCode
        val set = c.headerFields.entries.filter { it.key.equals("Set-Cookie", true) }.flatMap { it.value }
            .firstOrNull { it.startsWith("bob_auth=") }
        c.disconnect()
        return when {
            status == 303 && set != null -> { prefs.edit().putString("cookie:$base", set.substringBefore(';')).apply(); "ok" }
            // Phone access is off on that Bob, or this address isn't on his list: he refuses before asking.
            status == 403 -> "not-let-in"
            status == 429 -> "busy"
            status == 401 -> "wrong"
            else -> "error $status"
        }
    }

    fun get(base: String, path: String): Reply {
        val c = open(base, path, "GET")
        return read(c)
    }

    fun post(base: String, path: String, json: String): Reply {
        val c = open(base, path, "POST", 30000)
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("x-bob", "1")
        c.outputStream.use { it.write(json.toByteArray()) }
        return read(c)
    }

    /** Sends a picture (bytes) to that Bob, e.g. /api/refs for a photo to work on. */
    fun upload(base: String, path: String, bytes: ByteArray, type: String): Reply {
        val c = open(base, path, "POST", 60000)
        c.doOutput = true
        c.setFixedLengthStreamingMode(bytes.size)
        c.setRequestProperty("Content-Type", type)
        c.setRequestProperty("x-bob", "1")
        c.outputStream.use { it.write(bytes) }
        return read(c)
    }

    private fun read(c: HttpURLConnection): Reply {
        try {
            val status = c.responseCode
            val stream = if (status >= 400) c.errorStream else c.inputStream
            val body = stream?.bufferedReader()?.use { it.readText().take(2_000_000) } ?: ""
            // A login page back means the cookie went stale (passcode changed on the PC).
            if (status == 401) prefs.edit().remove("cookie:${c.url.protocol}://${c.url.authority}").apply()
            return Reply(status, body, c.contentType ?: "")
        } finally { c.disconnect() }
    }

    /** A picture, clip or song from that Bob, as a data: URL the page can show (up to 25 MB). */
    fun media(base: String, path: String): String? {
        val c = open(base, path, "GET", 30000)
        try {
            if (c.responseCode != 200) return null
            val len = c.contentLengthLong
            if (len > 25_000_000) return null
            val bytes = c.inputStream.use { s -> s.readNBytes(25_000_001) }
            if (bytes.size > 25_000_000) return null
            val type = (c.contentType ?: "application/octet-stream").substringBefore(';')
            return "data:$type;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
        } finally { c.disconnect() }
    }

    /** A file from that Bob as bytes and its type (up to 200 MB), for saving it on this phone. */
    fun bytes(base: String, path: String): Pair<ByteArray, String>? {
        val c = open(base, path, "GET", 60000)
        try {
            if (c.responseCode != 200) return null
            if (c.contentLengthLong > 200_000_000) return null
            val bytes = c.inputStream.use { s -> s.readNBytes(200_000_001) }
            if (bytes.size > 200_000_000) return null
            return bytes to (c.contentType ?: "application/octet-stream").substringBefore(';').trim()
        } finally { c.disconnect() }
    }

    /** Follows that Bob's live events (replies as they're written, OK cards, job progress) until stopped. */
    fun listen(base: String, stop: () -> Boolean, onEvent: (JSONObject) -> Unit, onState: (Boolean) -> Unit) {
        var wait = 1000L
        while (!stop()) {
            try {
                val c = open(base, "/api/events", "GET", 60000)
                c.setRequestProperty("Accept", "text/event-stream")
                val code = c.responseCode
                if (code != 200) {
                    c.disconnect(); onState(false)
                    if (code == 401) { forget(base); return } // signed out: the page asks for the passcode again
                } else {
                    onState(true); wait = 1000L
                    BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8)).use { r ->
                        while (!stop()) {
                            val line = r.readLine() ?: break
                            if (line.startsWith("data: ")) runCatching { onEvent(JSONObject(line.substring(6))) }
                        }
                    }
                    c.disconnect()
                    onState(false)
                }
            } catch (_: Exception) { onState(false) }
            if (stop()) break
            Thread.sleep(wait)
            wait = (wait * 2).coerceAtMost(30000L)
        }
    }
}
