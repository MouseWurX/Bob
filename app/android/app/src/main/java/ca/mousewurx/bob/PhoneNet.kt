package ca.mousewurx.bob

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

// Nov 27 2026, the phone's half of "Where Bob connected" and "No internet" (the computer's are src/net-log.js and
// src/no-internet.js). Every connection the phone app opens goes through open() here: it is written down (the site,
// when, what for; never the address's path or what was sent), and with No internet on (off unless you turn it on)
// a site that isn't allowed is stopped before anything is looked up or sent. Allowed: this phone itself, your own Bobs
// over Tailscale (ticked to start), your home network (ticked to start) and the sites on your list.
// Home-network connections are one line ("your home network", with a count), because finding your Bobs knocks on
// every address there. Kept: the last 300 in memory, and net-log.jsonl in the app's own folder (about 1 MB, then the
// older half moves to net-log.jsonl.1). With No internet off, connections work exactly as before.
object PhoneNet {
    class Stopped(host: String) : Exception("Not connected: No internet is on, and $host isn't on the allowed list (Settings, Privacy, No internet).")

    private const val KEEP = 300
    private const val MAX_FILE = 1_000_000L
    private const val SAME_MS = 60_000L
    private const val MAX_HOPS = 5
    private const val HOME_LINE = "your home network"
    private var ctx: Context? = null
    private val recent = ArrayList<JSONObject>()

    fun init(c: Context) { ctx = c.applicationContext }
    private fun prefs() = ctx?.getSharedPreferences("phone-net", Context.MODE_PRIVATE)

    data class Rules(val on: Boolean, val home: Boolean, val bobNet: Boolean, val allow: List<String>)

    fun rules(): Rules {
        val p = prefs()
        return Rules(
            p?.getBoolean("on", false) == true,
            p?.getBoolean("home", true) != false,
            p?.getBoolean("bobNet", true) != false,
            (p?.getString("allow", "") ?: "").split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        )
    }

    /** "https://Www.Example.com:8443/x" -> "www.example.com"; "" for anything that isn't a site name. */
    fun cleanSite(s: String): String {
        var h = s.trim().lowercase().replace(Regex("^[a-z][a-z0-9+.-]*://"), "").replace(Regex("[/?#].*$"), "").removePrefix("*.").removeSuffix(".")
        h = h.replace(Regex(":\\d+$"), "")
        return if (Regex("^[a-z0-9.-]{1,253}$").matches(h)) h else ""
    }

    private fun loopback(h: String) = h == "localhost" || h == "::1" || h.startsWith("127.")
    private fun quad(h: String) = h.split('.').mapNotNull { it.toIntOrNull() }.takeIf { it.size == 4 && it.all { n -> n in 0..255 } }
    fun isBobNet(h: String): Boolean = NetBob.isTailscaleHost(h) || h.endsWith(".ts.net")
    fun isHome(h: String): Boolean {
        val q = quad(h)
        if (q != null) return q[0] == 10 || (q[0] == 172 && q[1] in 16..31) || (q[0] == 192 && q[1] == 168) || (q[0] == 169 && q[1] == 254)
        return h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa")
    }

    /** Would No internet stop a connection to host? Never one on this phone itself. */
    fun stops(host: String, r: Rules = rules()): Boolean {
        val h = host.lowercase().removeSurrounding("[", "]").removeSuffix(".")
        if (loopback(h) || !r.on) return false
        if (isBobNet(h)) return !r.bobNet
        if (isHome(h)) return !r.home
        return r.allow.none { h == it || h.endsWith(".$it") }
    }

    @Synchronized
    fun note(host: String, port: Int, what: String, stopped: Boolean) {
        val h0 = host.lowercase()
        if (h0.isEmpty() || loopback(h0)) return
        val h = if (isHome(h0)) HOME_LINE else h0
        val now = System.currentTimeMillis()
        val last = recent.firstOrNull { it.optString("host") == h && it.optString("what") == what && it.optBoolean("stopped") == stopped && now - it.optLong("last") < SAME_MS }
        if (last != null) { last.put("count", last.optInt("count", 1) + 1).put("last", now); return }
        val e = JSONObject().put("at", now).put("last", now).put("host", h).put("port", port).put("what", what).put("stopped", stopped).put("count", 1)
        recent.add(0, e)
        while (recent.size > KEEP) recent.removeAt(recent.size - 1)
        val dir = ctx?.filesDir ?: return
        runCatching {
            val f = File(dir, "net-log.jsonl")
            if (f.exists() && f.length() > MAX_FILE) f.renameTo(File(dir, "net-log.jsonl.1"))
            val line = JSONObject().put("at", java.time.Instant.ofEpochMilli(now).toString()).put("host", h).put("port", port).put("what", what)
            if (stopped) line.put("blocked", true)
            f.appendText(line.toString() + "\n")
        } // the log never stops a connection
    }

    /** A connection to url, written down, or Stopped when No internet stops it. With No internet on, redirects are
     *  followed here, one hop at a time, so a site on your list can't hand Bob on to one that isn't; setup runs again
     *  for each hop (timeouts, Range). With it off, Android follows them itself, as before. */
    fun open(url: String, what: String, setup: (HttpURLConnection) -> Unit = {}): HttpURLConnection {
        var u = URL(url)
        repeat(MAX_HOPS + 1) {
            val r = rules()
            val stop = stops(u.host, r)
            note(u.host, if (u.port > 0) u.port else u.defaultPort, what, stop)
            if (stop) throw Stopped(u.host.lowercase())
            val c = u.openConnection() as HttpURLConnection
            setup(c)
            if (!r.on || !c.instanceFollowRedirects) return c
            c.instanceFollowRedirects = false
            val code = c.responseCode
            val to = c.getHeaderField("Location")
            if (code !in 300..399 || to.isNullOrBlank()) return c
            c.disconnect()
            u = URL(u, to)
        }
        throw Exception("too many redirects")
    }

    @Synchronized
    fun view(): JSONObject {
        val r = rules()
        return JSONObject().put("on", r.on).put("home", r.home).put("bobNet", r.bobNet).put("allow", JSONArray(r.allow))
            .put("stopped", recent.filter { it.optBoolean("stopped") }.sumOf { it.optInt("count", 1) })
            .put("recent", JSONArray(recent.take(100).map { JSONObject(it.toString()) }))
    }

    /** { on }, { home }, { bobNet }, { add: "site" } or { remove: "site" }. */
    fun set(o: JSONObject): JSONObject {
        val p = prefs() ?: return view()
        val r = rules()
        val e = p.edit()
        for (k in listOf("on", "home", "bobNet")) if (o.has(k)) e.putBoolean(k, o.optBoolean(k))
        var allow = r.allow
        if (o.has("add")) { val s = cleanSite(o.optString("add")); if (s.isEmpty()) throw IllegalArgumentException("That isn't a site name I can use. Like example.com."); allow = (allow + s).distinct().take(200) }
        if (o.has("remove")) { val s = cleanSite(o.optString("remove")); allow = allow.filter { it != s } }
        e.putString("allow", allow.joinToString("\n")).apply()
        return view()
    }
}
