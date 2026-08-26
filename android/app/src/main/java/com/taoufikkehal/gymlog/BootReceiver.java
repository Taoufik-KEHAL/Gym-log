package com.taoufikkehal.gymlog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// AlarmManager alarms are cleared on reboot, so re-arm the midnight steps-baseline alarm
// as soon as the device finishes booting. Also, the step counter sensor's cumulative total
// resets to 0 on every reboot, which would otherwise leave today's baseline pointing at the
// old (now unreachable) pre-reboot total until the next midnight alarm fires -- so recapture
// the baseline immediately too, on a background thread since sensor reads are async and
// onReceive() must return quickly.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        final Context appContext = context.getApplicationContext();
        final PendingResult pendingResult = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    MidnightStepsAlarmReceiver.captureBaseline(appContext);
                } finally {
                    MidnightStepsAlarmReceiver.scheduleNext(appContext);
                    pendingResult.finish();
                }
            }
        }).start();
    }
}
