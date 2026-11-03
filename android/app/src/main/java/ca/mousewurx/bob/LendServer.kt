package ca.mousewurx.bob

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.PowerManager
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

// "Lend my brain" (off unless you turn it on): your other Bobs (the PC while you game, a laptop) may ask this phone
// to think one quick reply. This is the same small door a desktop Bob opens (Lend protocol v1):
//   POST /login             form code=<passcode>, answers 303 with the bob_auth cookie
//   GET  /api/lend/hello    {protocol: 1, lend, busy?, brain, device: 'phone', version}
//   POST /api/lend/chat     {protocol: 1, from, messages, tools} -> server-sent events: token ... done {reply}
// The rules: only on the phone's Tailscale address, only from Tailscale addresses, only with the passcode.
// Words in, words and tool calls out: nothing runs on the phone and nothing is kept (no chat, no log of the words).
// It says no (409 {busy}) while you're using the phone or its brain, when it's too warm, or when the battery is low.
class LendServer(private val app: BobApp) {
    companion object {
        const val PORT = 7777
        const val PROTOCOL = 1
        private const val MAX_BODY = 2_000_000
        private const val MAX_HEAD = 16_384
        private val HEX64 = Regex("^[0-9a-f]{64}$")
        private val TS_NAME = Regex("""^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$""")

        /** 100.64.0.0/10 (Tailscale's IPv4 range) or fd7a:115c:a1e0::/48 (its IPv6 range). */
        fun isTailscale(a: InetAddress?): Boolean = when (a) {
            is Inet4Address -> { val b = a.address; (b[0].toInt() and 0xff) == 100 && (b[1].toInt() and 0xc0) == 64 }
            is Inet6Address -> { val b = a.address; (b[0].toInt() and 0xff) == 0xfd && (b[1].toInt() and 0xff) == 0x7a && (b[2].toInt() and 0xff) == 0x11 && (b[3].toInt() and 0xff) == 0x5c && (b[4].toInt() and 0xff) == 0xa1 && (b[5].toInt() and 0xff) == 0xe0 }
            else -> false
        }

        /** The Host header must name this phone the Tailscale way (a 100.x address or a *.ts.net name). */
        fun okHost(host: String?): Boolean {
            val h = (host ?: return false).trim().lowercase().removeSuffix(".")
            val name = if (h.startsWith("[")) h.substringAfter("[").substringBefore("]")
                else if (h.count { it == ':' } == 1) h.substringBefore(":") else h
            if (TS_NAME.matches(name.removeSuffix("."))) return true
            if (!Regex("""^[0-9.]+$""").matches(name) && !name.contains(':')) return false
            return runCatching { isTailscale(InetAddress.getByName(name)) }.getOrDefault(false)
        }
    }

    // ---------- Settings (kept on the phone only; Android's backup leaves them out) ----------
    private val prefs = app.getSharedPreferences("lend", Context.MODE_PRIVATE)

    inner class Settings {
        val on: Boolean get() = prefs.getBoolean("on", false)
        val file: String? get() = prefs.getString("file", null)
        val label: String get() = prefs.getString("label", "") ?: ""
        val passcodeSet: Boolean get() = prefs.getString("hash", null) != null
    }
    val settings = Settings()

    fun setOn(on: Boolean) {
        prefs.edit().putBoolean("on", on).apply()
        if (on) app.startLending() else app.stopLending()
    }

    /** Which phone brain lends (the one picked under Phone brain). */
    fun setBrain(file: String, label: String) { prefs.edit().putString("file", file).putString("label", label.take(60)).apply() }

    /** A new 8-digit passcode, shown once. Every Bob that logged in with the old one has to log in again. */
    fun newPasscode(): String {
        val rnd = SecureRandom()
        val code = (1..8).joinToString("") { rnd.nextInt(10).toString() }
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        prefs.edit().putString("salt", hex(salt)).putString("hash", hex(pbkdf2(code, salt))).putString("keys", "[]").apply()
        return code
    }

    private fun pbkdf2(code: String, salt: ByteArray): ByteArray =
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(PBEKeySpec(code.toCharArray(), salt, 60_000, 256)).encoded

    private fun checkPasscode(code: String): Boolean {
        val salt = unhex(prefs.getString("salt", null) ?: return false)
        val want = unhex(prefs.getString("hash", null) ?: return false)
        if (code.isEmpty() || code.length > 64) return false
        return MessageDigest.isEqual(pbkdf2(code, salt), want)
    }

