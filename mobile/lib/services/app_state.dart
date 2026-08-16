import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../data/exercise_library.dart';
import '../data/seed_data.dart';
import '../models/custom_exercise.dart';
import '../models/daily_entry.dart';
import '../models/enums.dart';
import '../models/food.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';
import '../utils/calc.dart' as calc;
import 'storage_service.dart';

const _uuid = Uuid();

/// Central in-memory store for every collection, backed by [StorageService].
/// Every mutation updates memory, persists through storage, and calls
/// [notifyListeners] — the Flutter analogue of the web app's
/// `loadX()` → mutate → `saveX()` → re-render pattern.
class AppState extends ChangeNotifier {
  final StorageService _storage;

  AppState(this._storage);

  Map<String, DailyEntry> daily = {};
  List<WorkoutSession> workouts = [];
  AppSettings settings = AppSettings();
  Map<String, List<FoodLogEntry>> foodLog = {};
  List<CustomFood> customFoods = [];
  List<CustomExercise> customExercises = [];
  List<WorkoutTemplate> workoutTemplates = [];

  static Future<AppState> create() async {
    final storage = await StorageService.create();
    final state = AppState(storage);
    state._load();
    return state;
  }

  void _load() {
    daily = _storage.loadDaily();
    workouts = _storage.loadWorkouts();
    settings = _storage.loadSettings();
    foodLog = _storage.loadFoodLog();
    customFoods = _storage.loadCustomFoods();
    customExercises = _storage.loadCustomExercises();
    workoutTemplates = _storage.loadWorkoutTemplates();

    if (!_storage.hasCustomFoods) {
      customFoods = customFoodSeed
          .map((f) => CustomFood(id: _uuid.v4(), name: f.name, per100: f.per100))
          .toList();
      _storage.saveCustomFoods(customFoods);
    }
    if (!_storage.hasWorkoutTemplates) {
      workoutTemplates = workoutTemplateSeed
          .map((t) => WorkoutTemplate(id: _uuid.v4(), name: t.name, exercises: t.exercises))
          .toList();
      _storage.saveWorkoutTemplates(workoutTemplates);
    }
    notifyListeners();
  }

  DailyEntry entryFor(String date) => daily[date] ?? DailyEntry();

  // ---------- maintenance-target sync ----------
  // Keeps the calorie targets following the maintenance estimate: any time
  // the estimate moves (or the target-computation policy changed), the
  // targets are recomputed from it.
  void _syncMaintenanceTargets() {
    final result = calc.computeMaintenanceCalories(daily: daily, settings: settings);
    if (result == null) return;
    if (settings.calorieTargetPolicy == calc.calorieTargetPolicy &&
        settings.maintenanceTdeeForTargets == result.tdee) {
      return;
    }
    final target = ((result.tdee * (1 - calc.fixedDeficitPct / 100)) / 10).round() * 10;
    settings.restCalories = target;
    settings.workoutCalories = target;
    settings.cardioCalories = target;
    settings.maintenanceTdeeForTargets = result.tdee;
    settings.calorieTargetPolicy = calc.calorieTargetPolicy;
    _storage.saveSettings(settings);
  }

  // ---------- daily entries ----------

  Future<void> saveDailyEntry(String date, DailyEntry entry) async {
    if (entry.isEmpty) {
      daily.remove(date);
    } else {
      daily[date] = entry;
    }
    await _storage.saveDaily(daily);
    _syncMaintenanceTargets();
    notifyListeners();
  }

  // ---------- workouts ----------

  Future<void> saveWorkout(WorkoutSession workout, {required bool isEditing}) async {
    if (isEditing) {
      final idx = workouts.indexWhere((w) => w.id == workout.id);
      if (idx != -1) workouts[idx] = workout;
    } else {
      workouts.add(workout);
    }
    await _storage.saveWorkouts(workouts);
    notifyListeners();
  }

  Future<void> deleteWorkout(String id) async {
    workouts.removeWhere((w) => w.id == id);
    await _storage.saveWorkouts(workouts);
    notifyListeners();
  }

  void saveCustomExerciseIfNew(String name, ExerciseType type) {
    if (isKnownExerciseName(name, cardio: type == ExerciseType.cardio)) return;
    final exists = customExercises.any(
      (ex) => ex.type == type && ex.name.toLowerCase() == name.toLowerCase(),
    );
    if (exists) return;
    customExercises.add(CustomExercise(name: name, type: type));
    _storage.saveCustomExercises(customExercises);
    notifyListeners();
  }

  // ---------- workout templates ----------

  Future<void> saveAsTemplate(String name, List<TemplateExercise> exercises) async {
    final idx = workoutTemplates.indexWhere(
      (t) => t.name.toLowerCase() == name.toLowerCase(),
    );
    if (idx != -1) {
      workoutTemplates[idx].exercises = exercises;
    } else {
      workoutTemplates.add(WorkoutTemplate(id: _uuid.v4(), name: name, exercises: exercises));
    }
    await _storage.saveWorkoutTemplates(workoutTemplates);
    notifyListeners();
  }

  Future<void> removeWorkoutTemplate(String id) async {
    workoutTemplates.removeWhere((t) => t.id == id);
    await _storage.saveWorkoutTemplates(workoutTemplates);
    notifyListeners();
  }

  // ---------- food log ----------

