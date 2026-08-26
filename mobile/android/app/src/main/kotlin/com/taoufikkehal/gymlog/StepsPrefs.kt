package com.taoufikkehal.gymlog

// Shared SharedPreferences file/keys for the steps baseline, used by both the midnight
// alarm/boot receivers and the Flutter-facing method channel handler.
object StepsPrefs {
    const val NAME = "gymlog_steps"
    const val KEY_BASELINE_DATE = "baseline_date"
    const val KEY_BASELINE_VALUE = "baseline_value"
}
