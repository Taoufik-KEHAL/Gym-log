package com.taoufikkehal.gymlog;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// Reads today's step count from the phone's built-in step counter sensor, and keeps it
// live: once activity-recognition permission is granted, the sensor listener stays
// registered for as long as the app is running (not just for one-shot reads), pushing a
// "stepsUpdate" event to JS on every step so the UI stays in sync automatically -- no
// manual sync action needed. Uses SENSOR_DELAY_FASTEST since TYPE_STEP_COUNTER is a
// low-power, hardware-batched sensor: the delay only affects notification latency, not
// how much power the step-counting hardware itself draws.
//
// TYPE_STEP_COUNTER reports a cumulative total since the device's last boot, so "today's
// steps" is tracked as (current total - a baseline captured at the start of today). The
// baseline is (re)captured by MidnightStepsAlarmReceiver at midnight, by BootReceiver right
// after a reboot, and self-heals on every sensor read whenever the stored baseline's date
// doesn't match today (covers the rare case both of those miss a day boundary).
// Known limitation: if the phone reboots, the sensor's cumulative total resets too, so
// steps taken before the reboot are not recovered for that day until the next baseline
// recapture above.
@CapacitorPlugin(
    name = "Steps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity") }
)
public class StepsPlugin extends Plugin implements SensorEventListener {
    static final String PREFS = "gymlog_steps";
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private boolean listening = false;
    private PluginCall pendingCall;
    // Non-null while a setTodaySteps() call is waiting on a sensor read: holds the
    // authoritative "steps so far today" value to splice in as the new baseline.
    private Integer recalibrateTargetSteps;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        MidnightStepsAlarmReceiver.scheduleNext(getContext());
        // If permission was already granted in a previous session, start listening
        // immediately so live updates begin as soon as the app opens, with no explicit
        // getTodaySteps() call needed first.
        if (stepCounterSensor != null &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("activity") == PermissionState.GRANTED)) {
            startListening();
        }
    }

    @PluginMethod
    public void getTodaySteps(PluginCall call) {
        recalibrateTargetSteps = null;
        if (stepCounterSensor == null) {
            call.reject("No step counter sensor on this device");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "permissionCallback");
            return;
        }
        pendingCall = call;
        startListening();
    }

    // Recalibrates today's baseline so future reads report the given "steps so far"
    // value plus whatever new steps happen from now on -- used when an imported backup's
    // step count for today is more accurate than this device's own running tally.
    @PluginMethod
    public void setTodaySteps(PluginCall call) {
        Integer stepsValue = call.getInt("steps");
        if (stepsValue == null) {
            call.reject("Missing steps value");
            return;
        }
        if (stepCounterSensor == null) {
            call.reject("No step counter sensor on this device");
            return;
        }
        recalibrateTargetSteps = stepsValue;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "permissionCallback");
            return;
        }
        pendingCall = call;
        startListening();
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            pendingCall = call;
            startListening();
        } else {
            recalibrateTargetSteps = null;
            call.reject("Activity recognition permission denied");
        }
    }

    // Registers the sensor listener if it isn't already -- shared by one-shot
    // getTodaySteps()/setTodaySteps() calls and by load(), and left registered
    // afterwards so every subsequent step keeps pushing "stepsUpdate" events on its own.
    private void startListening() {
        if (listening) return;
        listening = true;
        sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_FASTEST);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float totalSinceBoot = event.values[0];

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        float baseline;

        if (recalibrateTargetSteps != null) {
            baseline = totalSinceBoot - recalibrateTargetSteps;
            recalibrateTargetSteps = null;
        } else {
            String baselineDate = prefs.getString("baseline_date", null);
            if (today.equals(baselineDate)) {
                baseline = prefs.getFloat("baseline_value", totalSinceBoot);
            } else {
                // No baseline captured for today yet (the midnight alarm hasn't fired
                // since the day rolled over) -- fall back to starting from right now.
                baseline = totalSinceBoot;
            }
        }
        prefs.edit().putString("baseline_date", today).putFloat("baseline_value", baseline).apply();
        int todaySteps = (int) Math.max(0, totalSinceBoot - baseline);

        JSObject ret = new JSObject();
        ret.put("steps", todaySteps);

        if (pendingCall != null) {
            pendingCall.resolve(ret);
            pendingCall = null;
        }
        notifyListeners("stepsUpdate", ret);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void handleOnDestroy() {
        if (listening) {
            sensorManager.unregisterListener(this);
            listening = false;
        }
    }
}
