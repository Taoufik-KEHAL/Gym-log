package com.taoufikkehal.gymlog

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Fires once exactly at midnight to capture a fresh step-count baseline right at the day
// boundary, matching how Google Fit resets at midnight, then reschedules itself for the
// next midnight. Also (re)armed on boot (see BootReceiver), since AlarmManager alarms do
// not survive a reboot on their own.
//
// Port of the legacy Capacitor app's MidnightStepsAlarmReceiver.java (see
// android/app/src/main/java/com/taoufikkehal/gymlog/MidnightStepsAlarmReceiver.java in
// this repo) -- keep the two in sync when fixing bugs in this baseline logic.
class MidnightStepsAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        Thread {
            try {
                captureBaseline(appContext)
            } finally {
                scheduleNext(appContext)
                pendingResult.finish()
            }
        }.start()
    }

    companion object {
        private const val REQUEST_CODE = 4821

        fun captureBaseline(context: Context) {
            val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            val stepCounter = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return

            val latch = CountDownLatch(1)
            val reading = FloatArray(1)
            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    reading[0] = event.values[0]
                    latch.countDown()
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
            }

            sensorManager.registerListener(listener, stepCounter, SensorManager.SENSOR_DELAY_NORMAL)
            val gotReading = try {
                latch.await(10, TimeUnit.SECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            sensorManager.unregisterListener(listener)

            if (gotReading) {
                val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                val prefs = context.getSharedPreferences(StepsPrefs.NAME, Context.MODE_PRIVATE)
                prefs.edit()
                    .putString(StepsPrefs.KEY_BASELINE_DATE, today)
                    .putFloat(StepsPrefs.KEY_BASELINE_VALUE, reading[0])
                    .apply()
            }
        }

        // Schedules the next midnight alarm. On Android 12+ this requires the user to have
        // granted the "Alarms & reminders" special access; if it hasn't been granted yet,
        // this opens that settings screen instead of scheduling (and will be retried next
        // app open).
        fun scheduleNext(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                val settingsIntent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:" + context.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    context.startActivity(settingsIntent)
                } catch (ignored: Exception) {
                    // No such settings screen on this device/OEM; the lazy fallback baseline
                    // in StepsMethodCallHandler still works, just without a precise midnight
                    // reset.
                }
                return
            }

            val next = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 5)
                set(Calendar.MILLISECOND, 0)
            }

            val intent = Intent(context, MidnightStepsAlarmReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            try {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.timeInMillis, pendingIntent)
            } catch (ignored: SecurityException) {
                // Permission revoked between the check above and this call; skip for now.
            }
        }
    }
}
