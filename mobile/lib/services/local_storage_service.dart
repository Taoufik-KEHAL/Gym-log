import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/custom_exercise.dart';
import '../models/daily_entry.dart';
import '../models/food.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';
import 'storage_backend.dart';

/// Thin wrapper around [SharedPreferences] that stores each collection as a
/// JSON blob under the same keys the original web app used in
/// `localStorage` — so a JSON backup exported from the web app can be
/// imported straight into this app, and vice versa.
class LocalStorageService implements GymLogStorage {
  static const String kDaily = 'gymlog.daily';
  static const String kWorkouts = 'gymlog.workouts';
  static const String kSettings = 'gymlog.settings';
  static const String kFoodLog = 'gymlog.foodlog';
  static const String kCustomFoods = 'gymlog.customfoods';
  static const String kCustomExercises = 'gymlog.customExercises';
  static const String kWorkoutTemplates = 'gymlog.customWorkoutTemplates';

  final SharedPreferences _prefs;

  LocalStorageService(this._prefs);

  static Future<LocalStorageService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return LocalStorageService(prefs);
  }

  Map<String, dynamic> _decodeMap(String? raw) {
    if (raw == null) return {};
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }

  List<dynamic> _decodeList(String? raw) {
    if (raw == null) return [];
    try {
      return jsonDecode(raw) as List<dynamic>;
    } catch (_) {
      return [];
    }
  }

  @override
  Future<Map<String, DailyEntry>> loadDaily() async {
    final decoded = _decodeMap(_prefs.getString(kDaily));
    return decoded.map(
      (k, v) => MapEntry(k, DailyEntry.fromJson(v as Map<String, dynamic>)),
    );
  }

  @override
  Future<void> saveDaily(Map<String, DailyEntry> data) {
    final encoded = jsonEncode(data.map((k, v) => MapEntry(k, v.toJson())));
    return _prefs.setString(kDaily, encoded);
  }

  @override
  Future<List<WorkoutSession>> loadWorkouts() async {
    return _decodeList(_prefs.getString(kWorkouts))
        .map((e) => WorkoutSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveWorkouts(List<WorkoutSession> list) {
    final encoded = jsonEncode(list.map((w) => w.toJson()).toList());
    return _prefs.setString(kWorkouts, encoded);
  }

  @override
  Future<AppSettings> loadSettings() async {
    final decoded = _decodeMap(_prefs.getString(kSettings));
    return AppSettings.fromJson(decoded);
  }

  @override
  Future<void> saveSettings(AppSettings settings) {
    return _prefs.setString(kSettings, jsonEncode(settings.toJson()));
  }

  @override
  Future<Map<String, List<FoodLogEntry>>> loadFoodLog() async {
    final decoded = _decodeMap(_prefs.getString(kFoodLog));
    return decoded.map(
      (k, v) => MapEntry(
        k,
        (v as List<dynamic>)
            .map((e) => FoodLogEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      ),
    );
  }

  @override
  Future<void> saveFoodLog(Map<String, List<FoodLogEntry>> log) {
    final encoded = jsonEncode(
      log.map((k, v) => MapEntry(k, v.map((e) => e.toJson()).toList())),
    );
    return _prefs.setString(kFoodLog, encoded);
  }

  @override
  Future<List<CustomFood>> loadCustomFoods() async {
    return _decodeList(_prefs.getString(kCustomFoods))
        .map((e) => CustomFood.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveCustomFoods(List<CustomFood> list) {
    final encoded = jsonEncode(list.map((f) => f.toJson()).toList());
    return _prefs.setString(kCustomFoods, encoded);
  }

  @override
  Future<bool> get hasCustomFoods async => _prefs.containsKey(kCustomFoods);

  @override
  Future<List<CustomExercise>> loadCustomExercises() async {
    return _decodeList(_prefs.getString(kCustomExercises))
        .map((e) => CustomExercise.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveCustomExercises(List<CustomExercise> list) {
    final encoded = jsonEncode(list.map((e) => e.toJson()).toList());
    return _prefs.setString(kCustomExercises, encoded);
  }

  @override
  Future<List<WorkoutTemplate>> loadWorkoutTemplates() async {
    return _decodeList(_prefs.getString(kWorkoutTemplates))
        .map((e) => WorkoutTemplate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveWorkoutTemplates(List<WorkoutTemplate> list) {
    final encoded = jsonEncode(list.map((t) => t.toJson()).toList());
    return _prefs.setString(kWorkoutTemplates, encoded);
  }

  @override
  Future<bool> get hasWorkoutTemplates async =>
      _prefs.containsKey(kWorkoutTemplates);

  @override
  Future<void> clearAll() async {
    await _prefs.remove(kDaily);
    await _prefs.remove(kWorkouts);
    await _prefs.remove(kSettings);
    await _prefs.remove(kFoodLog);
    await _prefs.remove(kCustomFoods);
    await _prefs.remove(kCustomExercises);
    await _prefs.remove(kWorkoutTemplates);
  }
}
