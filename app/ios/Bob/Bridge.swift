// The one door between Bob's phone page and the iPhone, like Bridge.kt on Android. The page calls
// BobPhone.call('{"id":..,"op":..}'); the answer comes back as window.bob.fromPhone({id, ok, result | error}).
// Things that happen later (reply words, download progress, events from a networked Bob) come back as {event: ...}.
// Lending the brain, pairing, the Share menu, the widget and Bob's own ears are Bob for Android's for now.
import UIKit
import WebKit
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers
import UserNotifications

final class Bridge: NSObject, AVSpeechSynthesizerDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    private weak var screen: UIViewController?
    private weak var web: WKWebView?
    private let net = NetBob()
    private let brain = PhoneBrain.shared
    private let listening = Flags()
    private let voice = AVSpeechSynthesizer()
    private var spoken: [ObjectIdentifier: String] = [:]
    private var photo: Data?
    private var photoCall: String?
    private var fileCall: String?
    private var inBackground = false
    static let notHere = "That needs Bob for Android for now."

    init(screen: UIViewController, web: WKWebView) {
        self.screen = screen
        self.web = web
        super.init()
        voice.delegate = self
        brain.listener = { [weak self] m in var o = m; o["event"] = "brain"; self?.send(o) }
    }

    // ---- talking to the page ----
    private func send(_ o: [String: Any]) {
        guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8),
              let q = try? JSONSerialization.data(withJSONObject: [s]), let qs = String(data: q, encoding: .utf8) else { return }
        let js = "window.bob && window.bob.fromPhone(" + String(qs.dropFirst().dropLast()) + ")"
        DispatchQueue.main.async { self.web?.evaluateJavaScript(js, completionHandler: nil) }
    }
    private func answer(_ id: String, _ result: Any?) { send(["id": id, "ok": true, "result": result ?? NSNull()]) }
    private func fail(_ id: String, _ error: String) { send(["id": id, "ok": false, "error": error]) }
    private func base(_ o: [String: Any]) throws -> String {
        guard let b = NetBob.base(o["address"] as? String ?? "") else { throw NetError("not a Tailscale address") }
        return b
    }
    private func reply(_ r: NetBob.Reply) -> [String: Any] { ["status": r.status, "body": r.body] }

    func call(_ json: String) {
        guard let d = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        let id = o["id"] as? String ?? String(describing: o["id"] ?? "")
        let op = o["op"] as? String ?? ""
        Task { @MainActor in
            do { try await self.run(op, id, o) } catch { self.fail(id, error.localizedDescription) }
        }
    }

    @MainActor private func run(_ op: String, _ id: String, _ o: [String: Any]) async throws {
        let str = { (k: String) in o[k] as? String ?? "" }
        switch op {
        // ---- Bob-Net: other Bobs ----
        case "net.check": answer(id, ["base": NetBob.base(str("address")) ?? NSNull()])
        case "net.login": answer(id, try await net.login(try base(o), str("code")))
        case "net.signedIn": answer(id, net.signedIn(try base(o)))
        case "net.forget": let b = try base(o); listening.set(b, false); net.forget(b); answer(id, true)
        case "net.get": answer(id, reply(try await net.get(try base(o), str("path"))))
        case "net.post": answer(id, reply(try await net.post(try base(o), str("path"), (o["body"] as? String) ?? "{}")))
        case "net.media": answer(id, try await net.media(try base(o), str("path")))
        case "net.listen":
            let b = try base(o)
            answer(id, true)
            if listening.swap(b, true) { return } // already listening
            let flags = listening, client = self.net
            Task.detached { [weak self] in
                await client.listen(b, stop: { !flags.get(b) },
                                 onEvent: { ev in self?.send(["event": "net", "base": b, "data": ev]); self?.maybeNotify(ev) },
                                 onState: { up in self?.send(["event": "net-state", "base": b, "up": up]) })
                flags.clear(b)
            }
        case "net.unlisten": listening.set(try base(o), false); answer(id, true)
        case "net.metered": answer(id, false)

        // ---- a photo for a Bob on your network to work on (the iPhone's own picker: no permission needed) ----
        case "photo.pick":
            if let old = photoCall { fail(old, "replaced") }
            photoCall = id
            var c = PHPickerConfiguration(); c.filter = .images; c.selectionLimit = 1
            let p = PHPickerViewController(configuration: c); p.delegate = self
            screen?.present(p, animated: true)
        case "photo.clear": photo = nil; answer(id, true)
        case "photo.upload":
            guard let bytes = photo else { throw NetError("no photo picked") }
            var allowed = CharacterSet.alphanumerics; allowed.insert(charactersIn: "-._~")
            let name = String((o["name"] as? String ?? "Photo from the phone").prefix(60)).addingPercentEncoding(withAllowedCharacters: allowed) ?? "Photo"
            let r = try await net.upload(try base(o), "/api/refs?kind=chat&name=\(name)", bytes, "image/jpeg")
            if r.status == 200 { photo = nil }
            answer(id, reply(r))
        // ---- Back up and move, Read aloud's own pick: a file from the Files app ----
        case "file.pick":
            if let old = fileCall { fail(old, "replaced") }
            fileCall = id
            let types: [UTType] = str("kind") == "text" ? [.plainText, .text, .json, .commaSeparatedText] : [.json, .plainText]
            let p = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true); p.delegate = self
            screen?.present(p, animated: true)
        // ---- save something Bob made (the Files app: On My iPhone, Bob) ----
        case "media.save":
            guard let got = try await net.download(try base(o), str("path"), timeout: Double(min(180000, max(5000, o["timeoutMs"] as? Int ?? 60000))) / 1000) else { throw NetError("too big or gone") }
            let (file, mime, named) = got
            answer(id, try keep(file, name: str("name").isEmpty ? named : str("name"), mime: mime))
        case "media.saveData":
            guard let data = Data(base64Encoded: str("data")) else { throw NetError("not a file") }
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try data.write(to: tmp)
            answer(id, try keep(tmp, name: str("name"), mime: str("mime")))

        // ---- the phone brain ----
        case "brain.status": answer(id, brain.status())
        case "brain.config": brain.freeWhenIdle = o["freeWhenIdle"] as? Bool ?? true; brain.idleMinutes = min(120, max(1, o["idleMinutes"] as? Int ?? 5)); answer(id, true)
        case "brain.download": try brain.download(file: str("file"), url: str("url"), bytes: (o["bytes"] as? NSNumber)?.int64Value ?? 0, sha256: str("sha256")); answer(id, true)
        case "brain.pause": brain.pauseDownload(); answer(id, true)
        case "brain.cancel": try brain.cancelDownload(file: str("file")); answer(id, true)
        case "brain.delete": answer(id, try brain.delete(file: str("file")))
        case "brain.chat":
            try brain.chat(file: str("file"), system: str("system"), history: o["history"] as? [[String: Any]] ?? [], text: str("text"), note: str("note"), maxTokens: o["maxTokens"] as? Int ?? 768)
            answer(id, true)
        case "brain.stop": brain.stop(); answer(id, true)
        case "brain.unload": await brain.unload("asked"); answer(id, true)
        case "brain.bench": try brain.bench(file: str("file")); answer(id, true)

        // ---- voice: the iPhone's own ----
        case "speech.say": say(str("text"), rate: o["rate"] as? Double ?? 1, pitch: o["pitch"] as? Double ?? 1, sid: (o["sid"] as? String).map { String($0.prefix(60)) } ?? "bob", add: o["add"] as? Bool ?? false); answer(id, true)
        case "speech.quiet": voice.stopSpeaking(at: .immediate); answer(id, true)
        case "speech.listen": throw NetError("Tap the keyboard's own microphone instead: it types what you say.")
        case "ears.start": throw NetError("listening by himself needs Bob for Android for now. Use the keyboard's microphone.")
        case "ears.stop": answer(id, true)

        // ---- Bob for Android's for now: answered so the page draws, refused when asked to do something ----
        case "lend.status": answer(id, [String: Any]())
        case "pair.waiting": answer(id, [Any]())
        case "pair.find": answer(id, [Any]())
        case "share.state": answer(id, false)
        case "share.take", "widget.take": answer(id, nil)
        case "widget.count", "widget.set": answer(id, 0)
        case "share.on": throw NetError("On an iPhone, Bob isn't in the Share menu yet: copy and paste instead.")

        // ---- phone bits ----
        case "notify": notifyNow(str("title"), str("text")); answer(id, true)
        case "open": if let u = URL(string: str("url")), ["https", "http"].contains(u.scheme ?? "") { _ = await UIApplication.shared.open(u) }; answer(id, true)
        case "copy": UIPasteboard.general.string = str("text"); answer(id, true)
        case "device":
            let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
            let model = UIDevice.current.model
            answer(id, ["model": model, "maker": "Apple", "ios": UIDevice.current.systemVersion, "version": v,
                        "about": "Bob \(v) for iPhone · \(model), iOS \(UIDevice.current.systemVersion)"])
        default:
            if op.hasPrefix("lend.") || op.hasPrefix("pair.") { throw NetError(Bridge.notHere) }
            throw NetError("unknown op")
        }
    }

    // ---- the photo picker ----
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let id = photoCall else { return }
        photoCall = nil
        guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { return answer(id, nil) }
        item.loadObject(ofClass: UIImage.self) { [weak self] obj, _ in
            guard let self = self else { return }
            guard let img = obj as? UIImage else { return self.fail(id, "that picture wouldn't open") }
            // Upright (UIImage follows the camera's turn), at most 2048 px on its long side, as a JPEG kept for photo.upload.
            func shrink(_ max: CGFloat) -> UIImage {
                let k = min(1, max / Swift.max(img.size.width, img.size.height))
                let size = CGSize(width: Swift.max(1, (img.size.width * k).rounded()), height: Swift.max(1, (img.size.height * k).rounded()))
                let f = UIGraphicsImageRendererFormat(); f.scale = 1
                return UIGraphicsImageRenderer(size: size, format: f).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
            }
            guard let big = shrink(2048).jpegData(compressionQuality: 0.9), big.count <= 14_000_000,
                  let small = shrink(256).jpegData(compressionQuality: 0.75) else { return self.fail(id, "that picture wouldn't open") }
            DispatchQueue.main.async {
                self.photo = big
                self.answer(id, ["preview": "data:image/jpeg;base64," + small.base64EncodedString(), "bytes": big.count])
            }
        }
    }

    // ---- the file picker ----
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let id = fileCall else { return }
        fileCall = nil
        guard let u = urls.first else { return answer(id, nil) }
        let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if size > 64 << 20 { return fail(id, "that file is bigger than a phone backup") }
        guard let d = try? Data(contentsOf: u) else { return fail(id, "that file wouldn't open") }
        answer(id, String(decoding: d, as: UTF8.self))
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if let id = fileCall { fileCall = nil; answer(id, nil) }
    }

    /// Keeps a file in the app's Documents/Bob folder (the Files app shows it under On My iPhone, Bob).
    private func keep(_ file: URL, name nameIn: String, mime: String) throws -> String {
        let bad = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        var name = String(nameIn.components(separatedBy: bad).joined(separator: "_").trimmingCharacters(in: .whitespaces).prefix(120))
        if name.isEmpty { name = "bob-file" + (UTType(mimeType: mime)?.preferredFilenameExtension.map { "." + $0 } ?? "") }
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Bob", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var dest = dir.appendingPathComponent(name)
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            let ext = (name as NSString).pathExtension, stem = (name as NSString).deletingPathExtension
            dest = dir.appendingPathComponent(ext.isEmpty ? "\(stem) (\(n))" : "\(stem) (\(n)).\(ext)"); n += 1
        }
        try FileManager.default.moveItem(at: file, to: dest)
        return "Files/On My iPhone/Bob/Bob/\(dest.lastPathComponent)"
    }

    // ---- Read aloud: the iPhone's own voices ----
    private func say(_ text: String, rate: Double, pitch: Double, sid: String, add: Bool) {
        if !add { voice.stopSpeaking(at: .immediate) }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        let u = AVSpeechUtterance(string: String(text.prefix(4000)))
        u.rate = Float(min(2, max(0.5, rate))) * AVSpeechUtteranceDefaultSpeechRate
        u.pitchMultiplier = Float(min(2, max(0.5, pitch)))
        u.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first)
        spoken[ObjectIdentifier(u)] = sid.isEmpty ? "bob" : sid
        voice.speak(u)
    }
    private func said(_ u: AVSpeechUtterance, _ state: String, end: Bool = false) {
        let sid = spoken[ObjectIdentifier(u)] ?? ""
        if end { spoken[ObjectIdentifier(u)] = nil }
        send(["event": "said", "sid": sid, "state": state])
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) { said(u, "start") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { said(u, "done", end: true) }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { said(u, "stop", end: true) }

    // ---- notifications: only while Bob's screen isn't showing ----
    private func maybeNotify(_ ev: [String: Any]) {
        DispatchQueue.main.async {
            guard self.inBackground else { return }
            let text = String((ev["text"] as? String ?? "").prefix(140))
            switch ev["type"] as? String {
            case "approval": self.notifyNow("Bob needs an OK", text)
            case "reminder": if ev["phone"] as? Bool == true { self.notifyNow("Bob: reminder", text) }
            default: break
            }
        }
    }
    private func notifyNow(_ title: String, _ text: String) {
        let c = UNUserNotificationCenter.current()
        c.requestAuthorization(options: [.alert, .sound]) { ok, _ in
            guard ok else { return }
            let n = UNMutableNotificationContent(); n.title = title; n.body = text
            c.add(UNNotificationRequest(identifier: UUID().uuidString, content: n, trigger: nil))
        }
    }

    func onBackground() { inBackground = true; send(["event": "app", "visible": false]) }
    func onForeground() { inBackground = false; send(["event": "app", "visible": true]) }
}

/// Which PC Bobs this screen is listening to, safe to read from the listening task.
final class Flags {
    private var on: [String: Bool] = [:]
    private let lock = NSLock()
    func get(_ k: String) -> Bool { lock.lock(); defer { lock.unlock() }; return on[k] == true }
    func set(_ k: String, _ v: Bool) { lock.lock(); on[k] = v; lock.unlock() }
    /// Sets it on and says whether it already was.
    func swap(_ k: String, _ v: Bool) -> Bool { lock.lock(); defer { lock.unlock() }; let was = on[k] == true; on[k] = v; return was }
    func clear(_ k: String) { lock.lock(); on[k] = nil; lock.unlock() }
}
