// Checks HandsRules.kt (what Bob's phone hands may never touch, and what always asks) on a PC, without Android:
//   kotlinc android/app/src/main/java/ca/mousewurx/bob/HandsRules.kt android/tools/HandsRulesCheck.kt -include-runtime -d hr.jar
//   java -cp hr.jar HandsRulesCheckKt
import ca.mousewurx.bob.HandsRules
fun check(n: String, ok: Boolean) { println((if (ok) "PASS " else "FAIL ") + n); if (!ok) System.exit(1) }
fun main() {
    for (p in listOf("ca.mousewurx.bob", "ca.mousewurx.bob.debug", "com.android.settings", "com.samsung.android.settings.intelligence", "com.android.systemui",
        "com.google.android.packageinstaller", "com.google.android.permissioncontroller", "com.x8bit.bitwarden", "keepass2android.keepass2android", "com.google.android.apps.authenticator2", "", null))
        check("off limits: $p", HandsRules.blockedApp(p).isNotEmpty())
    for (p in listOf("com.android.chrome", "com.google.android.calendar", "com.spotify.music", "com.whatsapp", "org.mozilla.firefox", "com.android.settingsx"))
        check("allowed: $p", HandsRules.blockedApp(p).isEmpty())
    check("own app says why", HandsRules.blockedApp("ca.mousewurx.bob").contains("own app"))
    for (n in listOf("Settings", "Bitwarden", "Google Authenticator", "Samsung Pass")) check("won't open: $n", HandsRules.blockedName(n).isNotEmpty())
    for (n in listOf("Chrome", "Calendar", "Maps", "Spotify")) check("opens: $n", HandsRules.blockedName(n).isEmpty())
    for (w in listOf("Send", "Post", "Buy now", "Pay \$12.00", "Delete", "Install", "Call Sam", "Confirm order", "Share")) check("always asks: $w", HandsRules.risky(w))
    for (w in listOf("Search", "Next", "Settings tab", "Play", "Open menu", "Sender name")) check("asks once per job: $w", !HandsRules.risky(w))
    check("sign-in words", HandsRules.securityScreen("Enter your verification code") && HandsRules.securityScreen("Password") && !HandsRules.securityScreen("Inbox"))
    check("typing keeps line breaks, drops control codes", HandsRules.cleanTyping("hi\nthere\u0007") == "hi\nthere")
    check("typing too long refused", runCatching { HandsRules.cleanTyping("x".repeat(4001)) }.isFailure)
    check("card words", HandsRules.describe("type", "Messages", "Message", "on my way") == "Type \"on my way\" into \"Message\" in Messages")
    check("card words: tap", HandsRules.describe("tap", "", "Search") == "Tap \"Search\" in this app")
}