  Future<void> addFoodEntry(String date, FoodLogEntry entry) async {
    final entries = foodLog.putIfAbsent(date, () => []);
    entries.add(entry);
    await _storage.saveFoodLog(foodLog);

    final d = daily[date] ?? DailyEntry();
    d.calories = (d.calories ?? 0) + entry.calories;
    d.protein = (d.protein ?? 0) + entry.protein;
    d.carbs = (d.carbs ?? 0) + entry.carbs;
    d.fat = (d.fat ?? 0) + entry.fat;
    daily[date] = d;
    await _storage.saveDaily(daily);
    _syncMaintenanceTargets();
    notifyListeners();
  }

  Future<void> removeFoodEntry(String date, String id) async {
    final entries = foodLog[date];
    if (entries == null) return;
    final idx = entries.indexWhere((e) => e.id == id);
    if (idx == -1) return;
    final removed = entries.removeAt(idx);
    await _storage.saveFoodLog(foodLog);

    final d = daily[date];
    if (d != null) {
      d.calories = ((d.calories ?? 0) - removed.calories).clamp(0, 1 << 30);
      d.protein = ((d.protein ?? 0) - removed.protein).clamp(0, 1 << 30);
      d.carbs = ((d.carbs ?? 0) - removed.carbs).clamp(0, 1 << 30);
      d.fat = ((d.fat ?? 0) - removed.fat).clamp(0, 1 << 30);
      await _storage.saveDaily(daily);
    }
    notifyListeners();
  }

  // ---------- custom foods ("My Foods") ----------

  Future<void> addCustomFood(String name, Macros per100) async {
    customFoods.add(CustomFood(id: _uuid.v4(), name: name, per100: per100));
    await _storage.saveCustomFoods(customFoods);
    notifyListeners();
  }

  Future<void> updateCustomFood(String id, String name, Macros per100) async {
    final idx = customFoods.indexWhere((f) => f.id == id);
    if (idx == -1) return;
    customFoods[idx] = CustomFood(id: id, name: name, per100: per100);
    await _storage.saveCustomFoods(customFoods);
    notifyListeners();
  }

  Future<void> removeCustomFood(String id) async {
    customFoods.removeWhere((f) => f.id == id);
    await _storage.saveCustomFoods(customFoods);
    notifyListeners();
  }

  // ---------- settings ----------

  Future<void> updateSettings({
    int? age,
    bool clearAge = false,
    int? heightCm,
    bool clearHeight = false,
    ActivityLevel? activityLevel,
    Sex? sex,
  }) async {
    settings.age = clearAge ? null : (age ?? settings.age);
    settings.heightCm = clearHeight ? null : (heightCm ?? settings.heightCm);
    if (activityLevel != null) settings.activityLevel = activityLevel;
    if (sex != null) settings.sex = sex;
    await _storage.saveSettings(settings);
    _syncMaintenanceTargets();
    notifyListeners();
  }

  // ---------- data export / import / clear ----------

  Map<String, dynamic> exportAll() => _storage.exportAll();

  Future<void> importAll(Map<String, dynamic> payload) async {
    if (payload['daily'] is Map) {
      daily = (payload['daily'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, DailyEntry.fromJson(v as Map<String, dynamic>)),
      );
      await _storage.saveDaily(daily);
    }
    if (payload['workouts'] is List) {
      workouts = (payload['workouts'] as List)
          .map((e) => WorkoutSession.fromJson(e as Map<String, dynamic>))
          .toList();
      await _storage.saveWorkouts(workouts);
    }
    if (payload['settings'] is Map) {
      settings = AppSettings.fromJson(payload['settings'] as Map<String, dynamic>);
      await _storage.saveSettings(settings);
    }
    if (payload['foodlog'] is Map) {
      foodLog = (payload['foodlog'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(
          k,
          (v as List).map((e) => FoodLogEntry.fromJson(e as Map<String, dynamic>)).toList(),
        ),
      );
      await _storage.saveFoodLog(foodLog);
    }
    if (payload['customFoods'] is List) {
      customFoods = (payload['customFoods'] as List)
          .map((e) => CustomFood.fromJson(e as Map<String, dynamic>))
          .toList();
      await _storage.saveCustomFoods(customFoods);
    }
    if (payload['customExercises'] is List) {
      customExercises = (payload['customExercises'] as List)
          .map((e) => CustomExercise.fromJson(e as Map<String, dynamic>))
          .toList();
      await _storage.saveCustomExercises(customExercises);
    }
    if (payload['customWorkoutTemplates'] is List) {
      workoutTemplates = (payload['customWorkoutTemplates'] as List)
          .map((e) => WorkoutTemplate.fromJson(e as Map<String, dynamic>))
          .toList();
      await _storage.saveWorkoutTemplates(workoutTemplates);
    }
    notifyListeners();
  }

  Future<void> clearAll() async {
    await _storage.clearAll();
    daily = {};
    workouts = [];
    settings = AppSettings();
    foodLog = {};
    customExercises = [];
    customFoods = customFoodSeed
        .map((f) => CustomFood(id: _uuid.v4(), name: f.name, per100: f.per100))
        .toList();
    await _storage.saveCustomFoods(customFoods);
    workoutTemplates = workoutTemplateSeed
        .map((t) => WorkoutTemplate(id: _uuid.v4(), name: t.name, exercises: t.exercises))
        .toList();
    await _storage.saveWorkoutTemplates(workoutTemplates);
    notifyListeners();
  }
}
