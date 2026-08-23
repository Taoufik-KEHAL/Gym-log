package com.taoufikkehal.gymlog;

import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

// Runs roughly every 15 minutes in the background (scheduled by StepsPlugin). Each tick,
// if the stored step-count baseline is still dated to a previous day, it captures a fresh
// baseline from the current sensor reading -- effectively resetting the day's step count
// close to actual midnight, similar to how Google Fit resets at midnight, without needing
// the app to be open or a persistent foreground service.
public class MidnightStepsBaselineWorker extends Worker {

    public MidnightStepsBaselineWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(StepsPlugin.PREFS, Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String baselineDate = prefs.getString("baseline_date", null);
        if (today.equals(baselineDate)) {
            return Result.success();
        }

        SensorManager sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor stepCounter = sensorManager != null ? sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) : null;
        if (stepCounter == null) {
            return Result.success();
        }

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
            prefs.edit().putString("baseline_date", today).putFloat("baseline_value", reading[0]).apply();
        }
        return Result.success();
    }
}
