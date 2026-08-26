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
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

// Fires once exactly at midnight to capture a fresh step-count baseline right at the day
// boundary, matching how Google Fit resets at midnight, then reschedules itself for the
// next midnight. Also (re)armed on boot (see BootReceiver), since AlarmManager alarms do
// not survive a reboot on their own.
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

    // Schedules the next midnight alarm. On Android 12+ this requires the user to have
    // granted the "Alarms & reminders" special access; if it hasn't been granted yet, this
    // opens that settings screen instead of scheduling (and will be retried next app open).
    static void scheduleNext(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            Intent settingsIntent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            settingsIntent.setData(Uri.parse("package:" + context.getPackageName()));
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(settingsIntent);
            } catch (Exception ignored) {
                // No such settings screen on this device/OEM; the plugin's own lazy
                // fallback baseline still works, just without a precise midnight reset.
            }
            return;
        }

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
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pendingIntent);
        } catch (SecurityException ignored) {
            // Permission revoked between the check above and this call; skip for now.
        }
    }
}
