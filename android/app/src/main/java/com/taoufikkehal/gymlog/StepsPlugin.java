package com.taoufikkehal.gymlog;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

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
import java.util.concurrent.TimeUnit;

// Reads today's step count from the phone's built-in step counter sensor.
// TYPE_STEP_COUNTER reports a cumulative total since the device's last boot, so "today's
// steps" is tracked as (current total - a baseline captured at the start of today). The
// baseline is normally (re)captured by MidnightStepsBaselineWorker, a periodic background
// job that runs roughly every 15 minutes so the reset happens close to actual midnight
// (like Google Fit), not just whenever the app happens to be opened. If no baseline has
// been captured yet for today (e.g. right after install, before the worker has ticked),
// this plugin falls back to setting one lazily on its own first read of the day.
// Known limitation: if the phone reboots, the sensor's cumulative total resets too, so
// steps taken before the reboot are not recovered for that day.
@CapacitorPlugin(
    name = "Steps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity") }
)
public class StepsPlugin extends Plugin implements SensorEventListener {
    static final String PREFS = "gymlog_steps";
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private PluginCall pendingCall;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        schedulePeriodicBaselineCapture();
    }

    private void schedulePeriodicBaselineCapture() {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            MidnightStepsBaselineWorker.class, 15, TimeUnit.MINUTES
        ).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
            "gymlog_steps_baseline", ExistingPeriodicWorkPolicy.KEEP, request
        );
    }

    @PluginMethod
    public void getTodaySteps(PluginCall call) {
        if (stepCounterSensor == null) {
            call.reject("No step counter sensor on this device");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "permissionCallback");
            return;
        }
        readSteps(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            readSteps(call);
        } else {
            call.reject("Activity recognition permission denied");
        }
    }

    private void readSteps(PluginCall call) {
        pendingCall = call;
        sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (pendingCall == null) return;
        float totalSinceBoot = event.values[0];
        sensorManager.unregisterListener(this);

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String baselineDate = prefs.getString("baseline_date", null);
        float baseline;
        if (today.equals(baselineDate)) {
            baseline = prefs.getFloat("baseline_value", totalSinceBoot);
        } else {
            // No baseline captured for today yet (the periodic worker hasn't ticked since
            // midnight rolled over) -- fall back to starting the count from right now.
            baseline = totalSinceBoot;
            prefs.edit().putString("baseline_date", today).putFloat("baseline_value", baseline).apply();
        }
        int todaySteps = (int) Math.max(0, totalSinceBoot - baseline);

        JSObject ret = new JSObject();
        ret.put("steps", todaySteps);
        pendingCall.resolve(ret);
        pendingCall = null;
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
