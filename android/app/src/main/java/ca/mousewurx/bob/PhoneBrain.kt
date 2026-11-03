package ca.mousewurx.bob

import android.app.ActivityManager
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicReference

// The phone brain (opt-in): a small model run on the phone with llama.cpp (Llama.kt). It loads only when a message
// needs it and, with "Free memory when Bob is idle" on (the starting position), unloads after a quiet spell.
// It thinks for one thing at a time: your chat on the phone, or (with "Lend my brain" on) one reply for another Bob.
// One per app (BobApp), so lending carries on when Bob's screen is closed.
class PhoneBrain(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Mutex()
    @Volatile private var loadedFile: String? = null
    private var reply: Job? = null
    @Volatile private var lastUse = 0L
    @Volatile var freeWhenIdle = true
    @Volatile var idleMinutes = 5
    private var download: Job? = null
    /** What the brain is doing right now: null, "chat" (you, on the phone) or "lend" (another Bob). */
    val working = AtomicReference<String?>(null)
    @Volatile private var stopAsked = false
    /** Words (tokens) a second in the last reply or speed test, for other Bobs choosing who to ask. 0 = not known yet. */
    @Volatile var lastSpeed = 0.0

    // The phone page listens here (Bridge sets it while Bob's screen exists).
    @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null
    private fun emit(m: Map<String, Any?>) { listener?.invoke(m) }

    val modelsDir: File get() = File(context.filesDir, "models").apply { mkdirs() }

    class Busy(val why: String) : Exception(why)

    init {
        scope.launch {
            while (true) {
                delay(30_000)
                if (freeWhenIdle && loadedFile != null && working.get() == null &&
                    System.currentTimeMillis() - lastUse > idleMinutes * 60_000L) {
                    unload("idle")
                }
            }
        }
    }

    private fun memInfo(): ActivityManager.MemoryInfo {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    }

    fun status(): Map<String, Any?> {
        val mi = memInfo()
        val files = modelsDir.listFiles()?.filter { it.name.endsWith(".gguf") }?.associate { it.name to it.length() } ?: emptyMap()
        return mapOf(
            "files" to files,
            "loaded" to loadedFile,
            "busy" to (working.get() != null),
            "working" to working.get(),
            "downloading" to (download?.isActive == true),
            "ramTotalMB" to mi.totalMem / 1_048_576,
            "ramFreeMB" to mi.availMem / 1_048_576,
            "lowMemory" to mi.lowMemory,
            "freeSpaceMB" to modelsDir.usableSpace / 1_048_576
        )
    }

    fun lowMemory(): Boolean = memInfo().lowMemory

    fun hasFile(file: String): Boolean = runCatching { File(modelsDir, safeName(file)).isFile }.getOrDefault(false)

    private fun safeName(name: String): String {
        require(Regex("""^[A-Za-z0-9._-]{1,120}\.gguf$""").matches(name)) { "Bad model file name" }
        return name
    }

    /** Pinned download: exact URL (HF commit), exact size, sha256 checked before the file is used. Resumes a .part file. */
    fun download(file: String, url: String, bytes: Long, sha256: String) {
        if (download?.isActive == true) return
        val name = safeName(file)
        require(url.startsWith("https://huggingface.co/") && url.contains("/resolve/") && Regex("/resolve/[0-9a-f]{40}/").containsMatchIn(url)) { "Only pinned Hugging Face links" }
        download = scope.launch(Dispatchers.IO) {
            val me = this
            val part = File(modelsDir, "$name.part")
            val done = File(modelsDir, name)
            try {
                if (modelsDir.usableSpace + part.length() < bytes + 200_000_000L) {
                    emit(mapOf("type" to "download", "state" to "error", "text" to "not enough space")); return@launch
                }
                var have = part.length().coerceAtMost(bytes)
                var tries = 0
                while (have < bytes) {
                    try {
                        val c = URL(url).openConnection() as HttpURLConnection
                        c.connectTimeout = 15000; c.readTimeout = 30000
                        if (have > 0) c.setRequestProperty("Range", "bytes=$have-")
                        val code = c.responseCode
                        if (code != 200 && code != 206) throw Exception("the website said $code")
                        if (code == 200) have = 0
                        RandomAccessFile(part, "rw").use { out ->
                            out.setLength(have); out.seek(have)
                            c.inputStream.use { inp ->
                                val buf = ByteArray(1 shl 20)
                                var lastEmit = 0L
                                while (true) {
                                    if (!me.isActive) throw InterruptedException()
                                    val n = inp.read(buf)
                                    if (n < 0) break
                                    out.write(buf, 0, n); have += n
                                    if (have > bytes) throw Exception("the file is bigger than it should be")
                                    val now = System.currentTimeMillis()
                                    if (now - lastEmit > 500) { lastEmit = now; emit(mapOf("type" to "download", "state" to "going", "file" to name, "have" to have, "bytes" to bytes)) }
                                }
                            }
                        }
                        c.disconnect()
                    } catch (e: InterruptedException) { throw e } catch (e: Exception) {
                        if (++tries > 2) throw e // a network hiccup is retried twice, like on the PC
                        delay(3000)
                    }
                }
                emit(mapOf("type" to "download", "state" to "checking", "file" to name))
                val md = MessageDigest.getInstance("SHA-256")
                FileInputStream(part).use { s -> val buf = ByteArray(1 shl 20); while (true) { val n = s.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
                val got = md.digest().joinToString("") { "%02x".format(it) }
                if (part.length() != bytes || !got.equals(sha256, true)) {
                    part.delete()
                    emit(mapOf("type" to "download", "state" to "error", "text" to "the file didn't match its checksum, so it was deleted")); return@launch
                }
                part.renameTo(done)
                emit(mapOf("type" to "download", "state" to "done", "file" to name))
            } catch (e: Exception) {
                if (e is InterruptedException || e is kotlinx.coroutines.CancellationException) {
                    emit(mapOf("type" to "download", "state" to "paused", "file" to name, "have" to part.length(), "bytes" to bytes))
                } else {
                    emit(mapOf("type" to "download", "state" to "error", "file" to name, "text" to (e.message ?: "download failed")))
                }
            }
        }
    }

    fun pauseDownload() { download?.cancel() }

    fun cancelDownload(file: String) {
        val name = safeName(file)
        scope.launch { download?.cancelAndJoin(); File(modelsDir, "$name.part").delete() }
    }

    fun delete(file: String): Boolean {
        val name = safeName(file)
        scope.launch { if (loadedFile == name) unload("deleted") }
        return File(modelsDir, name).delete()
    }

    suspend fun unload(why: String) {
        stopAsked = true; Llama.abort(true)
        reply?.cancelAndJoin()
        lock.withLock {
            if (loadedFile != null) {
                Llama.unload()
                loadedFile = null
                emit(mapOf("type" to "brain", "state" to "unloaded", "why" to why))
            }
        }
    }

    // A phone with 8 GB or more gets room for Bob's longer instructions (lending); smaller phones the usual 8K.
    fun contextSize(): Int = if (memInfo().totalMem >= 7L * 1024 * 1024 * 1024) 12288 else 8192

    // Call with the lock held.
    private suspend fun ensureLoaded(name: String, onLoading: () -> Unit) {
        if (loadedFile == name) return
        if (loadedFile != null) { Llama.unload(); loadedFile = null }
        val f = File(modelsDir, name)
        if (!f.isFile) throw Exception("the phone brain isn't downloaded")
        onLoading()
        emit(mapOf("type" to "brain", "state" to "loading"))
        val t0 = System.currentTimeMillis()
        Llama.load(f.absolutePath, contextSize(), context.applicationInfo.nativeLibraryDir)
        loadedFile = name
        emit(mapOf("type" to "brain", "state" to "loaded", "ms" to System.currentTimeMillis() - t0))
    }

    /** Runs one reply, dropping the oldest turns when the chat is too long for the phone's memory. */
    private suspend fun think(
        messages: JSONArray, tools: JSONArray, maxNew: Int,
        reading: (Int, Int) -> Unit, words: (String) -> Unit
    ): Llama.Reply {
        var msgs = ChatShape.toModel(messages)
        while (true) {
            try {
                return Llama.reply(msgs, tools, maxNew, keepGoing = { !stopAsked }, reading = reading, words = words)
            } catch (e: Llama.TooLong) {
                msgs = ChatShape.trimOldest(msgs) ?: throw Busy("too long")
            }
        }
    }

    /**
     * One reply on the phone, for the phone page. `system` is Bob's phone persona (it stays the same, so the phone
     * doesn't re-read it), `history` the chat so far ({role, content}), `note` the time and such, folded into your turn.
     */
    fun chat(file: String, system: String, history: JSONArray, text: String, note: String, maxTokens: Int) {
        val name = safeName(file)
        if (!working.compareAndSet(null, "chat")) {
            emit(mapOf("type" to "error", "text" to if (working.get() == "lend") "the phone brain is thinking for another Bob right now; try again in a moment" else "busy"))
            return
        }
        stopAsked = false
        reply = scope.launch {
            try {
                val msgs = JSONArray().put(JSONObject().put("role", "system").put("content", system))
                for (j in 0 until history.length()) history.optJSONObject(j)?.let { m ->
                    val role = m.optString("role")
                    if ((role == "user" || role == "assistant") && m.optString("content").isNotBlank()) msgs.put(JSONObject().put("role", role).put("content", m.optString("content")))
                }
                if (note.isNotBlank()) msgs.put(JSONObject().put("role", "system").put("content", note))
                msgs.put(JSONObject().put("role", "user").put("content", text))
                lock.withLock {
                    ensureLoaded(name) {}
                    lastUse = System.currentTimeMillis()
                    emit(mapOf("type" to "brain", "state" to "thinking"))
                    val t0 = System.currentTimeMillis()
                    var first = 0L; var n = 0
                    val r = think(msgs, JSONArray(), maxTokens.coerceIn(64, 2048), reading = { _, _ -> }) { w ->
                        if (n == 0) first = System.currentTimeMillis() - t0
                        n++
                        emit(mapOf("type" to "token", "text" to w))
                    }
                    if (n == 0 && r.content.isNotEmpty()) emit(mapOf("type" to "token", "text" to r.content))
                    val secs = (System.currentTimeMillis() - t0 - first).coerceAtLeast(1) / 1000.0
                    if (r.tokens > 8) lastSpeed = (r.tokens - 1) / secs
                    lastUse = System.currentTimeMillis()
                    if (stopAsked || r.stop == "stopped") emit(mapOf("type" to "done", "stopped" to true))
                    else emit(mapOf("type" to "done", "tokens" to r.tokens, "firstMs" to first, "tokPerSec" to if (r.tokens > 1) (r.tokens - 1) / secs else 0.0))
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                emit(mapOf("type" to "done", "stopped" to true))
            } catch (e: Busy) {
                emit(mapOf("type" to "error", "text" to "this chat is too long for the phone brain; start a new chat"))
            } catch (e: Throwable) {
                emit(mapOf("type" to "error", "text" to (e.message ?: e.javaClass.simpleName)))
            } finally {
                working.compareAndSet("chat", null)
            }
        }
    }

    /**
     * One reply for another Bob (Lend protocol v1). Words in, words and tool calls out; nothing runs here and
     * nothing is kept. `event` gets loading/reading/token events as they happen. Throws Busy when it won't.
     */
    suspend fun lend(file: String, messages: JSONArray, tools: JSONArray, gone: () -> Boolean, event: (JSONObject) -> Unit): JSONObject {
        val name = safeName(file)
        if (!working.compareAndSet(null, "lend")) throw Busy("busy")
        stopAsked = false
        try {
            return lock.withLock {
                ensureLoaded(name) { event(JSONObject().put("type", "loading")) }
                lastUse = System.currentTimeMillis()
                var lastBeat = 0L
                var firstAt = 0L
                val r = Llama.reply(
                    ChatShape.toModel(messages), tools, 1024,
                    keepGoing = { !stopAsked && !gone() },
                    reading = { done, of ->
                        val now = System.currentTimeMillis()
                        if (now - lastBeat > 2000) { lastBeat = now; event(JSONObject().put("type", "reading").put("done", done).put("of", of)) }
                    },
                    words = { w -> if (firstAt == 0L) firstAt = System.currentTimeMillis(); event(JSONObject().put("type", "token").put("text", w)) }
                )
                lastUse = System.currentTimeMillis()
                if (firstAt > 0 && r.tokens > 8) lastSpeed = (r.tokens - 1) / ((lastUse - firstAt).coerceAtLeast(1) / 1000.0)
                if (r.stop == "stopped" || r.stop == "error") throw Exception(if (stopAsked || gone()) "stopped" else "the phone brain stopped")
                JSONObject().put("content", r.content).put("tool_calls", ChatShape.callsOut(r.toolCalls))
            }
        } catch (e: Llama.TooLong) {
            throw Busy("too long")
        } finally {
            working.compareAndSet("lend", null)
        }
    }

    fun stop() { stopAsked = true; Llama.abort(true) }

    /** Test speed: how many words a second this phone reads and writes with this brain. */
    fun bench(file: String) {
        val name = safeName(file)
        scope.launch {
            if (!working.compareAndSet(null, "bench")) { emit(mapOf("type" to "bench", "error" to "the phone brain is busy")); return@launch }
            try {
                val r = lock.withLock { ensureLoaded(name) {}; Llama.bench() }
                lastUse = System.currentTimeMillis()
                if (r.has("error")) emit(mapOf("type" to "bench", "error" to r.getString("error")))
                else { lastSpeed = r.optDouble("tg"); emit(mapOf("type" to "bench", "read" to r.optDouble("pp"), "write" to r.optDouble("tg"))) }
            } catch (e: Throwable) {
                emit(mapOf("type" to "bench", "error" to (e.message ?: "speed test failed")))
            } finally { working.compareAndSet("bench", null) }
        }
    }
}
