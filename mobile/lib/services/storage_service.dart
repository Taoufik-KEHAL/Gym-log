import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/custom_exercise.dart';
import '../models/daily_entry.dart';
import '../models/food.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';

/// Thin wrapper around [SharedPreferences] that stores each collection as a
/// JSON blob under the same keys the original web app used in
/// `localStorage` — so a JSON backup exported from the web app can be
/// imported straight into this app, and vice versa.
class StorageService {
  static const String kDaily = 'gymlog.daily';
  static const String kWorkouts = 'gymlog.workouts';
  static const String kSettings = 'gymlog.settings';
  static const String kFoodLog = 'gymlog.foodlog';
  static const String kCustomFoods = 'gymlog.customfoods';
  static const String kCustomExercises = 'gymlog.customExercises';
  static const String kWorkoutTemplates = 'gymlog.customWorkoutTemplates';

  final SharedPreferences _prefs;

  StorageService(this._prefs);

  static Future<StorageService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return StorageService(prefs);
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

  Map<String, DailyEntry> loadDaily() {
    final decoded = _decodeMap(_prefs.getString(kDaily));
    return decoded.map(
      (k, v) => MapEntry(k, DailyEntry.fromJson(v as Map<String, dynamic>)),
    );
  }

  Future<void> saveDaily(Map<String, DailyEntry> data) {
    final encoded = jsonEncode(data.map((k, v) => MapEntry(k, v.toJson())));
    return _prefs.setString(kDaily, encoded);
  }

  List<WorkoutSession> loadWorkouts() {
    return _decodeList(_prefs.getString(kWorkouts))
        .map((e) => WorkoutSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveWorkouts(List<WorkoutSession> list) {
    final encoded = jsonEncode(list.map((w) => w.toJson()).toList());
    return _prefs.setString(kWorkouts, encoded);
  }

  AppSettings loadSettings() {
    final decoded = _decodeMap(_prefs.getString(kSettings));
    return AppSettings.fromJson(decoded);
  }

  Future<void> saveSettings(AppSettings settings) {
    return _prefs.setString(kSettings, jsonEncode(settings.toJson()));
  }

  Map<String, List<FoodLogEntry>> loadFoodLog() {
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

  Future<void> saveFoodLog(Map<String, List<FoodLogEntry>> log) {
    final encoded = jsonEncode(
      log.map((k, v) => MapEntry(k, v.map((e) => e.toJson()).toList())),
    );
    return _prefs.setString(kFoodLog, encoded);
  }

  List<CustomFood> loadCustomFoods() {
    return _decodeList(_prefs.getString(kCustomFoods))
        .map((e) => CustomFood.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveCustomFoods(List<CustomFood> list) {
    final encoded = jsonEncode(list.map((f) => f.toJson()).toList());
    return _prefs.setString(kCustomFoods, encoded);
  }

  bool get hasCustomFoods => _prefs.containsKey(kCustomFoods);

  List<CustomExercise> loadCustomExercises() {
    return _decodeList(_prefs.getString(kCustomExercises))
        .map((e) => CustomExercise.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveCustomExercises(List<CustomExercise> list) {
    final encoded = jsonEncode(list.map((e) => e.toJson()).toList());
    return _prefs.setString(kCustomExercises, encoded);
  }

  List<WorkoutTemplate> loadWorkoutTemplates() {
    return _decodeList(_prefs.getString(kWorkoutTemplates))
        .map((e) => WorkoutTemplate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveWorkoutTemplates(List<WorkoutTemplate> list) {
    final encoded = jsonEncode(list.map((t) => t.toJson()).toList());
    return _prefs.setString(kWorkoutTemplates, encoded);
  }

  bool get hasWorkoutTemplates => _prefs.containsKey(kWorkoutTemplates);

  /// Raw export payload — every collection as a `toJson`-ready map, matching
  /// the shape of the web app's export JSON.
  Map<String, dynamic> exportAll() => {
    'exportedAt': DateTime.now().toIso8601String(),
    'daily': loadDaily().map((k, v) => MapEntry(k, v.toJson())),
    'workouts': loadWorkouts().map((w) => w.toJson()).toList(),
    'settings': loadSettings().toJson(),
    'foodlog': loadFoodLog().map(
      (k, v) => MapEntry(k, v.map((e) => e.toJson()).toList()),
    ),
    'customFoods': loadCustomFoods().map((f) => f.toJson()).toList(),
    'customExercises': loadCustomExercises().map((e) => e.toJson()).toList(),
    'customWorkoutTemplates': loadWorkoutTemplates()
        .map((t) => t.toJson())
        .toList(),
  };

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
