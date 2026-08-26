package com.taoufikkehal.gymlog

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// AlarmManager alarms are cleared on reboot, so re-arm the midnight steps-baseline alarm
// as soon as the device finishes booting. Also, the step counter sensor's cumulative total
// resets to 0 on every reboot, which would otherwise leave today's baseline pointing at the
// old (now unreachable) pre-reboot total until the next midnight alarm fires -- so recapture
// the baseline immediately too, on a background thread since sensor reads are async and
// onReceive() must return quickly.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val appContext = context.applicationContext
        val pendingResult = goAsync()
        Thread {
            try {
                MidnightStepsAlarmReceiver.captureBaseline(appContext)
            } finally {
                MidnightStepsAlarmReceiver.scheduleNext(appContext)
                pendingResult.finish()
            }
        }.start()
    }
}
