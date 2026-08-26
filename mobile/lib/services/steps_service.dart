import 'dart:io';

import 'package:flutter/services.dart';

/// Reads/writes today's step count via the phone's native step-counter sensor on Android.
/// See android/app/src/main/kotlin/com/taoufikkehal/gymlog/StepsMethodCallHandler.kt.
class StepsService {
  static const MethodChannel _channel = MethodChannel('com.taoufikkehal.gymlog/steps');

  static bool get isAvailable => Platform.isAndroid;

  static Future<int?> getTodaySteps() async {
    if (!isAvailable) return null;
    try {
      return await _channel.invokeMethod<int>('getTodaySteps');
    } on PlatformException {
      return null;
    }
  }

  /// Recalibrates the native baseline so future reads (auto-fill, this button, the
  /// midnight alarm) report [steps] plus whatever new steps happen from now on, instead
  /// of the device's own possibly-stale baseline overwriting it -- used when a
  /// manually-entered or imported value is more accurate than the sensor's own tally.
  static Future<void> setTodaySteps(int steps) async {
    if (!isAvailable) return;
    try {
      await _channel.invokeMethod('setTodaySteps', {'steps': steps});
    } on PlatformException {
      // Best-effort recalibration; a failure here just leaves the native baseline as-is.
    }
  }
}
