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

// Reads today's step count from the phone's built-in step counter sensor.
// TYPE_STEP_COUNTER reports a cumulative total since the device's last boot, so "today's
// steps" is tracked as (current total - a baseline captured at the start of today). The
// baseline resets whenever the stored date differs from today. Known limitation: if the
// phone reboots mid-day, the sensor's cumulative total resets too, so steps taken before
// the reboot are not recovered -- today's count effectively restarts from 0 at that point.
@CapacitorPlugin(
    name = "Steps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity") }
)
public class StepsPlugin extends Plugin implements SensorEventListener {
    private static final String PREFS = "gymlog_steps";
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private PluginCall pendingCall;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
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
