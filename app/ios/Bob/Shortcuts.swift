// 🖐 Bob for iPhone's hands: Shortcuts (Settings, Phone brain, Let Bob run Shortcuts; off to start with).
// Apple lets no app tap in or read another, so Bob asks the Shortcuts app to run one of the Shortcuts you named,
// through its x-callback-url door, and the Shortcut's answer comes back to Bob's own address (bob-phone://).
// The page asks for your OK before each run (phone-hands.js); only a run Bob started can be answered, by its id.
// Unproven in our lab, as we have yet to test it on a real iPhone.
import UIKit
import AppIntents

@MainActor final class ShortcutRunner {
    static let shared = ShortcutRunner()
    static let scheme = "bob-phone"
    private var waiting: [String: CheckedContinuation<[String: Any], Never>] = [:]

    /// Letters Shortcuts gets as they are; everything else percent-encoded (so & and = inside a value stay inside it).
    private static func enc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")) ?? ""
    }

    func run(name: String, input: String) async -> [String: Any] {
        let run = UUID().uuidString
        let back = { (how: String) in Self.enc("\(Self.scheme)://shortcut?run=\(run)&how=\(how)") }
        var q = "name=\(Self.enc(name))"
        if !input.isEmpty { q += "&input=text&text=\(Self.enc(input))" }
        q += "&x-success=\(back("done"))&x-cancel=\(back("cancel"))&x-error=\(back("error"))"
        guard let url = URL(string: "shortcuts://x-callback-url/run-shortcut?\(q)") else { return ["ok": false, "why": "that name can't be sent to Shortcuts"] }
        return await withCheckedContinuation { (k: CheckedContinuation<[String: Any], Never>) in
            waiting[run] = k
            UIApplication.shared.open(url, options: [:]) { opened in
                if !opened { self.finish(run, ["ok": false, "why": "the Shortcuts app didn't open"]) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 600) { self.finish(run, ["ok": false, "why": "no answer came back within 10 minutes"]) }
        }
    }

    private func finish(_ run: String, _ r: [String: Any]) { waiting.removeValue(forKey: run)?.resume(returning: r) }

    /// bob-phone://shortcut?run=…&how=done&result=… (Shortcuts adds result when the Shortcut hands something back,
    /// errorMessage when it fails). Anything else at this address is ignored.
    @discardableResult func handle(_ url: URL) -> Bool {
        guard url.scheme == Self.scheme, url.host == "shortcut",
              let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let run = q.first(where: { $0.name == "run" })?.value, waiting[run] != nil else { return false }
        let v = { (k: String) in q.first(where: { $0.name == k })?.value ?? "" }
        switch v("how") {
        case "done": finish(run, ["ok": true, "result": String(v("result").prefix(20000))])
        case "cancel": finish(run, ["ok": false, "why": "it was cancelled"])
        default: finish(run, ["ok": false, "why": v("errorMessage").isEmpty ? "the Shortcut stopped with an error" : String(v("errorMessage").prefix(300))])
        }
        return true
    }
}

/// "Ask Bob", for Siri and the Shortcuts app: opens Bob with your words in the message box, waiting for your Send,
/// like sharing to Bob on Android. Other Shortcuts can use it as a step.
struct AskBob: AppIntent {
    static var title: LocalizedStringResource = "Ask Bob"
    static var description = IntentDescription("Opens Bob with your words in the message box, ready to send.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Words")
    var words: String

    @MainActor
    func perform() async throws -> some IntentResult {
        Bridge.incoming(words)
        return .result()
    }
}

struct BobAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AskBob(), phrases: ["Ask \(.applicationName)", "Talk to \(.applicationName)"])
    }
}
