// The phone brain on an iPhone (opt-in): a small model run on the phone with llama.cpp and Apple's graphics (Metal),
// through bob_brain.cpp, the same engine code as Bob for Android (PhoneBrain.kt / Llama.kt). It loads only when a
// message needs it and, with "Free memory when Bob is idle" on (the starting position), unloads after a quiet spell.
import Foundation
import CryptoKit

/// The engine's C calls, always on one thread of their own (llama.cpp's context isn't shared between threads).
enum Engine {
    static let queue = DispatchQueue(label: "bob-brain", qos: .userInitiated)
    private static var ready = false

    static func on<T>(_ work: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { k in queue.async { k.resume(with: Result { try work() }) } }
    }

    private static func take(_ p: UnsafeMutablePointer<CChar>?) -> String? {
        guard let p = p else { return nil }
        defer { bob_brain_free(p) }
        return String(cString: p)
    }
    private static func json(_ s: String?) -> [String: Any] {
        guard let s = s, let d = s.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return [:] }
        return o
    }

    #if targetEnvironment(simulator)
    static let gpuLayers: Int32 = 0 // the simulator has no real iPhone graphics: all on the processor
    #else
    static let gpuLayers: Int32 = -1 // the iPhone's graphics take the whole brain
    #endif

    static func load(_ path: String, ctx: Int) async throws {
        try await on {
            if !ready { bob_brain_init(nil); ready = true }
            let threads = Int32(min(4, max(2, ProcessInfo.processInfo.activeProcessorCount - 2)))
            switch bob_brain_load(path, Int32(ctx), threads, gpuLayers) {
            case 0: return
            case 1: throw NetError("the brain file wouldn't open (it may be damaged: delete it and download it again)")
            case 3: throw NetError("the phone brain's engine didn't start (a problem in this version of Bob, not the brain file)")
            default: throw NetError("not enough free memory for the phone brain right now")
            }
        }
    }

    static func unload() async { _ = try? await on { bob_brain_unload() } }
    static func abort(_ on: Bool = true) { bob_brain_abort(on ? 1 : 0) }

    struct Reply { let content: String; let toolCalls: [Any]; let tokens: Int; let stop: String }
    struct TooLong: Error {}

    /// One reply: reads only the part of the chat that changed, then hands each new bit of text to `words`.
    static func reply(messages: [[String: Any]], tools: [Any] = [], maxNew: Int, temp: Float = 0.6,
                      keepGoing: @escaping () -> Bool, words: @escaping (String) -> Void) async throws -> Reply {
        let m = String(data: try JSONSerialization.data(withJSONObject: messages), encoding: .utf8) ?? "[]"
        let t = String(data: try JSONSerialization.data(withJSONObject: tools), encoding: .utf8) ?? "[]"
        return try await on {
            bob_brain_abort(0)
            let st = json(take(bob_brain_start(m, t, Int32(maxNew), temp, 0)))
            if let e = st["error"] as? String { if e == "too long" { throw TooLong() }; throw NetError(e) }
            var left = (st["todo"] as? Int) ?? 0
            while left > 0 {
                if !keepGoing() { bob_brain_abort(1); break }
                left = Int(bob_brain_ingest(128))
                if left < 0 { break }
            }
            if left == 0 {
                while true {
                    if !keepGoing() { bob_brain_abort(1); _ = take(bob_brain_next()); break }
                    guard let w = take(bob_brain_next()) else { break }
                    if !w.isEmpty { words(w) }
                }
            }
            let f = json(take(bob_brain_finish()))
            return Reply(content: f["content"] as? String ?? "", toolCalls: f["tool_calls"] as? [Any] ?? [], tokens: f["tokens"] as? Int ?? 0,
                         stop: left < 0 ? "error" : (f["stop"] as? String ?? "end"))
        }
    }

    static func bench() async throws -> [String: Any] { try await on { json(take(bob_brain_bench(128, 64))) } }
}

final class PhoneBrain: NSObject, URLSessionDataDelegate {
    static let shared = PhoneBrain()

    private var loadedFile: String?
    private var working: String? // nil, "chat" or "bench"
    private var stopAsked = false
    private var lastUse = Date()
    private var replyTask: Task<Void, Never>?
    var freeWhenIdle = true
    var idleMinutes = 5
    /// The page listens here (Bridge sets it).
    var listener: (([String: Any]) -> Void)?
    private func emit(_ m: [String: Any]) { listener?(m) }
    private let lock = NSLock()

    var modelsDir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("models", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        var u = d; var v = URLResourceValues(); v.isExcludedFromBackup = true; try? u.setResourceValues(v) // a brain isn't backed up to iCloud
        return d
    }