    // Login keys: only their fingerprints are kept, up to 8 (the oldest goes first).
    private fun keys(): JSONArray = runCatching { JSONArray(prefs.getString("keys", "[]")) }.getOrDefault(JSONArray())
    private fun newKey(): String {
        val k = hex(ByteArray(32).also { SecureRandom().nextBytes(it) })
        val list = keys().let { a -> (0 until a.length()).map { a.getString(it) } }.takeLast(7) + sha(k)
        prefs.edit().putString("keys", JSONArray(list).toString()).apply()
        return k
    }
    private fun keyOk(k: String?): Boolean {
        if (k == null || !HEX64.matches(k)) return false
        val f = sha(k); val a = keys()
        return (0 until a.length()).any { MessageDigest.isEqual(a.getString(it).toByteArray(), f.toByteArray()) }
    }

    // ---------- The door ----------
    @Volatile private var running = false
    @Volatile private var server: ServerSocket? = null
    private var door: Thread? = null
    private val pool = Executors.newFixedThreadPool(4) { r -> Thread(r, "bob-lend") }
    @Volatile var address: String? = null
        private set
    @Volatile var state = "off" // off, waiting (no Tailscale), open
        private set
    @Volatile var lastLent = "" // "Thought a reply for PC in 4.2 s" (never the words)
        private set
    @Volatile var onChange: ((String) -> Unit)? = null
    private val tries = ConcurrentHashMap<String, MutableList<Long>>()

    private fun changed() { onChange?.invoke(statusLine()) }

    fun statusLine(): String = when {
        state == "waiting" -> "Waiting for Tailscale on this phone."
        lastLent.isNotEmpty() -> lastLent
        else -> "Your other Bobs can ask this phone to think."
    }

    fun status(): JSONObject = JSONObject()
        .put("on", settings.on).put("state", state).put("address", address ?: JSONObject.NULL)
        .put("passcodeSet", settings.passcodeSet).put("last", lastLent).put("now", refusal() ?: "")
        .put("file", settings.file ?: JSONObject.NULL)
        .put("screenOffOk", (app.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(app.packageName))

    @Synchronized fun start() {
        if (running) return
        running = true
        door = Thread({ doorLoop() }, "bob-lend-door").also { it.isDaemon = true; it.start() }
    }

    @Synchronized fun stop() {
        running = false
        runCatching { server?.close() }
        server = null; address = null; state = "off"
        app.brain.let { if (it.working.get() == "lend") it.stop() }
    }

    /** This phone's Tailscale address: from the VPN's link, or failing that from the network interfaces. */
    private fun tailscaleIp(): InetAddress? {
        runCatching {
            val cm = app.getSystemService(ConnectivityManager::class.java)
            @Suppress("DEPRECATION")
            for (n in cm.allNetworks) for (la in cm.getLinkProperties(n)?.linkAddresses ?: emptyList()) {
                if (la.address is Inet4Address && isTailscale(la.address)) return la.address
            }
        }
        runCatching {
            for (ni in NetworkInterface.getNetworkInterfaces()) for (a in ni.inetAddresses) if (a is Inet4Address && isTailscale(a)) return a
        }
        return null
    }

    private fun doorLoop() {
        while (running) {
            val ip = tailscaleIp()
            if (ip == null) {
                if (state != "waiting") { state = "waiting"; address = null; changed() }
                sleep(15_000); continue
            }
            try {
                ServerSocket().use { ss ->
                    ss.reuseAddress = true
                    ss.bind(InetSocketAddress(ip, PORT), 16)
                    ss.soTimeout = 20_000
                    server = ss
                    address = "${ip.hostAddress}:$PORT"; state = "open"; changed()
                    while (running) {
                        try {
                            val s = ss.accept()
                            pool.execute { serve(s) }
                        } catch (e: SocketTimeoutException) {
                            if (tailscaleIp() != ip) break // Tailscale changed or went away: open the door again
                        }
                    }
                }
            } catch (e: IOException) {
                if (running) sleep(10_000)
            } finally { server = null }
        }
        state = "off"; address = null
    }

    private fun sleep(ms: Long) { try { Thread.sleep(ms) } catch (_: InterruptedException) {} }

    // ---------- Why not right now ----------
    /** Why this phone won't lend right now, or null when it will. */
    fun refusal(): String? {
        if (!settings.on) return "off"
        val file = settings.file
        if (file == null || !app.brain.hasFile(file)) return "no brain"
        if (app.brain.working.get() != null) return "busy"
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isInteractive && !app.bobVisible) return "in use" // you're using the phone for something else
        if (pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_MODERATE) return "too warm"
        val bat = app.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.let { 100 * it.getIntExtra(BatteryManager.EXTRA_LEVEL, 100) / it.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1) } ?: 100
        val plugged = (bat?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        if (level < 25 && !plugged) return "low battery"
        if (app.brain.lowMemory()) return "busy"
        return null
    }

