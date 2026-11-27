// Nov 27 2026, the iPhone's half of "Where Bob connected" and "No internet": the same rules as Bob for Android's
// PhoneNet.kt (and the computer's src/no-internet.js). Every connection the app opens is written down (the site, when,
// what for; never the address's path or what was sent), and with No internet on (off unless you turn it on) a site
// that isn't allowed is stopped before anything is sent. Allowed: this phone, your own Bobs over Tailscale and your
// home network (both ticked to start), and the sites on your list. Kept: the last 300 in memory and net-log.jsonl in
// the app's own folder (about 1 MB, then the older half moves to net-log.jsonl.1).
import Foundation

enum PhoneNet {
    private static let keep = 300, maxFile: UInt64 = 1_000_000, sameMs = 60_000.0
    private static let d = UserDefaults(suiteName: "phone-net") ?? .standard
    private static let lock = NSLock()
    private static var recent: [[String: Any]] = []

    struct Stopped: LocalizedError {
        let host: String
        var errorDescription: String? { "Not connected: No internet is on, and \(host) isn't on the allowed list (Settings, Privacy, No internet)." }
    }

    static var on: Bool { d.bool(forKey: "on") }
    static var home: Bool { d.object(forKey: "home") as? Bool ?? true }
    static var bobNet: Bool { d.object(forKey: "bobNet") as? Bool ?? true }
    static var allow: [String] { (d.string(forKey: "allow") ?? "").split(separator: "\n").map(String.init).filter { !$0.isEmpty } }

    static func cleanSite(_ s: String) -> String {
        var h = s.trimmingCharacters(in: .whitespaces).lowercased()
        for (p, r) in [("^[a-z][a-z0-9+.-]*://", ""), ("[/?#].*$", ""), ("^\\*\\.", ""), ("\\.$", ""), (":\\d+$", "")] { h = h.replacingOccurrences(of: p, with: r, options: .regularExpression) }
        return h.range(of: "^[a-z0-9.-]{1,253}$", options: .regularExpression) != nil ? h : ""
    }

    private static func quad(_ h: String) -> [Int]? {
        let q = h.split(separator: ".").compactMap { Int($0) }
        return q.count == 4 && q.allSatisfy { (0...255).contains($0) } && h.split(separator: ".").count == 4 ? q : nil
    }
    static func isHome(_ h: String) -> Bool {
        if let q = quad(h) { return q[0] == 10 || (q[0] == 172 && (16...31).contains(q[1])) || (q[0] == 192 && q[1] == 168) || (q[0] == 169 && q[1] == 254) }
        return h.hasSuffix(".local") || h.hasSuffix(".lan") || h.hasSuffix(".home.arpa")
    }

    /// Would No internet stop a connection to host? Never one on this phone itself.
    static func stops(_ host: String) -> Bool {
        let h = host.lowercased()
        if h == "localhost" || h == "::1" || h.hasPrefix("127.") || !on { return false }
        if NetBob.isTailscaleHost(h) { return !bobNet }
        if isHome(h) { return !home }
        return !allow.contains { h == $0 || h.hasSuffix("." + $0) }
    }

    static func note(_ host: String, _ what: String, stopped: Bool) {
        let h0 = host.lowercased()
        if h0.isEmpty || h0 == "localhost" || h0.hasPrefix("127.") { return }
        let h = isHome(h0) ? "your home network" : h0
        let now = Date().timeIntervalSince1970 * 1000
        lock.lock(); defer { lock.unlock() }
        if let i = recent.firstIndex(where: { ($0["host"] as? String) == h && ($0["what"] as? String) == what && ($0["stopped"] as? Bool) == stopped && now - (($0["last"] as? Double) ?? 0) < sameMs }) {
            recent[i]["count"] = ((recent[i]["count"] as? Int) ?? 1) + 1; recent[i]["last"] = now; return
        }
        recent.insert(["at": now, "last": now, "host": h, "what": what, "stopped": stopped, "count": 1], at: 0)
        if recent.count > keep { recent.removeLast(recent.count - keep) }
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = dir.appendingPathComponent("net-log.jsonl")
        if let size = (try? FileManager.default.attributesOfItem(atPath: f.path))?[.size] as? UInt64, size > maxFile {
            let old = dir.appendingPathComponent("net-log.jsonl.1"); try? FileManager.default.removeItem(at: old); try? FileManager.default.moveItem(at: f, to: old)
        }
        var line: [String: Any] = ["at": ISO8601DateFormatter().string(from: Date()), "host": h, "what": what]
        if stopped { line["blocked"] = true }
        guard let data = try? JSONSerialization.data(withJSONObject: line), var text = String(data: data, encoding: .utf8) else { return }
        text += "\n"
        if let out = try? FileHandle(forWritingTo: f) { out.seekToEndOfFile(); out.write(Data(text.utf8)); try? out.close() }
        else { try? Data(text.utf8).write(to: f) } // the log never stops a connection
    }

    /// Checks and writes down a connection to url; throws Stopped when No internet stops it.
    static func check(_ url: URL, _ what: String) throws {
        let h = url.host ?? ""
        let stop = stops(h)
        note(h, what, stopped: stop)
        if stop { throw Stopped(host: h.lowercased()) }
    }

    static func view() -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        return ["on": on, "home": home, "bobNet": bobNet, "allow": allow,
                "stopped": recent.filter { ($0["stopped"] as? Bool) == true }.reduce(0) { $0 + (($1["count"] as? Int) ?? 1) },
                "recent": Array(recent.prefix(100))]
    }

    /// { on }, { home }, { bobNet }, { add: "site" } or { remove: "site" }.
    static func set(_ o: [String: Any]) throws -> [String: Any] {
        for k in ["on", "home", "bobNet"] { if let v = o[k] as? Bool { d.set(v, forKey: k) } }
        var list = allow
        if let a = o["add"] as? String { let s = cleanSite(a); if s.isEmpty { throw NetError("That isn't a site name I can use. Like example.com.") }; if !list.contains(s) { list.append(s) } }
        if let r = o["remove"] as? String { let s = cleanSite(r); list.removeAll { $0 == s } }
        d.set(list.prefix(200).joined(separator: "\n"), forKey: "allow")
        return view()
    }
}