    override init() {
        super.init()
        Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self = self, self.freeWhenIdle, self.loadedFile != nil, self.working == nil,
                  Date().timeIntervalSince(self.lastUse) > Double(self.idleMinutes * 60) else { return }
            Task { await self.unload("idle") }
        }
    }

    static func safeName(_ name: String) throws -> String {
        guard name.range(of: "^[A-Za-z0-9._-]{1,120}\\.gguf$", options: .regularExpression) != nil else { throw NetError("Bad model file name") }
        return name
    }

    /// What this iPhone lets Bob use: the app's own memory allowance (iOS stops an app that goes over it).
    static var memoryLeftMB: Int { Int(os_proc_available_memory() / 1_048_576) }

    func status() -> [String: Any] {
        var files: [String: Int] = [:]
        for f in (try? FileManager.default.contentsOfDirectory(at: modelsDir, includingPropertiesForKeys: [.fileSizeKey])) ?? [] where f.pathExtension == "gguf" {
            files[f.lastPathComponent] = (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        }
        let free = (try? modelsDir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage) ?? 0
        return ["files": files, "loaded": (loadedFile as Any?) ?? NSNull(), "busy": working != nil, "working": (working as Any?) ?? NSNull(),
                "downloading": downloading != nil, "ramTotalMB": Int(ProcessInfo.processInfo.physicalMemory / 1_048_576),
                "ramFreeMB": PhoneBrain.memoryLeftMB, "lowMemory": PhoneBrain.memoryLeftMB < 600, "freeSpaceMB": Int(free / 1_048_576)]
    }

    // ---- pinned download: exact URL (Hugging Face commit), exact size, sha256 checked before the file is used ----
    private var downloading: (name: String, bytes: Int64, sha: String, url: URL, part: URL, out: FileHandle?, have: Int64, tries: Int, lastEmit: Date)?
    private var dlSession: URLSession?
    private var dlTask: URLSessionDataTask?

    func download(file: String, url: String, bytes: Int64, sha256: String) throws {
        if downloading != nil { return }
        let name = try PhoneBrain.safeName(file)
        guard url.hasPrefix("https://huggingface.co/"), url.range(of: "/resolve/[0-9a-f]{40}/", options: .regularExpression) != nil, let u = URL(string: url) else {
            throw NetError("Only pinned Hugging Face links")
        }
        try PhoneNet.check(u, "Brain download") // Nov 27 2026: No internet on and Hugging Face not allowed: say so at once
        let part = modelsDir.appendingPathComponent(name + ".part")
        let have = Int64((try? part.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        let free = Int64((try? modelsDir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage) ?? 0)
        if free + have < bytes + 200_000_000 { emit(["type": "download", "state": "error", "text": "not enough space"]); return }
        downloading = (name, bytes, sha256, u, part, nil, min(have, bytes), 0, Date.distantPast)
        startRange()
    }

    private func startRange() {
        guard var d = downloading else { return }
        if !FileManager.default.fileExists(atPath: d.part.path) { FileManager.default.createFile(atPath: d.part.path, contents: nil) }
        if d.have >= d.bytes { downloading = d; return finishDownload() }
        var r = URLRequest(url: d.url, timeoutInterval: 30)
        if d.have > 0 { r.setValue("bytes=\(d.have)-", forHTTPHeaderField: "Range") }
        let s = dlSession ?? URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        dlSession = s
        d.out = try? FileHandle(forWritingTo: d.part)
        downloading = d
        dlTask = s.dataTask(with: r)
        dlTask?.resume()
    }

    // Nov 27 2026: each hop of a redirect (Hugging Face hands files on to its own download servers) is checked too.
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let u = request.url else { return completionHandler(nil) }
        if (try? PhoneNet.check(u, "Brain download")) == nil {
            completionHandler(nil)
            if let d = downloading { emit(["type": "download", "state": "error", "file": d.name, "text": PhoneNet.Stopped(host: (u.host ?? "").lowercased()).errorDescription ?? "No internet is on"]); downloading = nil }
            return
        }
        completionHandler(request)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard var d = downloading, let h = response as? HTTPURLResponse else { return completionHandler(.cancel) }
        if h.statusCode != 200 && h.statusCode != 206 { completionHandler(.cancel); emit(["type": "download", "state": "error", "file": d.name, "text": "the website said \(h.statusCode)"]); downloading = nil; return }
        if h.statusCode == 200 { d.have = 0 }
        try? d.out?.truncate(atOffset: UInt64(d.have))
        try? d.out?.seek(toOffset: UInt64(d.have))
        downloading = d
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard var d = downloading else { return }
        d.out?.write(data)
        d.have += Int64(data.count)
        if d.have > d.bytes { dataTask.cancel(); try? FileManager.default.removeItem(at: d.part); downloading = nil
            emit(["type": "download", "state": "error", "file": d.name, "text": "the file is bigger than it should be"]); return }
        if Date().timeIntervalSince(d.lastEmit) > 0.5 { d.lastEmit = Date(); emit(["type": "download", "state": "going", "file": d.name, "have": d.have, "bytes": d.bytes]) }
        downloading = d
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard var d = downloading else { return }
        try? d.out?.close(); d.out = nil
        if let e = error as NSError? {
            if e.code == NSURLErrorCancelled { downloading = nil; emit(["type": "download", "state": "paused", "file": d.name, "have": d.have, "bytes": d.bytes]); return }
            d.tries += 1
            downloading = d
            if d.tries > 2 { downloading = nil; emit(["type": "download", "state": "error", "file": d.name, "text": e.localizedDescription]); return }
            DispatchQueue.global().asyncAfter(deadline: .now() + 3) { self.startRange() } // a network hiccup is retried twice, like on the PC
            return
        }
        downloading = d
        if d.have < d.bytes { startRange() } else { finishDownload() }
    }

    private func finishDownload() {
        guard let d = downloading else { return }
        emit(["type": "download", "state": "checking", "file": d.name])
        DispatchQueue.global(qos: .utility).async {
            var hash = SHA256()
            if let h = try? FileHandle(forReadingFrom: d.part) {
                while let chunk = try? h.read(upToCount: 1 << 20), !chunk.isEmpty { hash.update(data: chunk) }
                try? h.close()
            }
            let got = hash.finalize().map { String(format: "%02x", $0) }.joined()
            let size = Int64((try? d.part.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
            self.downloading = nil
            if size != d.bytes || got.lowercased() != d.sha.lowercased() {
                try? FileManager.default.removeItem(at: d.part)
                self.emit(["type": "download", "state": "error", "file": d.name, "text": "the file didn't match its checksum, so it was deleted"]); return
            }
            let done = self.modelsDir.appendingPathComponent(d.name)
            try? FileManager.default.removeItem(at: done)
            do { try FileManager.default.moveItem(at: d.part, to: done) } catch { self.emit(["type": "download", "state": "error", "file": d.name, "text": "couldn't keep the file"]); return }
            self.emit(["type": "download", "state": "done", "file": d.name])
        }
    }

    func pauseDownload() { dlTask?.cancel() }

    func cancelDownload(file: String) throws {
        let name = try PhoneBrain.safeName(file)
        dlTask?.cancel()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { try? FileManager.default.removeItem(at: self.modelsDir.appendingPathComponent(name + ".part")) }
    }

    func delete(file: String) throws -> Bool {
        let name = try PhoneBrain.safeName(file)
        if loadedFile == name { Task { await unload("deleted") } }
        return (try? FileManager.default.removeItem(at: modelsDir.appendingPathComponent(name))) != nil
    }

    func unload(_ why: String) async {
        stopAsked = true; Engine.abort(true)
        replyTask?.cancel()
        if loadedFile != nil {
            await Engine.unload()
            loadedFile = nil
            emit(["type": "brain", "state": "unloaded", "why": why])
        }
    }

    // An iPhone with 8 GB or more gets room for longer chats; smaller ones the usual 8K.
    func contextSize() -> Int { ProcessInfo.processInfo.physicalMemory >= 7 << 30 && PhoneBrain.memoryLeftMB > 4500 ? 12288 : 8192 }

    private func ensureLoaded(_ name: String) async throws {
        if loadedFile == name { return }
        if loadedFile != nil { await Engine.unload(); loadedFile = nil }
        let f = modelsDir.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: f.path) else { throw NetError("the phone brain isn't downloaded") }
        emit(["type": "brain", "state": "loading"])
        let t0 = Date()
        try await Engine.load(f.path, ctx: contextSize())
        loadedFile = name
        emit(["type": "brain", "state": "loaded", "ms": Int(Date().timeIntervalSince(t0) * 1000)])
    }

    /// Bob for Android's ChatShape.toModel, for the phone's own chat: one system message first, later notes folded
    /// into the next user turn (most templates refuse a system message anywhere but the start).
    static func toModel(_ messages: [[String: Any]]) -> [[String: Any]] {
        var out: [[String: Any]] = []
        var first: [String] = []
        var i = 0
        while i < messages.count, messages[i]["role"] as? String == "system" { first.append(String((messages[i]["content"] as? String ?? "").prefix(60000))); i += 1 }
        if !first.isEmpty { out.append(["role": "system", "content": first.joined(separator: "\n\n")]) }
        var notes: [String] = []
        while i < messages.count {
            let m = messages[i]; i += 1
            let content = String((m["content"] as? String ?? "").prefix(60000))
            switch m["role"] as? String {
            case "system": if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { notes.append(content) }
            case "user":
                let text = notes.isEmpty ? content : "(\(notes.joined(separator: "\n\n")))\n\n\(content)"
                notes = []
                if out.last?["role"] as? String == "user" { out[out.count - 1]["content"] = (out[out.count - 1]["content"] as? String ?? "") + "\n\n" + text }
                else { out.append(["role": "user", "content": text]) }
            case "assistant":
                if out.last?["role"] as? String == "assistant" { out[out.count - 1]["content"] = (out[out.count - 1]["content"] as? String ?? "") + "\n\n" + content }
                else { out.append(["role": "assistant", "content": content]) }
            default: break
            }
        }
        return out
    }

    /// Drops the oldest turn after the system message (keeping the last user turn), or nil when there's nothing left to drop.
    static func trimOldest(_ messages: [[String: Any]]) -> [[String: Any]]? {
        let start = messages.first?["role"] as? String == "system" ? 1 : 0
        guard let lastUser = messages.lastIndex(where: { $0["role"] as? String == "user" }), lastUser > start else { return nil }
        var cut = start + 1
        while cut < lastUser && messages[cut]["role"] as? String != "user" { cut += 1 }
        return Array(messages[..<start]) + Array(messages[cut...])
    }

    /// One reply on the phone, for the phone page (same events as Bob for Android: brain, token, done, error).
    func chat(file: String, system: String, history: [[String: Any]], text: String, note: String, maxTokens: Int) throws {
        let name = try PhoneBrain.safeName(file)
        if working != nil { emit(["type": "error", "text": "busy"]); return }
        working = "chat"
        stopAsked = false
        replyTask = Task {
            defer { self.working = nil }
            do {
                var msgs: [[String: Any]] = [["role": "system", "content": system]]
                for m in history {
                    let role = m["role"] as? String ?? "", c = m["content"] as? String ?? ""
                    if (role == "user" || role == "assistant") && !c.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { msgs.append(["role": role, "content": c]) }
                }
                if !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { msgs.append(["role": "system", "content": note]) }
                msgs.append(["role": "user", "content": text])
                try await ensureLoaded(name)
                lastUse = Date()
                emit(["type": "brain", "state": "thinking"])
                let t0 = Date()
                var first = 0.0, n = 0
                var shaped = PhoneBrain.toModel(msgs)
                var reply: Engine.Reply?
                while reply == nil {
                    do {
                        reply = try await Engine.reply(messages: shaped, maxNew: min(2048, max(64, maxTokens)), keepGoing: { [weak self] in !(self?.stopAsked ?? true) }) { [weak self] w in
                            if n == 0 { first = Date().timeIntervalSince(t0) }
                            n += 1
                            self?.emit(["type": "token", "text": w])
                        }
                    } catch is Engine.TooLong {
                        guard let less = PhoneBrain.trimOldest(shaped) else { emit(["type": "error", "text": "this chat is too long for the phone brain; start a new chat"]); return }
                        shaped = less
                    }
                }
                guard let r = reply else { return }
                if n == 0 && !r.content.isEmpty { emit(["type": "token", "text": r.content]) }
                lastUse = Date()
                let secs = max(0.001, Date().timeIntervalSince(t0) - first)
                if stopAsked || r.stop == "stopped" { emit(["type": "done", "stopped": true]) }
                else { emit(["type": "done", "tokens": r.tokens, "firstMs": Int(first * 1000), "tokPerSec": r.tokens > 1 ? Double(r.tokens - 1) / secs : 0.0]) }
            } catch {
                emit(["type": "error", "text": error.localizedDescription])
            }
        }
    }

    func stop() { stopAsked = true; Engine.abort(true) }

    /// Test speed: how many tokens a second this iPhone reads and writes with this brain.
    func bench(file: String) throws {
        let name = try PhoneBrain.safeName(file)
        if working != nil { emit(["type": "bench", "error": "the phone brain is busy"]); return }
        working = "bench"
        Task {
            defer { self.working = nil }
            do {
                try await ensureLoaded(name)
                let r = try await Engine.bench()
                lastUse = Date()
                if let e = r["error"] as? String { emit(["type": "bench", "error": e]) }
                else { emit(["type": "bench", "read": r["pp"] ?? 0, "write": r["tg"] ?? 0]) }
            } catch { emit(["type": "bench", "error": error.localizedDescription]) }
        }
    }
}
