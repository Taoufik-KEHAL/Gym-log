package com.taoufikkehal.gymlog;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

// Fires at (or shortly after) midnight to capture a fresh step-count baseline right at the
// day boundary, matching how Google Fit resets at midnight, then reschedules itself for
// the next midnight. Also (re)armed on boot (see BootReceiver), since AlarmManager alarms
// do not survive a reboot on their own.
public class MidnightStepsAlarmReceiver extends BroadcastReceiver {
    private static final int REQUEST_CODE = 4821;

    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    captureBaseline(appContext);
                } finally {
                    scheduleNext(appContext);
                    pendingResult.finish();
                }
            }
        }).start();
    }

    static void captureBaseline(Context context) {
        SensorManager sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor stepCounter = sensorManager != null ? sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) : null;
        if (stepCounter == null) return;

        final CountDownLatch latch = new CountDownLatch(1);
        final float[] reading = new float[1];
        SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                reading[0] = event.values[0];
                latch.countDown();
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };

        sensorManager.registerListener(listener, stepCounter, SensorManager.SENSOR_DELAY_NORMAL);
        boolean gotReading;
        try {
            gotReading = latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            gotReading = false;
        }
        sensorManager.unregisterListener(listener);

        if (gotReading) {
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            SharedPreferences prefs = context.getSharedPreferences(StepsPlugin.PREFS, Context.MODE_PRIVATE);
            prefs.edit().putString("baseline_date", today).putFloat("baseline_value", reading[0]).apply();
        }
    }

    // Schedules the next midnight alarm using setAndAllowWhileIdle rather than an exact
    // alarm: exact alarms need the user to manually grant the "Alarms & reminders" special
    // access on Android 12+ (there's no in-app prompt for it, just a settings screen), and
    // in practice that almost never gets granted -- which silently means this alarm never
    // fires at all, so the baseline is never recaptured at midnight and the plugin's lazy
    // self-heal (see StepsPlugin.onSensorChanged) resets the count to 0 at whatever time
    // the app is first opened each day, discarding everything counted since actual
    // midnight. A day-boundary reset doesn't need millisecond precision -- being off by a
    // few minutes around midnight is irrelevant here -- so setAndAllowWhileIdle (Doze/App
    // Standby-tolerant, no special permission required on any Android version) is the
    // right tool for this, not an exact alarm.
    static void scheduleNext(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 5);
        next.set(Calendar.MILLISECOND, 0);

        Intent intent = new Intent(context, MidnightStepsAlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pendingIntent);
        } catch (SecurityException ignored) {
            // Shouldn't happen -- setAndAllowWhileIdle needs no special permission -- but
            // don't crash the app over a missed baseline reset if some OEM disagrees.
        }
    }
}
