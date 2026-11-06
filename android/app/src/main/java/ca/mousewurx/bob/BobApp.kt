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
    lateinit var pair: Pairing
        private set
    /** Bob's own screen is showing (MainActivity started and not stopped). */
    @Volatile var bobVisible = false

    override fun onCreate() {
        super.onCreate()
        brain = PhoneBrain(this)
        lend = LendServer(this)
        pair = Pairing(this)
        // "Lend my brain" was on when Bob last closed: open the door again (Bob is starting in front, so Android allows it).
        if (lend.settings.on) startLending()
    }

    fun startLending() {
        val i = Intent(this, LendService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }

    /** Another Bob asked to pair while Bob's screen was closed: a notification brings you back to the card. */
    fun notifyPair(name: String) {
        val nm = getSystemService(android.app.NotificationManager::class.java)
        nm.createNotificationChannel(android.app.NotificationChannel(Bridge.CHANNEL, getString(R.string.notify_channel), android.app.NotificationManager.IMPORTANCE_DEFAULT))
        val open = android.app.PendingIntent.getActivity(this, 3, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), android.app.PendingIntent.FLAG_IMMUTABLE)
        val n = androidx.core.app.NotificationCompat.Builder(this, Bridge.CHANNEL).setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Bob: pairing").setContentText("$name wants to join your Bob-Net.").setContentIntent(open).setAutoCancel(true).build()
        try { androidx.core.app.NotificationManagerCompat.from(this).notify(4243, n) } catch (_: SecurityException) {}
    }

    fun stopLending() { stopService(Intent(this, LendService::class.java)) }

    val version: String get() = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: ""
}
