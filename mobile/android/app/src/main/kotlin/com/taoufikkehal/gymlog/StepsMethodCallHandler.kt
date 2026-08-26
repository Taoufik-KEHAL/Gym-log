package com.taoufikkehal.gymlog

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Reads/writes today's step count via the phone's built-in step counter sensor, exposed to
// Flutter over a MethodChannel. TYPE_STEP_COUNTER reports a cumulative total since the
// device's last boot, so "today's steps" is tracked as (current total - a baseline captured
// at the start of today). The baseline is normally (re)captured by
// MidnightStepsAlarmReceiver at midnight and by BootReceiver right after a reboot; if
// neither has run yet today, this falls back to setting one lazily on its own first read of
// the day.
//
// Port of the legacy Capacitor app's StepsPlugin.java (see
// android/app/src/main/java/com/taoufikkehal/gymlog/StepsPlugin.java in this repo) -- keep
// the two in sync when fixing bugs in this baseline logic.
class StepsMethodCallHandler(private val activity: Activity) : MethodChannel.MethodCallHandler, SensorEventListener {
    private val sensorManager = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    private var pendingResult: MethodChannel.Result? = null
    private var pendingPermissionResult: MethodChannel.Result? = null

    // Non-null while a setTodaySteps() call is waiting on a sensor read: holds the
    // authoritative "steps so far today" value to splice in as the new baseline.
    private var recalibrateTargetSteps: Int? = null

    init {
        MidnightStepsAlarmReceiver.scheduleNext(activity.applicationContext)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getTodaySteps" -> {
                recalibrateTargetSteps = null
                startRead(result)
            }
            "setTodaySteps" -> {
                val steps = call.argument<Int>("steps")
                if (steps == null) {
                    result.error("MISSING_STEPS", "Missing steps value", null)
                    return
                }
                recalibrateTargetSteps = steps
                startRead(result)
            }
            else -> result.notImplemented()
        }
    }

    private fun startRead(result: MethodChannel.Result) {
        if (stepCounterSensor == null) {
            recalibrateTargetSteps = null
            result.error("NO_SENSOR", "No step counter sensor on this device", null)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.ACTIVITY_RECOGNITION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            pendingPermissionResult = result
            ActivityCompat.requestPermissions(
                activity, arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), PERMISSION_REQUEST_CODE
            )
            return
        }
        readSteps(result)
    }

    // Called from MainActivity.onRequestPermissionsResult(). Returns true if this handler
    // owned the request (and has therefore resolved it).
    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray): Boolean {
        if (requestCode != PERMISSION_REQUEST_CODE) return false
        val result = pendingPermissionResult ?: return true
        pendingPermissionResult = null
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            readSteps(result)
        } else {
            recalibrateTargetSteps = null
            result.error("PERMISSION_DENIED", "Activity recognition permission denied", null)
        }
        return true
    }

    private fun readSteps(result: MethodChannel.Result) {
        pendingResult = result
        sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val result = pendingResult ?: return
        val totalSinceBoot = event.values[0]
        sensorManager.unregisterListener(this)
        pendingResult = null

        val prefs = activity.getSharedPreferences(StepsPrefs.NAME, Context.MODE_PRIVATE)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val baseline: Float

        val target = recalibrateTargetSteps
        if (target != null) {
            baseline = totalSinceBoot - target
            recalibrateTargetSteps = null
        } else {
            val baselineDate = prefs.getString(StepsPrefs.KEY_BASELINE_DATE, null)
            baseline = if (today == baselineDate) {
                prefs.getFloat(StepsPrefs.KEY_BASELINE_VALUE, totalSinceBoot)
            } else {
                // No baseline captured for today yet (the midnight alarm hasn't fired
                // since the day rolled over) -- fall back to starting from right now.
                totalSinceBoot
            }
        }
        prefs.edit()
            .putString(StepsPrefs.KEY_BASELINE_DATE, today)
            .putFloat(StepsPrefs.KEY_BASELINE_VALUE, baseline)
            .apply()
        val todaySteps = maxOf(0, (totalSinceBoot - baseline).toInt())

        result.success(todaySteps)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        private const val PERMISSION_REQUEST_CODE = 84210
    }
}
