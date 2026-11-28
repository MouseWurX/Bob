// Bob for iPhone: Bob for Android's phone screen (android/app/src/main/assets/www, copied in by tools/make-www.sh)
// in a WKWebView, with Bridge.swift playing the part Bridge.kt plays on Android. The page only ever reads its own
// bundled files (the bob:// scheme below); talking to a PC Bob and the phone brain happen natively.
import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = PhoneScreen()
        w.makeKeyAndVisible()
        window = w
        return true
    }

    /// bob-phone:// — a Shortcut Bob ran, answering (Shortcuts.swift).
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        ShortcutRunner.shared.handle(url)
    }
}

/// Hands the page its own files from the app bundle's www folder, and nothing else.
final class AppFiles: NSObject, WKURLSchemeHandler {
    static let scheme = "bob"
    private let root = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true).standardizedFileURL

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path.removingPercentEncoding ?? url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            let r = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            task.didReceive(r); task.didReceive(Data("not here".utf8)); task.didFinish(); return
        }
        let r = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": AppFiles.type(file.pathExtension), "Cache-Control": "no-store"])!
        task.didReceive(r)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func type(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

final class PhoneScreen: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var web: WKWebView!
    private(set) var bridge: Bridge!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppFiles(), forURLScheme: AppFiles.scheme)
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true
        // window.BobPhone, the way phone.js reaches the phone (Android's addJavascriptInterface), before any page script.
        let door = "window.BobPhone = { ios: true, call: function (json) { window.webkit.messageHandlers.bob.postMessage(String(json)); } };"
        config.userContentController.addUserScript(WKUserScript(source: door, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "bob")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0x1d / 255.0, green: 0x15 / 255.0, blue: 0x10 / 255.0, alpha: 1)
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view = web
        bridge = Bridge(screen: self, web: web)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: URL(string: "\(AppFiles.scheme)://app/index.html")!))
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.bridge.onBackground() }
        nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in self?.bridge.onForeground() }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let json = message.body as? String { bridge.call(json) }
    }

    // Links in Bob's replies open in Safari, never inside Bob.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == AppFiles.scheme || url.scheme == "about" || url.scheme == "data" || url.scheme == "blob" { return decisionHandler(.allow) }
        if url.scheme == "https" || url.scheme == "http" || url.scheme == "mailto" || url.scheme == "tel" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SelfTest.pageLoaded(web)
    }
}
