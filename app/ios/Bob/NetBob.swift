// Talks to a Bob on your network (desktop Bob with Bob-Net access on), over Tailscale only: the same rules as
// Bob for Android's NetBob.kt. The passcode is used once to log in and never kept; only the login cookie the PC
// Bob hands back is kept, in the iPhone's Keychain (this device only).
import Foundation
import Security

final class NetBob: NSObject, URLSessionTaskDelegate {
    static let defaultPort = 7777

    struct Reply { let status: Int; let body: String; let type: String }

    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieAcceptPolicy = .never
        c.httpShouldSetCookies = false
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 30
        return URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }()

    // Never follow a redirect (the login answers 303; the cookie is read from that answer).
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    // Same rule as phone.js netAddress(): Tailscale addresses only (100.64.0.0/10, or a *.ts.net name).
    static func isTailscaleHost(_ host: String) -> Bool {
        let h = host.lowercased()
        let parts = h.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count == 4, parts.allSatisfy({ !$0.isEmpty && $0.count <= 3 && $0.allSatisfy(\.isNumber) }) {
            let n = parts.compactMap { Int($0) }
            return n.count == 4 && n[0] == 100 && (64...127).contains(n[1]) && n[2] <= 255 && n[3] <= 255
        }
        guard h.count <= 253, h.hasSuffix(".ts.net") else { return false }
        let label = try! NSRegularExpression(pattern: "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
        return parts.allSatisfy { p in let s = String(p); return label.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }
    }

    /// "my-pc.tail1234.ts.net" or "100.101.102.103:7777" -> "http://host:port", or nil if it isn't a Tailscale address.
    static func base(_ address: String) -> String? {
        var a = address.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if a.hasPrefix("http://") { a.removeFirst(7) }
        while a.hasSuffix("/") { a.removeLast() }
        if a.isEmpty || a.contains("/") || a.contains("@") || a.hasPrefix("https:") { return nil }
        var port = defaultPort
        if let colon = a.lastIndex(of: ":"), colon > a.startIndex {
            guard let p = Int(a[a.index(after: colon)...]), (1...65535).contains(p) else { return nil }
            port = p
            a = String(a[..<colon])
        }
        guard isTailscaleHost(a) else { return nil }
        return "http://\(a):\(port)"
    }

    // ---- the login cookie, in the Keychain ----
    private func keychain(_ base: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "ca.mousewurx.bob.netbob", kSecAttrAccount as String: "cookie:\(base)"]
    }
    private func cookie(_ base: String) -> String? {
        var q = keychain(base); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    private func keep(_ base: String, _ value: String) {
        SecItemDelete(keychain(base) as CFDictionary)
        var q = keychain(base)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
    func forget(_ base: String) { SecItemDelete(keychain(base) as CFDictionary) }
    func signedIn(_ base: String) -> Bool { cookie(base) != nil }

    private func request(_ base: String, _ path: String, _ method: String, timeout: TimeInterval = 8) throws -> URLRequest {
        guard NetBob.base(String(base.dropFirst("http://".count))) == base else { throw NetError("Not a Tailscale address") }
        guard path.hasPrefix("/"), !path.hasPrefix("//"), let url = URL(string: base + path) else { throw NetError("Bad path") }
        var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        r.httpMethod = method
        if let c = cookie(base) { r.setValue(c, forHTTPHeaderField: "Cookie") }
        return r
    }

    private func send(_ r: URLRequest, base: String) async throws -> Reply {
        let (data, resp) = try await session.data(for: r)
        let h = resp as? HTTPURLResponse
        let status = h?.statusCode ?? 0
        // A login page back means the cookie went stale (passcode changed on the PC).
        if status == 401 { forget(base) }
        let body = String(decoding: data.prefix(2_000_000), as: UTF8.self)
        return Reply(status: status, body: body, type: h?.value(forHTTPHeaderField: "Content-Type") ?? "")
    }

    /// Log in with the passcode. "ok", "wrong", "busy" (too many tries), "not-let-in", or "error N".
    func login(_ base: String, _ code: String) async throws -> String {
        var r = try request(base, "/login", "POST")
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics; allowed.insert(charactersIn: "-._~")
        r.httpBody = Data(("code=" + (code.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")).utf8)
        let (_, resp) = try await session.data(for: r)
        let h = resp as? HTTPURLResponse
        let status = h?.statusCode ?? 0
        let set = (h?.value(forHTTPHeaderField: "Set-Cookie") ?? "").components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.first { $0.hasPrefix("bob_auth=") }
        switch status {
        case 303 where set != nil: keep(base, String(set!.split(separator: ";").first ?? "")); return "ok"
        case 403: return "not-let-in"
        case 429: return "busy"
        case 401: return "wrong"
        default: return "error \(status)"
        }
    }

    func get(_ base: String, _ path: String) async throws -> Reply { try await send(try request(base, path, "GET"), base: base) }

    func post(_ base: String, _ path: String, _ json: String) async throws -> Reply {
        var r = try request(base, path, "POST", timeout: 30)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("1", forHTTPHeaderField: "x-bob")
        r.httpBody = Data(json.utf8)
        return try await send(r, base: base)
    }

    /// Sends a picture (bytes) to that Bob, e.g. /api/refs for a photo to work on.
    func upload(_ base: String, _ path: String, _ bytes: Data, _ type: String) async throws -> Reply {
        var r = try request(base, path, "POST", timeout: 60)
        r.setValue(type, forHTTPHeaderField: "Content-Type")
        r.setValue("1", forHTTPHeaderField: "x-bob")
        r.httpBody = bytes
        return try await send(r, base: base)
    }

    /// A picture, clip or song from that Bob, as a data: URL the page can show (up to 25 MB).
    func media(_ base: String, _ path: String) async throws -> String? {
        let (data, resp) = try await session.data(for: try request(base, path, "GET", timeout: 30))
        guard let h = resp as? HTTPURLResponse, h.statusCode == 200, data.count <= 25_000_000 else { return nil }
        let type = (h.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream").split(separator: ";").first.map(String.init) ?? "application/octet-stream"
        return "data:\(type);base64," + data.base64EncodedString()
    }

    /// A file from that Bob (up to 200 MB), saved to a temporary file: (file, type, the name Bob gave it).
    func download(_ base: String, _ path: String, timeout: TimeInterval) async throws -> (URL, String, String)? {
        let (file, resp) = try await session.download(for: try request(base, path, "GET", timeout: timeout))
        guard let h = resp as? HTTPURLResponse, h.statusCode == 200 else { return nil }
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
        if size > 200_000_000 { try? FileManager.default.removeItem(at: file); return nil }
        let mime = (h.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream").split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? "application/octet-stream"
        var named = ""
        if let cd = h.value(forHTTPHeaderField: "Content-Disposition"), let r = cd.range(of: "filename=") {
            named = cd[r.upperBound...].trimmingCharacters(in: CharacterSet(charactersIn: "\" ")).components(separatedBy: ";").first ?? ""
        }
        return (file, mime, named)
    }

    /// Follows that Bob's live events (replies as they're written, OK cards, job progress) until stopped.
    func listen(_ base: String, stop: @escaping () -> Bool, onEvent: @escaping ([String: Any]) -> Void, onState: @escaping (Bool) -> Void) async {
        var wait: UInt64 = 1000
        while !stop() {
            do {
                var r = try request(base, "/api/events", "GET", timeout: 60)
                r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                let (bytes, resp) = try await session.bytes(for: r)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if code != 200 {
                    onState(false)
                    if code == 401 { forget(base); return } // signed out: the page asks for the passcode again
                } else {
                    onState(true); wait = 1000
                    for try await line in bytes.lines {
                        if stop() { break }
                        if line.hasPrefix("data: "), let d = line.dropFirst(6).data(using: .utf8),
                           let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] { onEvent(o) }
                    }
                    onState(false)
                }
            } catch { onState(false) }
            if stop() { break }
            try? await Task.sleep(nanoseconds: wait * 1_000_000)
            wait = min(wait * 2, 30000)
        }
    }
}

struct NetError: LocalizedError {
    let why: String
    init(_ why: String) { self.why = why }
    var errorDescription: String? { why }
}
