package com.taoufikkehal.gymlog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// AlarmManager alarms are cleared on reboot, so re-arm the midnight steps-baseline alarm
// as soon as the device finishes booting.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            MidnightStepsAlarmReceiver.scheduleNext(context.getApplicationContext());
        }
    }
}
