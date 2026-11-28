package ca.mousewurx.bob

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.resume

// 🖐 Phone hands (off to start with): Bob opens apps, reads what's on the screen and taps, types, scrolls and swipes
// in other apps, through Android's accessibility service. Two switches, both yours: "Let Bob use apps" on the Phone
// brain page (which lists this service in Android's Accessibility settings at all), then Bob's entry in Android's
// Accessibility settings. While Bob drives, a bar across the top of the screen says so; its Stop button, or the
// volume-down key, stops him at once. Every move waits for your OK on a card at the bottom of the screen, unless
// you said "OK for the rest of this job"; taps that send, pay, delete, install or call ask every time.
// The rules (what's off limits) live in HandsRules.kt; the page's side (the tools the brain sees) in phone-hands.js.
class HandsService : AccessibilityService() {
    companion object {
        /** The service while Android has it running (you switched it on in Accessibility settings). */
        @Volatile var live: HandsService? = null
        /** Events for the page (Bridge sends them on): {type: "stop"} when you stop Bob. */
        @Volatile var listener: ((JSONObject) -> Unit)? = null
        const val MAX_ITEMS = 120

        fun component(ctx: Context) = ComponentName(ctx, HandsService::class.java)

        /** "Let Bob use apps" is on: the service is listed in Android's Accessibility settings. */
        fun allowed(ctx: Context): Boolean =
            ctx.packageManager.getComponentEnabledSetting(component(ctx)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED

        /** Bob's switch: list the service in Accessibility settings, or take it away (which also stops it). */
        fun allow(ctx: Context, on: Boolean) {
            if (!on) live?.let { s -> s.endJob(false); s.disableSelf() }
            ctx.packageManager.setComponentEnabledSetting(component(ctx),
                if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }

        /** You switched Bob on in Android's Accessibility settings. */
        fun switchedOn(ctx: Context): Boolean {
            val all = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            val me = component(ctx)
            return all.split(':').any { ComponentName.unflattenFromString(it) == me }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val wm by lazy { getSystemService(WindowManager::class.java) }
    private var bar: View? = null
    private var barWords: TextView? = null
    private var card: View? = null
    private var answerCard: ((String) -> Unit)? = null
    @Volatile private var jobOn = false
    @Volatile private var okForJob = false
    @Volatile private var stopped = false
    // What the last look numbered, so "tap 3" means the 3rd thing Bob was shown.
    private val items = HashMap<Int, AccessibilityNodeInfo>()
    @Volatile private var lookedAt = ""

    override fun onServiceConnected() { live = this }
    override fun onInterrupt() {}
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onUnbind(intent: Intent?): Boolean { closeAll(); live = null; return super.onUnbind(intent) }
    override fun onDestroy() { closeAll(); if (live === this) live = null; super.onDestroy() }

    // Volume down stops Bob while he drives (the key does nothing else then). Other keys are left alone.
    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (!jobOn || event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return false
        if (event.action == KeyEvent.ACTION_DOWN) stopNow()
        return true
    }

    fun state(): JSONObject = JSONObject().put("job", jobOn).put("okForJob", okForJob).put("stopped", stopped)

    // ---- A job: from the brain's first move to its answer ----
    fun startJob() {
        if (jobOn) return
        jobOn = true; okForJob = false; stopped = false
        main.post { showBar("🖐 Bob is using your apps. Volume down or Stop stops him.", true) }
    }

    fun endJob(done: Boolean) {
        val was = jobOn
        // The reply is over: a stop counted for that reply only, and the next one asks for OKs afresh.
        jobOn = false; okForJob = false; stopped = false
        items.clear()
        main.post {
            closeCard("no")
            if (done && was) { showBar("Bob is done.", false); main.postDelayed({ if (!jobOn) closeBar() }, 15_000) } else closeBar()
        }
    }

    private fun stopNow() {
        stopped = true; okForJob = false; jobOn = false
        main.post { closeCard("no"); showBar("Stopped. Bob won't touch anything else until you ask again.", false); main.postDelayed({ if (!jobOn) closeBar() }, 8_000) }
        listener?.invoke(JSONObject().put("type", "stop"))
    }

    // ---- Apps you can open ----
    private fun launchable(): List<Pair<String, String>> {
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return packageManager.queryIntentActivities(i, 0).map { it.loadLabel(packageManager).toString() to it.activityInfo.packageName }
            .distinctBy { it.second }.sortedBy { it.first.lowercase() }
    }

    fun apps(): JSONArray = JSONArray().also { a ->
        for ((label, pkg) in launchable()) if (HandsRules.blockedApp(pkg).isEmpty() && HandsRules.blockedName(label).isEmpty()) a.put(label)
    }

    suspend fun open(name: String): JSONObject {
        val want = name.trim().lowercase()
        if (want.isEmpty()) return said("Say which app, by the name under its icon.")
        val all = launchable()
        val hit = all.firstOrNull { it.first.lowercase() == want } ?: all.firstOrNull { it.first.lowercase().startsWith(want) } ?: all.firstOrNull { it.first.lowercase().contains(want) }
            ?: return said("There's no app called \"$name\" on this phone. Leave the name empty to list them.")
        (HandsRules.blockedApp(hit.second).ifEmpty { HandsRules.blockedName(hit.first) }).let { if (it.isNotEmpty()) return said(it) }
        if (stopped) return said(stoppedWords())
        startJob()
        if (!okFor(HandsRules.describe("open", "", hit.first), false)) return said(noWords())
        val go = packageManager.getLaunchIntentForPackage(hit.second)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) ?: return said("${hit.first} has no screen to open.")
        startActivity(go)
        delay(1200)
        return said("Opened ${hit.first}. Read the screen with app_look before you tap.").put("app", hit.first)
    }

    // ---- Reading the screen ----
    private fun label(pkg: String): String = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() }.getOrDefault(pkg)

    private fun front(): AccessibilityNodeInfo? = rootInActiveWindow

    fun look(): JSONObject {
        val root = front() ?: return said("Bob can't see the screen right now (it may be locked, or changing). Try again in a moment.")
        val pkg = root.packageName?.toString() ?: ""
        val app = label(pkg)
        HandsRules.blockedApp(pkg).let { if (it.isNotEmpty()) return said(it).put("app", app).put("blocked", true) }
        items.clear(); lookedAt = pkg
        val list = JSONArray()
        var more = 0
        var password = false
        val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
        while (queue.isNotEmpty()) {
            val n = queue.removeFirst()
            for (i in 0 until n.childCount) n.getChild(i)?.let { queue.add(it) }
            if (!n.isVisibleToUser) continue
            if (n.isPassword) password = true
            val words = (n.text?.toString() ?: "").trim()
            val desc = (n.contentDescription?.toString() ?: "").trim()
            val hint = (n.hintText?.toString() ?: "").trim()
            val tap = n.isClickable || n.isLongClickable
            if (words.isEmpty() && desc.isEmpty() && hint.isEmpty() && !tap && !n.isEditable && !n.isScrollable) continue
            if (list.length() >= MAX_ITEMS) { more++; continue }
            val num = list.length() + 1
            items[num] = n
            val r = Rect().also { n.getBoundsInScreen(it) }
            val can = JSONArray()
            if (tap || clickableParent(n) != null) can.put("tap")
            if (n.isEditable && !n.isPassword) can.put("type")
            if (n.isScrollable) can.put("scroll")
            list.put(JSONObject().put("n", num).put("kind", kindOf(n))
                .put("text", if (n.isPassword) "(a password field: Bob never reads or types in these)" else words.take(200))
                .put("desc", desc.take(120)).put("hint", hint.take(80))
                .put("checked", if (n.isCheckable) n.isChecked else JSONObject.NULL)
                .put("can", can).put("x", r.centerX()).put("y", r.centerY()))
        }
        val title = windows.firstOrNull { it.isActive }?.title?.toString() ?: ""
        return JSONObject().put("ok", true).put("app", app).put("items", list).put("more", more)
            .put("signIn", password || HandsRules.securityScreen(title))
            .put("width", resources.displayMetrics.widthPixels).put("height", resources.displayMetrics.heightPixels)
    }

    private fun kindOf(n: AccessibilityNodeInfo): String {
        val c = n.className?.toString()?.substringAfterLast('.') ?: ""
        return when {
            n.isEditable -> "field"
            n.isCheckable && c.contains("Switch") -> "switch"
            n.isCheckable -> "checkbox"
            c.contains("Button") -> "button"
            n.isScrollable -> "list"
            c.contains("Image") -> "picture"
            n.isClickable -> "button"
            else -> "text"
        }
    }

    private fun clickableParent(n: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var p = n.parent
        var hops = 0
        while (p != null && hops < 4) { if (p.isClickable) return p; p = p.parent; hops++ }
        return null
    }

    // ---- Doing one thing ----
    suspend fun act(o: JSONObject): JSONObject {
        val action = o.optString("action")
        if (stopped) return said(stoppedWords())
        startJob()
        val root = front()
        val pkg = root?.packageName?.toString() ?: ""
        val app = label(pkg)
        if (action == "home") {
            if (!okFor(HandsRules.describe("home", app, ""), false)) return said(noWords())
            performGlobalAction(GLOBAL_ACTION_HOME); delay(700)
            return said("Went to the home screen.")
        }
        HandsRules.blockedApp(pkg).let { if (it.isNotEmpty()) return said(it) }
        if (action == "back") {
            if (!okFor(HandsRules.describe("back", app, ""), false)) return said(noWords())
            performGlobalAction(GLOBAL_ACTION_BACK); delay(700)
            return after("Pressed Back")
        }
        if (action == "swipe" || (action == "scroll" && !o.has("item"))) {
            val dir = o.optString("direction", "down").lowercase()
            if (dir !in listOf("up", "down", "left", "right")) return said("Say direction: up, down, left or right.")
            if (!okFor(HandsRules.describe(action, app, dir), false)) return said(noWords())
            // Scrolling down shows what's below, so the finger moves up the screen.
            val down = if (action == "scroll") dir else when (dir) { "up" -> "down"; "down" -> "up"; "left" -> "right"; else -> "left" }
            swipe(down)
            return after("${if (action == "scroll") "Scrolled" else "Swiped"} $dir")
        }
        if (action == "tap_at") {
            val x = o.optDouble("x", Double.NaN); val y = o.optDouble("y", Double.NaN)
            if (x.isNaN() || y.isNaN()) return said("Give x and y, from app_look.")
            whoIsAt(x.toInt(), y.toInt()).let { if (it.isNotEmpty()) return said(it) }
            // Bob can't tell what's under a bare spot, so this one always asks.
            if (!okFor(HandsRules.describe("tap_at", app, "${x.toInt()}, ${y.toInt()}"), true)) return said(noWords())
            tap(x.toFloat(), y.toFloat(), 60)
            return after("Tapped at ${x.toInt()}, ${y.toInt()}")
        }
        if (lookedAt != pkg) return said("$app is in front now, not the app Bob last read. Use app_look first.")
        val n = o.optInt("item", 0)
        val node = items[n] ?: return said("There's no item $n. Use the numbers from the last app_look.")
        if (!node.refresh() || !node.isVisibleToUser) return said("Item $n isn't on the screen any more. Use app_look to read it again.")
        if (node.isPassword) return said("That's a password field. Bob never reads or types in these: that one's yours.")
        val name = listOf(node.text, node.contentDescription, node.hintText).firstOrNull { !it.isNullOrBlank() }?.toString()?.trim() ?: "item $n"
        when (action) {
            "tap", "long_press" -> {
                if (!okFor(HandsRules.describe(action, app, name), HandsRules.risky(name))) return said(noWords())
                val target = if (if (action == "tap") node.isClickable else node.isLongClickable) node else clickableParent(node)
                val did = target?.performAction(if (action == "tap") AccessibilityNodeInfo.ACTION_CLICK else AccessibilityNodeInfo.ACTION_LONG_CLICK) == true
                if (!did) { val r = Rect().also { node.getBoundsInScreen(it) }; tap(r.exactCenterX(), r.exactCenterY(), if (action == "tap") 60 else 800) }
                return after("${if (action == "tap") "Tapped" else "Pressed and held"} \"$name\"")
            }
            "type" -> {
                if (!node.isEditable) return said("\"$name\" isn't a field you can type in. Pick one whose kind is field.")
                val text = HandsRules.cleanTyping(o.optString("text"))
                if (!okFor(HandsRules.describe("type", app, name, text), false)) return said(noWords())
                val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
                if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return said("\"$name\" wouldn't take the words. Nothing was typed.")
                delay(300); node.refresh()
                return after("Typed into \"$name\". It now says: \"${node.text?.toString()?.take(200) ?: ""}\"")
            }
            "scroll" -> {
                val dir = o.optString("direction", "down").lowercase()
                if (!okFor(HandsRules.describe("scroll", app, "\"$name\" $dir"), false)) return said(noWords())
                val a = if (dir == "up" || dir == "left") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                if (!node.performAction(a)) return said("\"$name\" didn't scroll (it may be at the end).")
                return after("Scrolled \"$name\" $dir")
            }
        }
        return said("\"$action\" isn't something Bob's hands do. Use tap, long_press, type, scroll, swipe, tap_at, back or home.")
    }

    // What's in front after a move: the app and how many things are on screen, so the brain knows to look again.
    private suspend fun after(did: String): JSONObject {
        delay(800)
        val pkg = front()?.packageName?.toString() ?: ""
        val app = if (pkg.isEmpty()) "" else label(pkg)
        items.clear(); lookedAt = ""
        return said("$did.${if (app.isNotEmpty()) " $app is in front now." else ""} Use app_look to see what changed.").put("app", app)
    }

    // The window a bare tap would land in: never Bob's own, an off-limits app's, or an overlay (like Bob's OK card).
    private fun whoIsAt(x: Int, y: Int): String {
        val r = Rect()
        for (w in windows.sortedByDescending { it.layer }) {
            w.getBoundsInScreen(r)
            if (!r.contains(x, y)) continue
            if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY || w.type == AccessibilityWindowInfo.TYPE_SYSTEM) return "That spot is on Android's or Bob's own bar, so Bob won't tap it."
            return HandsRules.blockedApp(w.root?.packageName?.toString())
        }
        return "Nothing is at that spot."
    }

    private suspend fun gesture(p: Path, ms: Long): Boolean = suspendCancellableCoroutine { k ->
        val g = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, ms)).build()
        val ok = dispatchGesture(g, object : GestureResultCallback() {
            override fun onCompleted(d: GestureDescription?) { if (k.isActive) k.resume(true) }
            override fun onCancelled(d: GestureDescription?) { if (k.isActive) k.resume(false) }
        }, null)
        if (!ok && k.isActive) k.resume(false)
    }

    private suspend fun tap(x: Float, y: Float, ms: Long) = gesture(Path().apply { moveTo(x, y) }, ms)

    // A finger moving towards `way` across the middle of the screen.
    private suspend fun swipe(way: String) {
        val w = resources.displayMetrics.widthPixels.toFloat(); val h = resources.displayMetrics.heightPixels.toFloat()
        val (x0, y0, x1, y1) = when (way) {
            "up" -> listOf(w / 2, h * 0.7f, w / 2, h * 0.3f)
            "down" -> listOf(w / 2, h * 0.3f, w / 2, h * 0.7f)
            "left" -> listOf(w * 0.8f, h / 2, w * 0.2f, h / 2)
            else -> listOf(w * 0.2f, h / 2, w * 0.8f, h / 2)
        }
        gesture(Path().apply { moveTo(x0, y0); lineTo(x1, y1) }, 350)
    }

    private fun said(words: String) = JSONObject().put("text", words)
    private fun noWords() = "You said no, so Bob didn't do it. Ask what they'd like instead, or carry on another way."
    private fun stoppedWords() = "You stopped Bob's hands. He won't touch anything else in this reply. Say what you did and stop."

    // ---- Your OK: a card at the bottom of the screen, over whatever app is in front ----
    private suspend fun okFor(words: String, always: Boolean): Boolean {
        if (okForJob && !always) return true
        val said = withTimeoutOrNull(120_000) {
            suspendCancellableCoroutine { k ->
                main.post { showCard(words, !always) { a -> if (k.isActive) k.resume(a) } }
                k.invokeOnCancellation { main.post { closeCard("no") } }
            }
        } ?: run { main.post { closeCard("no") }; "no" }
        if (said == "job") okForJob = true
        return said == "yes" || said == "job"
    }

    private fun overlay(gravity: Int) = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT).apply { this.gravity = gravity }

    private fun box(color: Int) = LinearLayout(this).apply {
        setPadding(dp(14), dp(10), dp(14), dp(10))
        background = GradientDrawable().apply { setColor(color); cornerRadius = dp(14).toFloat() }
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private fun button(words: String, go: () -> Unit) = Button(this).apply { text = words; isAllCaps = false; setOnClickListener { go() } }

    private fun showBar(words: String, driving: Boolean) {
        closeBar()
        val b = box(if (driving) Color.rgb(176, 32, 32) else Color.rgb(40, 44, 52)).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val t = TextView(this).apply { text = words; setTextColor(Color.WHITE); textSize = 14f; layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f) }
        b.addView(t)
        if (driving) b.addView(button("Stop") { stopNow() })
        b.addView(button("Back to Bob") { backToBob() })
        if (!driving) b.addView(button("✕") { closeBar() })
        runCatching { wm.addView(b, overlay(Gravity.TOP)) }.onSuccess { bar = b; barWords = t }
    }

    private fun closeBar() { bar?.let { runCatching { wm.removeView(it) } }; bar = null; barWords = null }

    private fun showCard(words: String, offerJob: Boolean, done: (String) -> Unit) {
        closeCard("no")
        val c = box(Color.rgb(28, 31, 38)).apply { orientation = LinearLayout.VERTICAL }
        c.addView(TextView(this).apply { text = "Bob wants to: $words"; setTextColor(Color.WHITE); textSize = 16f })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(button("OK") { closeCard("yes") })
        row.addView(button("No") { closeCard("no") })
        if (offerJob) row.addView(button("OK for this job") { closeCard("job") })
        c.addView(row)
        answerCard = done
        runCatching { wm.addView(c, overlay(Gravity.BOTTOM)) }.onSuccess { card = c }.onFailure { answerCard = null; done("no") }
    }

    private fun closeCard(answer: String) {
        card?.let { runCatching { wm.removeView(it) } }
        card = null
        val a = answerCard; answerCard = null
        a?.invoke(answer)
    }

    private fun closeAll() { main.post { closeCard("no"); closeBar() } }

    fun backToBob() {
        closeBar()
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }
}
