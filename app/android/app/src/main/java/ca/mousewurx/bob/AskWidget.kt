package ca.mousewurx.bob

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

// A home-screen widget (item 134, 2026-11-11): an "Ask Bob" box, a 🎙 to talk, and your next reminder. It only exists
// if you put it on your home screen (long-press the home screen, Widgets, Bob). It reads nothing by itself and goes
// online for nothing: Bob writes the reminder line here while his screen is open, and only with Settings, "Show my
// next reminder on the widget" on. Otherwise the line just says "Tap to ask Bob".
class AskWidget : AppWidgetProvider() {
    companion object {
        private const val PREFS = "bob.widget"
        const val EXTRA = "ca.mousewurx.bob.WIDGET"

        fun save(ctx: Context, text: String, whenText: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("text", text.take(140)).putString("when", whenText.take(60)).apply()
            update(ctx)
        }

        fun count(ctx: Context): Int = AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, AskWidget::class.java)).size

        fun update(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, AskWidget::class.java))
            if (ids.isNotEmpty()) mgr.updateAppWidget(ids, views(ctx))
        }

        private fun open(ctx: Context, what: String, code: Int): PendingIntent =
            PendingIntent.getActivity(ctx, code, Intent(ctx, MainActivity::class.java).putExtra(EXTRA, what)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        private fun views(ctx: Context): RemoteViews {
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val text = p.getString("text", "").orEmpty()
            val whenText = p.getString("when", "").orEmpty()
            return RemoteViews(ctx.packageName, R.layout.widget_ask).apply {
                setTextViewText(R.id.widget_next, if (text.isBlank()) ctx.getString(R.string.widget_no_reminder) else "⏰ ${if (whenText.isBlank()) "" else "$whenText: "}$text")
                setOnClickPendingIntent(R.id.widget_ask, open(ctx, "ask", 41))
                setOnClickPendingIntent(R.id.widget_talk, open(ctx, "talk", 42))
                setOnClickPendingIntent(R.id.widget_next, open(ctx, "ask", 43))
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetManager.updateAppWidget(appWidgetIds, views(context))
    }
}
