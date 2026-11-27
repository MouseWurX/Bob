// GitHub's check for Bob for iPhone (.github/workflows/ios.yml), in the iPhone simulator. Only runs when the app is
// started with -BobSelfTest YES: it notes whether the phone screen came up, then (when the check put a brain file
// in Documents/selftest) has the phone brain answer one message, and writes it all to Documents/self-test.json.
// A simulator, not a phone: it can't show a real iPhone's memory limit, speed or heat.
import Foundation
import WebKit

enum SelfTest {
    static var on: Bool { UserDefaults.standard.bool(forKey: "BobSelfTest") }
    private static var result: [String: Any] = [:]
    private static var started = false

    private static var out: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("self-test.json") }
    private static func write() {
        if let d = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]) { try? d.write(to: out) }
    }

    static func pageLoaded(_ web: WKWebView) {
        guard on, !started else { return }
        started = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            web.evaluateJavaScript("[typeof window.bob, typeof window.bob?.fromPhone, typeof window.BobPhone, document.querySelector('#text') ? 'compose' : 'none'].join('|')") { v, e in
                result["page"] = (v as? String) ?? "error: \(e?.localizedDescription ?? "?")"
                write()
                brainTest()
            }
        }
    }

    private static func brainTest() {
        let fm = FileManager.default
        let dir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("selftest")
        guard let file = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))?.first(where: { $0.pathExtension == "gguf" }) else {
            result["brain"] = "no brain file to try"; result["done"] = true; write(); return
        }
        let brain = PhoneBrain.shared
        let dest = brain.modelsDir.appendingPathComponent(file.lastPathComponent)
        try? fm.removeItem(at: dest)
        try? fm.moveItem(at: file, to: dest)
        var text = ""
        let old = brain.listener
        brain.listener = { m in
            old?(m)
            switch m["type"] as? String {
            case "token": text += m["text"] as? String ?? ""
            case "done", "error":
                var b = m; b["text"] = text.isEmpty ? (m["text"] ?? "") : text; b["memoryLeftMB"] = PhoneBrain.memoryLeftMB
                result["brain"] = b; result["done"] = true; write()
                brain.listener = old
            default: break
            }
        }
        do {
            try brain.chat(file: dest.lastPathComponent, system: "You are Bob, a helpful assistant. Answer in one short sentence.",
                           history: [], text: "What is the capital of France?", note: "", maxTokens: 64)
        } catch {
            result["brain"] = ["type": "error", "text": error.localizedDescription]; result["done"] = true; write()
        }
    }
}
