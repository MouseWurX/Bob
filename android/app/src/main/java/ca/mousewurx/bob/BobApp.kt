package ca.mousewurx.bob

import android.app.Application
import android.content.Intent
import android.os.Build

// One phone brain and one "Lend my brain" door per app, so lending carries on while Bob's screen is closed.
class BobApp : Application() {
    lateinit var brain: PhoneBrain
        private set
    lateinit var lend: LendServer
        private set
    /** Bob's own screen is showing (MainActivity started and not stopped). */
    @Volatile var bobVisible = false

    override fun onCreate() {
        super.onCreate()
        brain = PhoneBrain(this)
        lend = LendServer(this)
        // "Lend my brain" was on when Bob last closed: open the door again (Bob is starting in front, so Android allows it).
        if (lend.settings.on) startLending()
    }

    fun startLending() {
        val i = Intent(this, LendService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }

    fun stopLending() { stopService(Intent(this, LendService::class.java)) }

    val version: String get() = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: ""
}
