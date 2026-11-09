package ca.mousewurx.bob

import kotlinx.coroutines.ExecutorCoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

// The phone brain's engine (cpp/bob_llama.cpp over llama.cpp). Every call runs on one thread of its own, because
// llama.cpp's context isn't shared between threads. Only abort() may be called from anywhere.
object Llama {
    private val thread: ExecutorCoroutineDispatcher = Executors.newSingleThreadExecutor { r -> Thread(r, "bob-brain") }.asCoroutineDispatcher()
    private var ready = false

    init { System.loadLibrary("bobllama") }

    private external fun nativeInit(libDir: ByteArray)
    private external fun nativeLoad(path: ByteArray, nCtx: Int, threads: Int): Int
    private external fun nativeUnload()
    private external fun nativeAbort(on: Boolean)
    private external fun nativeStart(messages: ByteArray, tools: ByteArray, maxNew: Int, temp: Float, think: Boolean): ByteArray
    private external fun nativeIngest(maxTokens: Int): Int
    private external fun nativeNext(): ByteArray?
    private external fun nativeFinish(): ByteArray
    private external fun nativeBench(pp: Int, tg: Int): ByteArray

    private fun ByteArray.text() = String(this, Charsets.UTF_8)
    private fun String.bytes() = toByteArray(Charsets.UTF_8)

    suspend fun <T> on(block: () -> T): T = withContext(thread) { block() }

    /** Loads a GGUF. Throws with a plain reason if it can't. */
    suspend fun load(path: String, nCtx: Int, libDir: String) = on {
        if (!ready) { nativeInit(libDir.bytes()); ready = true }
        val threads = (Runtime.getRuntime().availableProcessors() - 2).coerceIn(2, 4)
        when (nativeLoad(path.bytes(), nCtx, threads)) {
            0 -> Unit
            1 -> throw Exception("the brain file wouldn't open (it may be damaged: delete it and download it again)")
            3 -> throw Exception("the phone brain's engine didn't start (a problem in this version of Bob, not the brain file)")
            else -> throw Exception("not enough free memory for the phone brain right now")
        }
    }

    suspend fun unload() = on { nativeUnload() }

    fun abort(on: Boolean = true) = nativeAbort(on)

    class Reply(val content: String, val toolCalls: JSONArray, val tokens: Int, val stop: String)
    class TooLong(val tokens: Int, val ctx: Int) : Exception("too long")

    /**
     * One reply. `messages` and `tools` are OpenAI-style. Calls `reading(done, of)` while it reads the prompt (only
     * the part that changed since the last reply) and `words(text)` for each new bit of reply text.
     * `keepGoing` is checked between steps; returning false stops the reply.
     */
    suspend fun reply(
        messages: JSONArray, tools: JSONArray, maxNew: Int, temp: Float = 0.6f,
        keepGoing: () -> Boolean, reading: (Int, Int) -> Unit, words: (String) -> Unit
    ): Reply = on {
        nativeAbort(false)
        val st = JSONObject(nativeStart(messages.toString().bytes(), tools.toString().bytes(), maxNew, temp, false).text())
        if (st.has("error")) {
            if (st.getString("error") == "too long") throw TooLong(st.optInt("tokens"), st.optInt("ctx"))
            throw Exception(st.getString("error"))
        }
        val todo = st.optInt("todo")
        var left = todo
        while (left > 0) {
            if (!keepGoing()) { nativeAbort(true); break }
            reading(todo - left, todo)
            left = nativeIngest(128)
            if (left < 0) break
        }
        if (left == 0) {
            while (true) {
                if (!keepGoing()) { nativeAbort(true); nativeNext(); break }
                val b = nativeNext() ?: break
                if (b.isNotEmpty()) words(b.text())
            }
        }
        val f = JSONObject(nativeFinish().text())
        Reply(f.optString("content"), f.optJSONArray("tool_calls") ?: JSONArray(), f.optInt("tokens"), if (left < 0) "error" else f.optString("stop"))
    }

    /** Test speed: tokens a second reading and writing, on the loaded brain. */
    suspend fun bench(): JSONObject = on { JSONObject(nativeBench(128, 64).text()) }
}
