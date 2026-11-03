package ca.mousewurx.bob

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

// While "Lend my brain" is on, Android shows this notification, and Bob keeps the door open even with his screen
// closed. "Stop lending" on the notification turns the setting off.
class LendService : Service() {
    companion object {
        const val CHANNEL = "lend"
        const val ID = 4242
        const val STOP = "ca.mousewurx.bob.STOP_LENDING"
    }

    private val app get() = application as BobApp

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            app.lend.setOn(false)
            stopSelf()
            return START_NOT_STICKY
        }
        val n = notification(app.lend.statusLine())
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(ID, n)
        app.lend.onChange = { line -> getSystemService(NotificationManager::class.java).notify(ID, notification(line)) }
        app.lend.start()
        return START_STICKY
    }

    override fun onDestroy() {
        app.lend.onChange = null
        app.lend.stop()
        super.onDestroy()
    }

    private fun notification(line: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.lend_channel), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, LendService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.lend_title))
            .setContentText(line)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(0, getString(R.string.lend_stop), stop)
            .build()
    }
}