    // ---------- One request ----------
    private class Req(val method: String, val path: String, val headers: Map<String, String>, val body: ByteArray)

    private fun serve(s: Socket) {
        s.use { sock ->
            try {
                sock.soTimeout = 15_000
                val remote = sock.inetAddress
                val out = sock.getOutputStream()
                if (!isTailscale(remote)) return reply(out, 403, JSONObject().put("error", "Tailscale only"))
                val req = read(BufferedInputStream(sock.getInputStream())) ?: return reply(out, 400, JSONObject().put("error", "bad request"))
                if (!okHost(req.headers["host"])) return reply(out, 403, JSONObject().put("error", "wrong host"))
                when {
                    req.method == "POST" && req.path == "/login" -> login(out, req, remote.hostAddress ?: "")
                    req.path == "/api/lend/hello" && req.method == "GET" -> { if (signedIn(req, out)) hello(out) }
                    req.path == "/api/lend/chat" && req.method == "POST" -> { if (signedIn(req, out)) chat(sock, out, req) }
                    else -> reply(out, 404, JSONObject().put("error", "not here"))
                }
            } catch (_: Exception) { /* the other Bob went away; nothing to keep */ }
        }
    }

    private fun read(inp: InputStream): Req? {
        val head = ByteArrayOutputStream()
        var last4 = 0
        while (true) {
            val b = inp.read()
            if (b < 0) return null
            head.write(b)
            last4 = (last4 shl 8) or b
            if (last4 == 0x0d0a0d0a) break
            if (head.size() > MAX_HEAD) return null
        }
        val lines = head.toString(Charsets.ISO_8859_1.name()).split("\r\n")
        val first = lines[0].split(" ")
        if (first.size < 3) return null
        val headers = HashMap<String, String>()
        for (l in lines.drop(1)) { val i = l.indexOf(':'); if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim() }
        if (headers.containsKey("transfer-encoding")) return null // only plain bodies with a length
        val len = headers["content-length"]?.toIntOrNull() ?: 0
        if (len < 0 || len > MAX_BODY) return null
        val body = ByteArray(len)
        var got = 0
        while (got < len) { val n = inp.read(body, got, len - got); if (n < 0) return null; got += n }
        return Req(first[0], first[1].substringBefore('?'), headers, body)
    }

    private fun reply(out: OutputStream, code: Int, body: JSONObject, extra: String = "") {
        val b = body.toString().toByteArray()
        val text = mapOf(200 to "OK", 303 to "See Other", 400 to "Bad Request", 401 to "Unauthorized", 403 to "Forbidden", 404 to "Not Found", 409 to "Conflict", 429 to "Too Many Requests")[code] ?: "Error"
        out.write("HTTP/1.1 $code $text\r\nContent-Type: application/json\r\nContent-Length: ${b.size}\r\nCache-Control: no-store\r\nConnection: close\r\n$extra\r\n".toByteArray())
        out.write(b); out.flush()
    }

    private fun login(out: OutputStream, req: Req, who: String) {
        val now = System.currentTimeMillis()
        val mine = tries.getOrPut(who) { mutableListOf() }
        synchronized(mine) { mine.removeAll { now - it > 600_000 } }
        if (synchronized(mine) { mine.size } >= 5) return reply(out, 429, JSONObject().put("error", "too many tries; wait ten minutes"))
        val form = String(req.body, Charsets.UTF_8).split("&").associate { kv -> kv.substringBefore("=") to URLDecoder.decode(kv.substringAfter("=", ""), "UTF-8") }
        if (!settings.passcodeSet || !checkPasscode(form["code"]?.trim() ?: "")) {
            synchronized(mine) { mine.add(now) }
            return reply(out, 401, JSONObject().put("error", "wrong passcode"))
        }
        val key = newKey()
        val b = ByteArray(0)
        out.write(("HTTP/1.1 303 See Other\r\nLocation: /\r\nSet-Cookie: bob_auth=$key; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000\r\n" +
            "Content-Length: ${b.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").toByteArray())
        out.flush()
    }

