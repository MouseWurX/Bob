package ca.mousewurx.bob

import android.os.Build
import org.json.JSONObject
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

// "Pair with my other Bobs" (Bob-Net pairing v1, the same protocol desktop Bob speaks, src/bob-net-pair.js).
// Two presses instead of typing addresses and passcodes: Pair on one Bob, "Yes, pair us" on the other, and the two
// swap passcodes over Tailscale. Nothing switches on by itself: pairing only fills the lists.
//
// This phone being asked (only while "Lend my brain" has the door open, Tailscale addresses only, before the passcode):
//   GET  /api/pair/hello                       -> {bob, pair: 1, name, device: 'phone', version, door: true}
//   POST /api/pair/ask    {pair, name, address, code}  -> {id}   (a card on the phone; address must be the caller's own)
//   POST /api/pair/status {id}                 -> {state: waiting|no|gone} or {state: yes, passcode, name, address} (once)
//   POST /api/pair/finish {id, passcode?}      -> {ok, added}
// The phone never keeps its passcode in readable form, so each pairing gets a passcode of its own (kept as a
// fingerprint like the main one). "Make a new passcode" drops them all.
// This phone asking ("Pair by address", since the phone can't list Tailscale devices): ask, wait for the yes, log in
// with the other Bob's passcode, then hand over a pairing passcode of ours if "Lend my brain" is on.
//
// "Pass my Bob-Net along" (off): a Bob of yours that is paired with this phone and with a third Bob introduces them
// (the same addition desktop Bob speaks, src/bob-net-party.js). The phone only answers, never introduces:
//   POST /api/bob-net/introduce {pair, token, role, from, bob: {name, address, device}}   (signed in, through the door)
//        -> {ok, expecting: true} | 409 {busy: 'off'} | 400. The token is kept for that address for 3 minutes, once.
//   POST /api/pair/ask carrying that token -> yes at once, no card; a token nobody here handed out -> 403, nothing kept.
// Passcodes still pass only between the two Bobs being paired, after that yes, exactly as with the card.
class Pairing(private val app: BobApp) {
    companion object {
        const val PAIR = 1
        private const val ASK_FOR_MS = 3 * 60_000L
        private const val ASKS_A_MINUTE = 3
    }

    private class Ask(val id: String, val name: String, val address: String, val ip: String, val code: String) {
        @Volatile var at = System.currentTimeMillis()
        @Volatile var state = "waiting"
        @Volatile var handed = false
        @Volatile var finished = false
        @Volatile var by: String? = null // the Bob that introduced this asker (Pass my Bob-Net along), else null
    }
    private class Expect(val token: String, val from: String, val name: String, val at: Long = System.currentTimeMillis())

    private val asks = ConcurrentHashMap<String, Ask>()
    private val expected = ConcurrentHashMap<String, Expect>() // address -> the introduction this phone was told to expect
    private val askTimes = ArrayList<Long>()
    private val rnd = SecureRandom()
    private val net by lazy { NetBob(app) }

    /** Cards and results for the page: {type: pair-ask | pair-gone | pair-done | pair-state, ...}. */
    @Volatile var listener: ((JSONObject) -> Unit)? = null
    private val missed = ArrayList<JSONObject>() // pair-done while Bob's screen was closed
    private fun tell(o: JSONObject) {
        val l = listener
        if (l != null) l(o) else if (o.optString("type") == "pair-done") synchronized(missed) { missed.add(o) }
        if (o.optString("type") == "pair-ask" && !app.bobVisible) app.notifyPair(o.optString("name"))
    }

    private fun clean(s: String?, n: Int = 40) = (s ?: "").replace(Regex("[\\u0000-\\u001f<>\"'`]"), "").trim().take(n)

    /** The phone's name on Bob-Net ("Galaxy S22"). */
    fun myName(): String = clean(runCatching { android.provider.Settings.Global.getString(app.contentResolver, "device_name") }.getOrNull())
        .ifEmpty { clean(Build.MODEL) }.ifEmpty { "Phone" }

    // ---------- This phone being asked ----------
    fun hello(): JSONObject = JSONObject().put("bob", true).put("pair", PAIR).put("name", myName()).put("device", "phone")
        .put("version", app.version).put("door", true)

    private fun tidy() {
        val now = System.currentTimeMillis()
        for (a in asks.values) if (now - a.at > ASK_FOR_MS) { asks.remove(a.id); if (a.state == "waiting") tell(JSONObject().put("type", "pair-gone").put("id", a.id)) }
        for ((k, e) in expected) if (now - e.at > ASK_FOR_MS) expected.remove(k)
    }

    private fun card(a: Ask) = JSONObject().put("type", "pair-ask").put("id", a.id).put("name", a.name).put("address", a.address).put("number", a.code)

