import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/custom_exercise.dart';
import '../models/daily_entry.dart';
import '../models/food.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';
import 'local_storage_service.dart';
import 'storage_backend.dart';

/// Cloud-backed storage: each collection lives in its own document under
/// `users/{uid}/store/{key}`, mirroring the same per-collection shape the
/// on-device [LocalStorageService] used. Firestore's offline persistence
/// (on by default on mobile) keeps reads/writes working without a
/// connection and syncs automatically once back online.
class FirestoreStorageService implements GymLogStorage {
  static const _daily = 'daily';
  static const _workouts = 'workouts';
  static const _settings = 'settings';
  static const _foodLog = 'foodlog';
  static const _customFoods = 'customFoods';
  static const _customExercises = 'customExercises';
  static const _workoutTemplates = 'workoutTemplates';
  static const _meta = 'meta';

  final String uid;
  final FirebaseFirestore _db;

  FirestoreStorageService(this.uid, {FirebaseFirestore? firestore})
    : _db = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _store =>
      _db.collection('users').doc(uid).collection('store');

  Future<Map<String, dynamic>?> _getMapValue(String key) async {
    final data = (await _store.doc(key).get()).data();
    return data?['value'] as Map<String, dynamic>?;
  }

  Future<List<dynamic>?> _getListValue(String key) async {
    final data = (await _store.doc(key).get()).data();
    return data?['value'] as List<dynamic>?;
  }

  Future<void> _setValue(String key, dynamic value) {
    return _store.doc(key).set({'value': value});
  }

  @override
  Future<Map<String, DailyEntry>> loadDaily() async {
    final raw = await _getMapValue(_daily) ?? {};
    return raw.map(
      (k, v) => MapEntry(k, DailyEntry.fromJson(v as Map<String, dynamic>)),
    );
  }

  @override
  Future<void> saveDaily(Map<String, DailyEntry> data) {
    return _setValue(_daily, data.map((k, v) => MapEntry(k, v.toJson())));
  }

  @override
  Future<List<WorkoutSession>> loadWorkouts() async {
    final raw = await _getListValue(_workouts) ?? [];
    return raw
        .map((e) => WorkoutSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveWorkouts(List<WorkoutSession> list) {
    return _setValue(_workouts, list.map((w) => w.toJson()).toList());
  }

  @override
  Future<AppSettings> loadSettings() async {
    final raw = await _getMapValue(_settings) ?? {};
    return AppSettings.fromJson(raw);
  }

  @override
  Future<void> saveSettings(AppSettings settings) {
    return _setValue(_settings, settings.toJson());
  }

  @override
  Future<Map<String, List<FoodLogEntry>>> loadFoodLog() async {
    final raw = await _getMapValue(_foodLog) ?? {};
    return raw.map(
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
    return _setValue(
      _foodLog,
      log.map((k, v) => MapEntry(k, v.map((e) => e.toJson()).toList())),
    );
  }

  @override
  Future<List<CustomFood>> loadCustomFoods() async {
    final raw = await _getListValue(_customFoods) ?? [];
    return raw.map((e) => CustomFood.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<void> saveCustomFoods(List<CustomFood> list) {
    return _setValue(_customFoods, list.map((f) => f.toJson()).toList());
  }

  @override
  Future<bool> get hasCustomFoods async =>
      (await _store.doc(_customFoods).get()).exists;

  @override
  Future<List<CustomExercise>> loadCustomExercises() async {
    final raw = await _getListValue(_customExercises) ?? [];
    return raw
        .map((e) => CustomExercise.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveCustomExercises(List<CustomExercise> list) {
    return _setValue(_customExercises, list.map((e) => e.toJson()).toList());
  }

  @override
  Future<List<WorkoutTemplate>> loadWorkoutTemplates() async {
    final raw = await _getListValue(_workoutTemplates) ?? [];
    return raw
        .map((e) => WorkoutTemplate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> saveWorkoutTemplates(List<WorkoutTemplate> list) {
    return _setValue(_workoutTemplates, list.map((t) => t.toJson()).toList());
  }

  @override
  Future<bool> get hasWorkoutTemplates async =>
      (await _store.doc(_workoutTemplates).get()).exists;

  @override
  Future<void> clearAll() async {
    final batch = _db.batch();
    for (final key in [
      _daily,
      _workouts,
      _settings,
      _foodLog,
      _customFoods,
      _customExercises,
      _workoutTemplates,
    ]) {
      batch.delete(_store.doc(key));
    }
    await batch.commit();
  }

  /// One-time copy of this device's local on-device data into the cloud, so
  /// signing in for the first time doesn't lose whatever was logged before
  /// this account existed. Guarded by a `meta` doc stored in Firestore
  /// itself (not on-device), so it never re-runs on a second device and
  /// clobbers cloud data that device one already synced up.
  Future<void> migrateFromLocalIfNeeded(LocalStorageService local) async {
    final alreadyMigrated = (await _store.doc(_meta).get()).exists;
    if (alreadyMigrated) return;

    await saveDaily(await local.loadDaily());
    await saveWorkouts(await local.loadWorkouts());
    await saveSettings(await local.loadSettings());
    await saveFoodLog(await local.loadFoodLog());
    await saveCustomFoods(await local.loadCustomFoods());
    await saveCustomExercises(await local.loadCustomExercises());
    await saveWorkoutTemplates(await local.loadWorkoutTemplates());
    await _store.doc(_meta).set({'migratedAt': DateTime.now().toIso8601String()});
  }
}
