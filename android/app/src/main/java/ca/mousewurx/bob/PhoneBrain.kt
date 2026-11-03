package ca.mousewurx.bob

import android.app.ActivityManager
import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.arm.aichat.InferenceEngine.State
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

// The phone brain (opt-in): a small model run on the phone with llama.cpp. It loads only when a message needs it
// and, with "Free memory when Bob is idle" on (the starting position), unloads after a quiet spell.
class PhoneBrain(private val context: Context, private val emit: (Map<String, Any?>) -> Unit) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Mutex()
    private var engine: InferenceEngine? = null
    private var loadedFile: String? = null
    private var loadedChat: String? = null
    private var reply: Job? = null
    private var lastUse = 0L
    @Volatile var freeWhenIdle = true
    @Volatile var idleMinutes = 5
    private var download: Job? = null

    val modelsDir: File get() = File(context.filesDir, "models").apply { mkdirs() }

    init {
        scope.launch {
            while (true) {
                delay(30_000)
                if (freeWhenIdle && loadedFile != null && reply?.isActive != true &&
                    System.currentTimeMillis() - lastUse > idleMinutes * 60_000L) {
                    unload("idle")
                }
            }
        }
    }

    private suspend fun engine(): InferenceEngine {
        val e = engine ?: AiChat.getInferenceEngine(context.applicationContext).also { engine = it }
        // The engine starts itself up in the background the first time; wait for that.
        withTimeoutOrNull(30_000) { e.state.first { it !is State.Uninitialized && it !is State.Initializing } }
        return e
    }

    fun status(): Map<String, Any?> {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val files = modelsDir.listFiles()?.filter { it.name.endsWith(".gguf") }?.associate { it.name to it.length() } ?: emptyMap()
        return mapOf(
            "files" to files,
            "loaded" to loadedFile,
            "busy" to (reply?.isActive == true),
            "downloading" to (download?.isActive == true),
            "ramTotalMB" to mi.totalMem / 1_048_576,
            "ramFreeMB" to mi.availMem / 1_048_576,
            "lowMemory" to mi.lowMemory,
            "freeSpaceMB" to modelsDir.usableSpace / 1_048_576
        )
    }

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

    private suspend fun stopReply() {
        engine?.let { e -> reply?.let { it.cancelAndJoin() }; withTimeoutOrNull(10_000) { e.state.first { it !is State.Generating && it !is State.ProcessingUserPrompt } } }
    }

    suspend fun unload(why: String) = lock.withLock {
        stopReply()
        val e = engine ?: return@withLock
        if (loadedFile != null || e.state.value is State.Error) runCatching { e.cleanUp() }
        if (loadedFile != null) emit(mapOf("type" to "brain", "state" to "unloaded", "why" to why))
        loadedFile = null; loadedChat = null
    }

    /** One reply from the phone brain. `system` is Bob's phone persona plus a short recap of the chat so far. */
    fun chat(file: String, chatId: String, system: String, text: String, maxTokens: Int) {
        val name = safeName(file)
        if (reply?.isActive == true) { emit(mapOf("type" to "brain", "state" to "error", "text" to "busy")); return }
        reply = scope.launch {
            try {
                lock.withLock {
                    val e = engine()
                    // A different brain or a different chat starts fresh: the engine keeps one conversation at a time.
                    if (loadedFile != name || loadedChat != chatId || e.state.value !is State.ModelReady) {
                        if (loadedFile != null || e.state.value is State.Error) runCatching { e.cleanUp() }
                        loadedFile = null; loadedChat = null
                        val f = File(modelsDir, name)
                        if (!f.isFile) throw Exception("the phone brain isn't downloaded")
                        emit(mapOf("type" to "brain", "state" to "loading"))
                        val t0 = System.currentTimeMillis()
                        e.loadModel(f.absolutePath)
                        e.setSystemPrompt(system)
                        loadedFile = name; loadedChat = chatId
                        emit(mapOf("type" to "brain", "state" to "loaded", "ms" to System.currentTimeMillis() - t0))
                    }
                }
                val e = engine!!
                lastUse = System.currentTimeMillis()
                val t0 = System.currentTimeMillis()
                var first = 0L; var n = 0
                emit(mapOf("type" to "brain", "state" to "thinking"))
                e.sendUserPrompt(text, maxTokens.coerceIn(64, 2048)).collect { tok ->
                    if (n == 0) first = System.currentTimeMillis() - t0
                    n++
                    emit(mapOf("type" to "token", "text" to tok))
                }
                val secs = (System.currentTimeMillis() - t0 - first).coerceAtLeast(1) / 1000.0
                lastUse = System.currentTimeMillis()
                emit(mapOf("type" to "done", "tokens" to n, "firstMs" to first, "tokPerSec" to if (n > 1) (n - 1) / secs else 0.0))
            } catch (e: kotlinx.coroutines.CancellationException) {
                emit(mapOf("type" to "done", "stopped" to true))
            } catch (e: Throwable) {
                loadedChat = null // start the chat fresh next time
                emit(mapOf("type" to "error", "text" to (e.message ?: e.javaClass.simpleName)))
            }
        }
    }

    fun stop() { scope.launch { reply?.cancelAndJoin() } }

    /** Test Bob's speed: llama.cpp's own benchmark (reading 128 words, writing 64). */
    fun bench(file: String) {
        val name = safeName(file)
        scope.launch {
            try {
                val out = lock.withLock {
                    val e = engine()
                    if (loadedFile != name || e.state.value !is State.ModelReady) {
                        if (loadedFile != null || e.state.value is State.Error) runCatching { e.cleanUp() }
                        loadedFile = null; loadedChat = null
                        emit(mapOf("type" to "brain", "state" to "loading"))
                        e.loadModel(File(modelsDir, name).absolutePath)
                        e.setSystemPrompt("You are Bob.")
                        loadedFile = name
                    }
                    e.bench(128, 64, 1, 1)
                }
                lastUse = System.currentTimeMillis()
                emit(mapOf("type" to "bench", "text" to out))
            } catch (e: Throwable) {
                emit(mapOf("type" to "bench", "error" to (e.message ?: "speed test failed")))
            }
        }
    }

    fun close() { runCatching { engine?.destroy() } }
}
