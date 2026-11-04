package ca.mousewurx.bob

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

// The one door between Bob's phone page and Android. The page calls BobPhone.call('{"id":..,"op":..}');
// the answer comes back as window.bob.fromPhone({id, ok, result | error}). Things that happen later
// (reply words, download progress, events from a networked Bob) come back as {event: ...}.
class Bridge(private val activity: MainActivity, private val web: WebView) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val net = NetBob(activity)
    private val app = activity.application as BobApp
    private val brain = app.brain.also { b -> b.listener = { send(JSONObject(it).put("event", "brain")) } }
    init { app.pair.listener = { send(JSONObject().put("event", "pair").put("data", it)) } }
    private val listening = ConcurrentHashMap<String, Boolean>()
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var micCall: String? = null
    private var photoCall: String? = null
    @Volatile private var photo: ByteArray? = null // the picked photo, until it's sent or cleared
    private var pendingMicStart: (() -> Unit)? = null
    private var pendingNotify: (() -> Unit)? = null
    @Volatile private var inBackground = false

    companion object {
        const val MIC_REQUEST = 7001
        const val MIC_PERMISSION = 7002
        const val NOTIFY_PERMISSION = 7003
        const val PHOTO_REQUEST = 7004
        const val CHANNEL = "bob"
    }

    private fun send(o: JSONObject) {
        val js = "window.bob && window.bob.fromPhone(" + JSONObject.quote(o.toString()) + ")"
        web.post { web.evaluateJavascript(js, null) }
    }

    private fun answer(id: String, result: Any?) = send(JSONObject().put("id", id).put("ok", true).put("result", result ?: JSONObject.NULL))
    private fun fail(id: String, error: String) = send(JSONObject().put("id", id).put("ok", false).put("error", error))

    private fun base(o: JSONObject): String = NetBob.base(o.getString("address")) ?: throw IllegalArgumentException("not a Tailscale address")

    @JavascriptInterface
    fun call(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val id = o.optString("id")
        scope.launch {
            try {
                when (o.getString("op")) {
                    // ---- Bobs on your network ----
                    "net.check" -> answer(id, JSONObject().put("base", NetBob.base(o.getString("address")) ?: JSONObject.NULL))
                    "net.login" -> answer(id, net.login(base(o), o.getString("code")))
                    "net.signedIn" -> answer(id, net.signedIn(base(o)))
                    "net.forget" -> { val b = base(o); listening[b] = false; net.forget(b); answer(id, true) }
                    "net.get" -> { val r = net.get(base(o), o.getString("path")); answer(id, JSONObject().put("status", r.status).put("body", r.body)) }
                    "net.post" -> { val r = net.post(base(o), o.getString("path"), o.optString("body", "{}")); answer(id, JSONObject().put("status", r.status).put("body", r.body)) }
                    // ---- A photo for a Bob on your network to work on (Android's own photo picker: no permission needed) ----
                    "photo.pick" -> activity.runOnUiThread {
                        photoCall?.let { fail(it, "replaced") }
                        photoCall = id
                        runCatching { activity.startActivityForResult(Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*"), PHOTO_REQUEST) }
                            .onFailure { photoCall = null; fail(id, "this phone has no photo picker") }
                    }
                    "photo.clear" -> { photo = null; answer(id, true) }
                    "photo.upload" -> {
                        val bytes = photo ?: throw IllegalStateException("no photo picked")
                        val name = URLEncoder.encode(o.optString("name", "Photo from the phone").take(60), "UTF-8")
                        val r = net.upload(base(o), "/api/refs?kind=chat&name=$name", bytes, "image/jpeg")
                        if (r.status == 200) photo = null
                        answer(id, JSONObject().put("status", r.status).put("body", r.body))
                    }
                    // ---- Pair with my other Bobs ----
                    "pair.with" -> answer(id, app.pair.pairWith(o.getString("address")))
                    "pair.answer" -> answer(id, app.pair.answer(o.getString("id"), o.getBoolean("yes")))
                    "pair.waiting" -> answer(id, JSONArray(app.pair.waiting() + app.pair.takeMissed()))
                    "net.media" -> answer(id, net.media(base(o), o.getString("path")))
                    "net.listen" -> {
                        val b = base(o)
                        if (listening.put(b, true) != true) {
                            answer(id, true)
                            net.listen(b, { listening[b] != true },
                                { ev -> send(JSONObject().put("event", "net").put("base", b).put("data", ev)); maybeNotify(ev) },
                                { up -> send(JSONObject().put("event", "net-state").put("base", b).put("up", up)) })
                            listening.remove(b)
                        } else answer(id, true)
                    }
                    "net.unlisten" -> { listening[base(o)] = false; answer(id, true) }

                    // ---- The phone brain ----
                    "brain.status" -> answer(id, JSONObject(brain.status()))
                    "brain.config" -> { brain.freeWhenIdle = o.optBoolean("freeWhenIdle", true); brain.idleMinutes = o.optInt("idleMinutes", 5).coerceIn(1, 120); answer(id, true) }
                    "brain.download" -> { brain.download(o.getString("file"), o.getString("url"), o.getLong("bytes"), o.getString("sha256")); answer(id, true) }
                    "brain.pause" -> { brain.pauseDownload(); answer(id, true) }
                    "brain.cancel" -> { brain.cancelDownload(o.getString("file")); answer(id, true) }
                    "brain.delete" -> answer(id, brain.delete(o.getString("file")))
                    "brain.chat" -> { brain.chat(o.getString("file"), o.getString("system"), o.optJSONArray("history") ?: org.json.JSONArray(), o.getString("text"), o.optString("note"), o.optInt("maxTokens", 768)); answer(id, true) }
                    "brain.stop" -> { brain.stop(); answer(id, true) }
                    "brain.unload" -> { brain.unload("asked"); answer(id, true) }
                    "brain.bench" -> { brain.bench(o.getString("file")); answer(id, true) }

                    // ---- Lend my brain (off unless you turn it on) ----
                    "lend.status" -> answer(id, app.lend.status())
                    "lend.brain" -> { app.lend.setBrain(o.getString("file"), o.optString("label")); answer(id, true) }
                    "lend.on" -> {
                        val on = o.getBoolean("on")
                        if (on && !app.lend.settings.passcodeSet) fail(id, "make a passcode first")
                        else { activity.runOnUiThread { app.lend.setOn(on) }; answer(id, true) }
                    }
                    "lend.newPasscode" -> answer(id, app.lend.newPasscode())
                    "lend.screenOff" -> activity.runOnUiThread {
                        // Android's own list of apps allowed to work with the screen off: Bob, Battery, Unrestricted.
                        runCatching { activity.startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                        answer(id, true)
                    }

                    // ---- Microphone and voice (Android's own) ----
                    "speech.listen" -> activity.runOnUiThread { listen(id) }
                    "speech.say" -> activity.runOnUiThread { say(o.getString("text"), o.optDouble("rate", 1.0)); answer(id, true) }
                    "speech.quiet" -> activity.runOnUiThread { tts?.stop(); answer(id, true) }

                    // ---- Phone bits ----
                    "notify" -> activity.runOnUiThread { notifyNow(o.getString("title"), o.getString("text")); answer(id, true) }
                    "open" -> activity.runOnUiThread { activity.openLink(o.getString("url")); answer(id, true) }
                    "copy" -> activity.runOnUiThread {
                        val cm = activity.getSystemService(android.content.ClipboardManager::class.java)
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("Bob", o.getString("text"))); answer(id, true)
                    }
                    "device" -> answer(id, JSONObject().put("model", Build.MODEL).put("maker", Build.MANUFACTURER).put("android", Build.VERSION.RELEASE)
                        .put("version", activity.packageManager.getPackageInfo(activity.packageName, 0).versionName))
                    else -> fail(id, "unknown op")
                }
            } catch (e: Exception) {
                fail(id, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    // ---- Microphone: Android's speech recognition (on the S22 it runs on the phone itself) ----
    private fun listen(id: String) {
        val start = {
            micCall = id
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Bob")
            try {
                @Suppress("DEPRECATION")
                activity.startActivityForResult(i, MIC_REQUEST)
            } catch (e: Exception) { micCall = null; fail(id, "no speech recognition on this phone") }
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) start()
        else { pendingMicStart = start; micCall = id; activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC_PERMISSION) }
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == PHOTO_REQUEST) {
            val id = photoCall ?: return
            photoCall = null
            val uri = data?.data ?: return answer(id, null) // picker closed: nothing picked
            scope.launch {
                try { answer(id, readPhoto(uri)) } catch (e: Exception) { fail(id, "that picture wouldn't open") }
            }
            return
        }
        if (requestCode != MIC_REQUEST) return
        val id = micCall ?: return
        micCall = null
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        answer(id, text ?: "")
    }

    // Reads the picked photo upright (ImageDecoder follows the camera's rotation), at most 2048 px on its long side,
    // as a JPEG kept for photo.upload. The page gets a small preview only.
    private fun readPhoto(uri: Uri): JSONObject {
        fun decode(max: Int): Bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(activity.contentResolver, uri)) { d, info, _ ->
            val w = info.size.width; val h = info.size.height
            val scale = minOf(1.0, max.toDouble() / maxOf(w, h))
            d.setTargetSize(maxOf(1, (w * scale).toInt()), maxOf(1, (h * scale).toInt()))
            d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        fun jpeg(b: Bitmap, q: Int) = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, q, it) }.toByteArray()
        val big = decode(2048)
        val bytes = jpeg(big, 90)
        big.recycle()
        if (bytes.size > 14_000_000) throw IllegalStateException("too big")
        photo = bytes
        val small = decode(256)
        val preview = "data:image/jpeg;base64," + Base64.encodeToString(jpeg(small, 75), Base64.NO_WRAP)
        small.recycle()
        return JSONObject().put("preview", preview).put("bytes", bytes.size)
    }

    fun onPermission(requestCode: Int, grants: IntArray) {
        val ok = grants.isNotEmpty() && grants[0] == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            MIC_PERMISSION -> { val go = pendingMicStart; pendingMicStart = null; if (ok) go?.invoke() else { micCall?.let { fail(it, "microphone not allowed") }; micCall = null } }
            NOTIFY_PERMISSION -> { val go = pendingNotify; pendingNotify = null; if (ok) go?.invoke() }
        }
    }

    // ---- Read aloud: Android's own voices ----
    private fun say(text: String, rate: Double) {
        val speak = { tts?.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2f)); tts?.speak(text.take(4000), TextToSpeech.QUEUE_FLUSH, null, "bob") }
        if (tts == null) tts = TextToSpeech(activity) { st -> ttsReady = st == TextToSpeech.SUCCESS; if (ttsReady) { tts?.language = Locale.getDefault(); speak() } }
        else if (ttsReady) speak()
    }

    // ---- Notifications: only while Bob's screen isn't showing ----
    private fun maybeNotify(ev: JSONObject) {
        if (!inBackground) return
        when (ev.optString("type")) {
            "approval" -> notifyNow("Bob needs an OK", ev.optString("text").take(140))
            "checkin" -> {
                val items = ev.optJSONArray("items") ?: JSONArray()
                val titles = (0 until minOf(items.length(), 5)).mapNotNull { items.optJSONObject(it)?.optString("title")?.takeIf { t -> t.isNotBlank() } }
                if (titles.isNotEmpty()) notifyNow("Bob: check-in", titles.joinToString(", ").take(140))
            }
            "done" -> send(JSONObject().put("event", "net-done-bg").put("turnId", ev.optString("turnId")))
        }
    }

    private fun notifyNow(title: String, text: String) {
        val nm = activity.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, activity.getString(R.string.notify_channel), NotificationManager.IMPORTANCE_DEFAULT))
        val go = {
            val open = PendingIntent.getActivity(activity, 0, Intent(activity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(activity, CHANNEL).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(text)
                .setContentIntent(open).setAutoCancel(true).build()
            try { NotificationManagerCompat.from(activity).notify((System.currentTimeMillis() % 100000).toInt(), n) } catch (_: SecurityException) {}
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) go()
        // Android only asks while Bob's screen is showing; in the background without permission, Bob stays quiet.
        else if (!inBackground) { pendingNotify = go; activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFY_PERMISSION) }
    }

    fun onBackground() { inBackground = true; send(JSONObject().put("event", "app").put("visible", false)) }
    fun onForeground() { inBackground = false; send(JSONObject().put("event", "app").put("visible", true)) }

    fun close() {
        brain.listener = null // the phone brain stays (it may be lending); only this screen goes
        app.pair.listener = null
        listening.keys.forEach { listening[it] = false }
        tts?.shutdown()
        scope.cancel()
    }
}