    /** Returns (HTTP status, body). */
    @Synchronized fun ask(b: JSONObject, remoteIp: String): Pair<Int, JSONObject> {
        tidy()
        if (b.optInt("pair") != PAIR) return 400 to JSONObject().put("error", "Different Bob-Net pairing. Update both Bobs.")
        val address = clean(b.optString("address"), 80)
        val base = NetBob.base(address)
        if (base == null || address.substringBefore(':') != remoteIp) return 400 to JSONObject().put("error", "That address isn't the one you called from.")
        val code = b.optString("code")
        if (!Regex("^\\d{4}$").matches(code)) return 400 to JSONObject().put("error", "no number")
        val now = System.currentTimeMillis()
        askTimes.removeAll { now - it > 60_000 }
        if (askTimes.size >= ASKS_A_MINUTE) return 429 to JSONObject().put("error", "Too many pairing asks. Wait a minute.")
        for (a in asks.values) if (a.ip == remoteIp && a.state == "waiting") { asks.remove(a.id); tell(JSONObject().put("type", "pair-gone").put("id", a.id)) }
        askTimes.add(now)
        val id = ByteArray(16).also { rnd.nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val a = Ask(id, clean(b.optString("name")).ifEmpty { remoteIp }, address, remoteIp, code)
        // An ask carrying the token one of your Bobs gave us for this address is a yes at once, no card. A token
        // nobody gave us is refused outright (never a card for a stranger's guess).
        if (b.has("token")) {
            val by = vouched(base.removePrefix("http://"), b.optString("token")) ?: return 403 to JSONObject().put("error", "Nobody here is expecting that introduction.")
            a.state = "yes"; a.by = by
            asks[id] = a
            return 200 to JSONObject().put("id", id)
        }
        asks[id] = a
        tell(card(a))
        return 200 to JSONObject().put("id", id)
    }

    // ---------- Pass my Bob-Net along: this phone being introduced to a third Bob ----------
    /** Returns (HTTP status, body). `open` = the switch is on and the door is open. */
    @Synchronized fun introduce(b: JSONObject, remoteIp: String, open: Boolean): Pair<Int, JSONObject> {
        tidy()
        if (!open) return 409 to JSONObject().put("busy", "off")
        if (b.optInt("pair") != PAIR) return 400 to JSONObject().put("error", "Different Bob-Net pairing. Update both Bobs.")
        val token = b.optString("token")
        if (!Regex("^[0-9a-f]{32}$").matches(token)) return 400 to JSONObject().put("error", "no token")
        val bob = b.optJSONObject("bob") ?: JSONObject()
        val base = NetBob.base(clean(bob.optString("address"), 80)) ?: return 400 to JSONObject().put("error", "That isn't a Tailscale address.")
        val address = base.removePrefix("http://")
        if (address.substringBefore(':') == remoteIp || address.substringBefore(':') == app.lend.myTailscaleIp()) return 400 to JSONObject().put("error", "That's you.")
        val from = clean(b.optString("from")).ifEmpty { remoteIp }
        // The phone never asks, so the role makes no difference here: whoever is introduced may ask us with this token.
        expected[address] = Expect(token, from, clean(bob.optString("name")).ifEmpty { address.substringBefore(':') })
        return 200 to JSONObject().put("ok", true).put("expecting", true)
    }

    /** The name of the Bob that vouched for this address with this token, or null. The token is good once. */
    private fun vouched(address: String, token: String): String? {
        val e = expected[address] ?: return null
        if (e.token != token || token.isEmpty()) return null
        expected.remove(address)
        return e.from
    }

    /** Cards still waiting, for Bob's screen when it opens after the ask came in. */
    fun waiting(): List<JSONObject> { tidy(); return asks.values.filter { it.state == "waiting" }.map { card(it) } }

    /** You tapped Yes or No on the card. */
    fun answer(id: String, yes: Boolean): JSONObject {
        tidy()
        val a = asks[id]
        if (a == null || a.state != "waiting") return JSONObject().put("ok", false).put("why", "That pairing card is too old now. Press Pair again on the other Bob.")
        if (yes && app.lend.state != "open") return JSONObject().put("ok", false).put("why", "Turn on Lend my brain here first.")
        a.state = if (yes) "yes" else "no"
        a.at = System.currentTimeMillis()
        tell(JSONObject().put("type", "pair-gone").put("id", a.id))
        return JSONObject().put("ok", true).put("name", a.name)
    }

    fun status(b: JSONObject, remoteIp: String): JSONObject {
        tidy()
        val a = asks[b.optString("id")]
        if (a == null || a.ip != remoteIp) return JSONObject().put("state", "gone")
        if (a.state != "yes") return JSONObject().put("state", a.state)
        if (a.handed) return JSONObject().put("state", "gone")
        a.handed = true // a passcode for this Bob only, handed over once
        return JSONObject().put("state", "yes").put("passcode", app.lend.pairPasscode(a.name)).put("name", myName()).put("address", app.lend.address ?: "")
    }

    /** The other Bob's passcode, after our yes: this phone logs in to him and he joins the Bob-Net page. */
    fun finish(b: JSONObject, remoteIp: String): JSONObject {
        val a = asks[b.optString("id")]
        if (a == null || a.ip != remoteIp || a.state != "yes" || a.finished) return JSONObject().put("ok", false)
        a.finished = true
        asks.remove(a.id)
        val passcode = b.optString("passcode").trim()
        var added = false
        if (passcode.length >= 6) {
            val base = NetBob.base(a.address)
            added = base != null && runCatching { net.login(base, passcode) }.getOrNull() == "ok"
        }
        tell(JSONObject().put("type", "pair-done").put("name", a.name).put("address", a.address).put("both", added).put("added", added).apply { a.by?.let { put("by", it) } })
        return JSONObject().put("ok", true).put("added", added)
    }

    // ---------- This phone asking ----------
    @Volatile private var outgoing: JSONObject? = null

    /** Ask the Bob at that address. Returns at once with the number to match; the answer is collected in the background. */
    fun pairWith(addressIn: String): JSONObject {
        val base = NetBob.base(addressIn) ?: return JSONObject().put("error", "That isn't a Tailscale address. It looks like 100.x.y.z or name.something.ts.net.")
        val address = base.removePrefix("http://")
        outgoing?.let { if (it.optString("address") == address && it.optString("state") == "waiting") return it }
        val mine = app.lend.myTailscaleIp() ?: return JSONObject().put("error", "This phone isn't on Tailscale right now. Open Tailscale and switch it on, then try again.")
        val code = (1000 + rnd.nextInt(9000)).toString()
        // His name, for "Waiting for a yes on <name>" (the hello needs no passcode).
        val theirName = runCatching { clean(JSONObject(net.get(base, "/api/pair/hello").body).optString("name")) }.getOrDefault("")
        val r = runCatching {
            net.post(base, "/api/pair/ask", JSONObject().put("pair", PAIR).put("name", myName()).put("address", "$mine:${LendServer.PORT}").put("code", code).toString())
        }.getOrElse { return JSONObject().put("error", "No Bob answered there. Is Bob open on it, with \"Let my other replicant matrices in\" on?") }
        val j = runCatching { JSONObject(r.body) }.getOrDefault(JSONObject())
        if (r.status == 403) return JSONObject().put("error", "That Bob's door is shut. Turn on \"Let my other replicant matrices in\" there, then tap Pair again.")
        if (r.status == 404) return JSONObject().put("error", "That Bob is too old to pair. Update him, or add him with his passcode instead.")
        val id = j.optString("id")
        if (r.status != 200 || id.isEmpty()) return JSONObject().put("error", j.optString("error").ifEmpty { "That Bob said no (${r.status})." })
        val job = JSONObject().put("type", "pair-state").put("address", address).put("state", "waiting").put("number", code).put("name", theirName)
        outgoing = job
        Thread({ collect(base, address, id, job) }, "bob-pair").apply { isDaemon = true; start() }
        return job
    }

    private fun collect(base: String, address: String, id: String, job: JSONObject) {
        val since = System.currentTimeMillis()
        var quiet = 0
        fun post(path: String, body: JSONObject): JSONObject = runCatching { JSONObject(net.post(base, path, body.toString()).body) }.getOrElse { JSONObject().put("state", "quiet") }
        fun done(state: String, extra: JSONObject.() -> Unit = {}) { job.put("state", state); job.extra(); tell(JSONObject(job.toString())) }
        while (System.currentTimeMillis() - since < ASK_FOR_MS + 10_000) {
            try { Thread.sleep(2000) } catch (_: InterruptedException) { return }
            val s = post("/api/pair/status", JSONObject().put("id", id))
            when (s.optString("state")) {
                "quiet" -> { if (++quiet >= 10) break; continue }
                "waiting" -> { quiet = 0; continue }
                "no" -> return done("no")
                "yes" -> {
                    val name = clean(s.optString("name")).ifEmpty { address.substringBefore(':') }
                    val ok = runCatching { net.login(base, s.optString("passcode")) }.getOrNull() == "ok"
                    if (!ok) { post("/api/pair/finish", JSONObject().put("id", id)); return done("failed") { put("name", name).put("why", "the passcode it sent didn't work") } }
                    // Ours goes over only now, after their yes, and only while Lend my brain is on (else they couldn't use it).
                    val ours = if (app.lend.state == "open") app.lend.pairPasscode(name) else ""
                    post("/api/pair/finish", JSONObject().put("id", id).put("passcode", ours))
                    tell(JSONObject().put("type", "pair-done").put("name", name).put("address", address).put("both", ours.isNotEmpty()).put("added", true).put("asker", true))
                    return done("paired") { put("name", name).put("both", ours.isNotEmpty()) }
                }
                else -> break
            }
        }
        done("timeout")
    }

    /** Results that came in while Bob's screen was closed. */
    fun takeMissed(): List<JSONObject> = synchronized(missed) { missed.toList().also { missed.clear() } }
}
