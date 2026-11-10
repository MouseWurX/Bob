package ca.mousewurx.bob

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

// Bob's phone screen is a small web page bundled in the app (assets/www), drawn for a phone.
// Everything that needs Android (talking to other Bobs, the phone brain, microphone, voices,
// notifications) goes through Bridge, which the page reaches as window.BobPhone.
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    lateinit var bridge: Bridge
        private set

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        bridge = Bridge(this, web)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The page only reads its own bundled files; it never loads web pages or other files.
            allowFileAccess = true
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mediaPlaybackRequiresUserGesture = false
        }
        web.addJavascriptInterface(bridge, "BobPhone")
        web.webViewClient = object : WebViewClient() {
            // Links in Bob's replies open in the phone's browser, never inside Bob.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "file") return false
                if (url.scheme == "https" || url.scheme == "http") startActivity(Intent(Intent.ACTION_VIEW, url))
                return true
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The page closes its open panel first; only on the chat itself does Back leave the app.
                web.evaluateJavascript("window.bob && window.bob.back ? window.bob.back() : false") { handled ->
                    if (handled != "true") { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
                }
            }
        })
        web.loadUrl("file:///android_asset/www/index.html")
    }

    @Deprecated("Activity result for the microphone")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        bridge.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        bridge.onPermission(requestCode, grantResults)
    }

    override fun onStop() {
        super.onStop()
        (application as BobApp).bobVisible = false
        bridge.onBackground()
    }

    override fun onStart() {
        super.onStart()
        (application as BobApp).bobVisible = true
        if (::bridge.isInitialized) bridge.onForeground()
    }

    override fun onDestroy() {
        bridge.close()
        web.destroy()
        super.onDestroy()
    }

    fun openLink(url: String) {
        val u = Uri.parse(url)
        if (u.scheme == "https" || u.scheme == "http") startActivity(Intent(Intent.ACTION_VIEW, u))
    }
}
