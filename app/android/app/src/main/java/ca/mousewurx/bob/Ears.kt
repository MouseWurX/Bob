package ca.mousewurx.bob

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject

// Bob's ears on the phone, for the voice items (2026-11-11), every one off unless switched on in Settings:
//  - "barge": Talk over Bob. Listens while he reads aloud; the first words heard stop him, the rest is your message.
//  - "wake":  "Hey Bob" wake word. Listens again and again, only while Bob's screen is showing.
//  - "once":  Hands-free. One thing you say, with no pop-up window, then the page decides what's next.
// Android's own speech recognition (on the phone itself where it can), the same as the 🎙 button, without its window.
// Everything heard goes to the page as {event: "ears", kind, mode, text}; the page decides (logic.js wakeWord, talkOver).
// Nothing is kept or sent anywhere by this class. Main thread only: SpeechRecognizer insists on it.
class Ears(private val ctx: Context, private val emit: (JSONObject) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var rec: SpeechRecognizer? = null
    @Volatile var mode = "off"
        private set
    private var bargeSaid = false
    private var misses = 0

    val available: Boolean get() = SpeechRecognizer.isRecognitionAvailable(ctx)

    fun start(newMode: String) {
        if (newMode !in listOf("barge", "wake", "once")) return stop()
        mode = newMode
        bargeSaid = false
        misses = 0
        listen()
    }

    fun stop() {
        mode = "off"
        main.removeCallbacksAndMessages(null)
        runCatching { rec?.cancel() }
    }

    fun close() {
        stop()
        runCatching { rec?.destroy() }
        rec = null
    }

    private fun send(kind: String, text: String = "") =
        emit(JSONObject().put("event", "ears").put("kind", kind).put("mode", mode).put("text", text))

    private fun listen() {
        if (mode == "off") return
        if (!available) { send("error", "no speech recognition on this phone"); mode = "off"; return }
        val r = rec ?: SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(listener); rec = it }
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, mode == "barge")
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
        runCatching { r.startListening(i) }.onFailure { again(1500) }
    }

    // Wake and barge listen again by themselves; a run of misses waits a little longer each time (battery).
    private fun again(ms: Long) {
        if (mode != "wake" && mode != "barge") { if (mode == "once") { mode = "off"; send("heard", "") }; return }
        main.postDelayed({ listen() }, ms)
    }

    private fun text(b: Bundle?): String =
        b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { send("ready") }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            // Talk over Bob: the first words heard tell the page to stop reading (it checks they aren't his own echo).
            val t = text(partialResults)
            if (mode == "barge" && !bargeSaid && t.isNotEmpty()) { bargeSaid = true; send("barge", t) }
        }

        override fun onResults(results: Bundle?) {
            val t = text(results)
            val was = mode
            misses = 0
            if (was == "once") mode = "off"
            if (t.isNotEmpty() || was == "once") send("heard", t)
            if (was == "barge") bargeSaid = false
            if (mode == "wake" || mode == "barge") again(300)
        }

        override fun onError(error: Int) {
            when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { mode = "off"; send("error", "microphone not allowed") }
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> { misses++; again(if (misses > 20) 3000 else 400) }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> again(1500)
                else -> { misses++; if (misses > 8 && mode != "once") { send("error", "speech recognition keeps failing ($error)"); stop() } else again(2000) }
            }
        }
    }
}