    private fun signedIn(req: Req, out: OutputStream): Boolean {
        val key = (req.headers["cookie"] ?: "").split(";").map { it.trim() }.firstOrNull { it.startsWith("bob_auth=") }?.substringAfter("=")
        if (keyOk(key)) return true
        reply(out, 401, JSONObject().put("error", "log in first"))
        return false
    }

    private fun hello(out: OutputStream) {
        val why = refusal()
        val o = JSONObject().put("protocol", PROTOCOL).put("lend", settings.on).put("brain", settings.label.ifEmpty { "phone brain" })
            .put("device", "phone").put("version", app.version)
            // What the other Bob needs to choose well: room for the chat, and how fast this phone writes.
            // Whole jobs stay on desktop Bobs (files and tools live there), so the phone never takes them.
            .put("ctx", app.brain.contextSize()).put("takesJobs", false)
        if (app.brain.lastSpeed > 0) o.put("speed", Math.round(app.brain.lastSpeed * 10) / 10.0)
        if (why != null && why != "off") o.put("busy", why)
        reply(out, 200, o)
    }

    private fun chat(sock: Socket, out: OutputStream, req: Req) {
        // Same guard as the desktop's: a web page can't send these headers to another site without asking first.
        if (req.headers["x-bob"] != "1" || req.headers["content-type"]?.startsWith("application/json") != true)
            return reply(out, 403, JSONObject().put("error", "missing x-bob"))
        val b = runCatching { JSONObject(String(req.body, Charsets.UTF_8)) }.getOrNull() ?: return reply(out, 400, JSONObject().put("error", "bad JSON"))
        if (b.has("protocol") && b.optInt("protocol") != PROTOCOL) return reply(out, 400, JSONObject().put("error", "protocol $PROTOCOL only"))
        val messages = b.optJSONArray("messages") ?: JSONArray()
        if ((0 until messages.length()).none { messages.optJSONObject(it)?.optString("role") == "user" }) return reply(out, 400, JSONObject().put("error", "no question"))
        val tools = ChatShape.tools(b.optJSONArray("tools"))
        val from = (b.optString("from").replace(Regex("[\\u0000-\\u001f<>]"), "").trim().take(40)).ifEmpty { "another Bob" }
        refusal()?.let { return reply(out, 409, JSONObject().put("busy", it)) }
        val file = settings.file ?: return reply(out, 409, JSONObject().put("busy", "no brain"))

        out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".toByteArray())
        out.flush()
        sock.soTimeout = 0
        val gone = java.util.concurrent.atomic.AtomicBoolean(false)
        val send = { ev: JSONObject ->
            if (!gone.get()) try { synchronized(out) { out.write("data: $ev\n\n".toByteArray(Charsets.UTF_8)); out.flush() } } catch (_: IOException) { gone.set(true) }
        }
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bob:lend").apply { acquire(5 * 60_000L) }
        val t0 = System.currentTimeMillis()
        lastLent = "Thinking a reply for $from…"; changed()
        try {
            send(JSONObject().put("type", "brain").put("label", settings.label.ifEmpty { "phone brain" }))
            val r = runBlocking { app.brain.lend(file, messages, tools, gone = { gone.get() || !running }) { ev -> send(ev) } }
            send(JSONObject().put("type", "done").put("reply", r))
            lastLent = "Thought a reply for $from in ${"%.1f".format((System.currentTimeMillis() - t0) / 1000.0)} s"
        } catch (e: PhoneBrain.Busy) {
            // "too long" can only be known once the chat is read, after the 200: same fields as a 409 would carry.
            send(JSONObject().put("type", "error").put("error", e.why).put("busy", e.why).put("ctx", app.brain.contextSize()))
            lastLent = "Couldn't think for $from (${e.why})."
        } catch (e: Exception) {
            send(JSONObject().put("type", "error").put("error", (e.message ?: "failed").take(200)))
            lastLent = "Couldn't think for $from."
        } finally {
            if (wake.isHeld) wake.release()
            changed()
        }
    }

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    private fun sha(s: String) = hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray()))
}
