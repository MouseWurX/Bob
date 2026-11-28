package ca.mousewurx.bob

// 🖐 Phone hands: the rules, kept apart from Android so a PC can check them (android/tools/HandsRulesCheck.kt).
// The brain never sees these as advice: HandsService asks them before every single move, and a "no" here is a no
// whatever the brain says. They follow the PC's Apps hand (src/hands-apps.js):
//  - never Bob's own app (so he can never press his own OK), Android's Settings, app installers and permission
//    screens, the lock screen and notification shade, password managers and sign-in code apps,
//  - never reads or types in a password field,
//  - a tap on something that sends, pays, deletes, installs or calls always asks, even after "OK for this job".
object HandsRules {
    const val OWN = "ca.mousewurx.bob"

    // Package names (exact, or a prefix ending in '.') and why they're off limits.
    private val BLOCKED: List<Pair<String, String>> = listOf(
        OWN to "That's Bob's own app. Bob never taps his own buttons.",
        "com.android.systemui" to "That's Android's lock screen and notification shade, which Bob leaves to you.",
        "com.android.settings" to "Android's Settings are off limits: they can change what Bob is allowed to do.",
        "com.samsung.android.settings." to "Android's Settings are off limits: they can change what Bob is allowed to do.",
        "com.google.android.packageinstaller" to "App installers are off limits.",
        "com.android.packageinstaller" to "App installers are off limits.",
        "com.google.android.permissioncontroller" to "Permission screens are off limits: what an app may do is yours to say.",
        "com.android.permissioncontroller" to "Permission screens are off limits: what an app may do is yours to say.",
        "com.google.android.gms.auth." to "Sign-in screens are off limits.",
        "com.x8bit.bitwarden" to "Password managers are off limits.",
        "com.agilebits.onepassword" to "Password managers are off limits.",
        "com.lastpass.lpandroid" to "Password managers are off limits.",
        "com.dashlane" to "Password managers are off limits.",
        "keepass2android." to "Password managers are off limits.",
        "com.kunzisoft.keepass." to "Password managers are off limits.",
        "proton.android.pass" to "Password managers are off limits.",
        "com.callpod.android_apps.keeper" to "Password managers are off limits.",
        "com.samsung.android.samsungpass" to "Password managers are off limits.",
        "com.google.android.apps.authenticator2" to "Sign-in code apps are off limits.",
        "com.azure.authenticator" to "Sign-in code apps are off limits.",
        "com.authy.authy" to "Sign-in code apps are off limits.",
    )
    // App names Bob won't open, for apps whose package names differ from phone to phone.
    private val BLOCKED_NAME = Regex("""\b(settings|password|passwords|authenticator|bitwarden|1password|lastpass|dashlane|keepass|keeper|proton pass|samsung pass|package installer)\b""", RegexOption.IGNORE_CASE)
    // Screens whose words say they're a sign-in or security prompt.
    private val BLOCKED_WORDS = Regex("""\b(password|passcode|passphrase|one[- ]time code|verification code|2fa|two[- ]factor|recovery (key|code|phrase)|seed phrase|cvv|cvc)\b""", RegexOption.IGNORE_CASE)
    // Things that leave the phone, cost money or can't be undone: always an OK, every time.
    private val RISKY = Regex("""\b(send|post|publish|share|reply|comment|tweet|upload|submit|pay|buy|purchase|checkout|check out|order|subscribe|donate|transfer|delete|remove|erase|uninstall|install|call|dial|accept|agree|confirm|sign out|log out|unlock)\b""", RegexOption.IGNORE_CASE)

    /** Why an app (by its package name) is off limits, or "" when Bob may use it. */
    fun blockedApp(pkg: String?): String {
        val p = (pkg ?: "").trim().lowercase()
        if (p.isEmpty()) return "Bob can't tell which app is in front, so he leaves it alone."
        for ((name, why) in BLOCKED) if (p == name || (name.endsWith(".") && p.startsWith(name)) || p.startsWith("$name.")) return why
        return ""
    }

    /** Why an app (by the name on its icon) won't be opened, or "". */
    fun blockedName(label: String?): String = if (BLOCKED_NAME.containsMatchIn(label ?: "")) "$label is off limits to Bob's hands." else ""

    /** The screen looks like a sign-in or security prompt (its words, not the app's name). */
    fun securityScreen(words: String?): Boolean = BLOCKED_WORDS.containsMatchIn(words ?: "")

    /** A tap on this always waits for an OK, even with "OK for this job". */
    fun risky(label: String?): Boolean = RISKY.containsMatchIn(label ?: "")

    /** Text Bob may type: no more than a short message's worth, and no line breaks that could press Send. */
    fun cleanTyping(text: String?): String {
        val t = (text ?: "").replace(Regex("[\\u0000-\\u0008\\u000B-\\u001F\\u007F]"), "")
        if (t.length > 4000) throw IllegalArgumentException("That's more than 4,000 letters. Type less at a time.")
        return t
    }

    /** The words on the OK card for one move. */
    fun describe(action: String, app: String, target: String, text: String = ""): String {
        val a = app.ifBlank { "this app" }
        val t = target.take(80).ifBlank { "the screen" }
        return when (action) {
            "tap" -> "Tap \"$t\" in $a"
            "long_press" -> "Press and hold \"$t\" in $a"
            "type" -> "Type \"${text.take(120)}${if (text.length > 120) "…" else ""}\" into \"$t\" in $a"
            "scroll" -> "Scroll $t in $a"
            "swipe" -> "Swipe $t in $a"
            "tap_at" -> "Tap the screen at $t in $a"
            "back" -> "Press Back in $a"
            "home" -> "Go to the home screen"
            "open" -> "Open $t"
            else -> "$action in $a"
        }
    }
}
