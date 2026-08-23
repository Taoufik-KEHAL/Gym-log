import '../models/custom_exercise.dart';
import '../models/daily_entry.dart';
import '../models/food.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';

/// Storage contract implemented by both the on-device backend
/// ([LocalStorageService], SharedPreferences) and the cloud backend
/// ([FirestoreStorageService]), so [AppState] doesn't care which one it's
/// talking to.
abstract class GymLogStorage {
  Future<Map<String, DailyEntry>> loadDaily();
  Future<void> saveDaily(Map<String, DailyEntry> data);

  Future<List<WorkoutSession>> loadWorkouts();
  Future<void> saveWorkouts(List<WorkoutSession> list);

  Future<AppSettings> loadSettings();
  Future<void> saveSettings(AppSettings settings);

  Future<Map<String, List<FoodLogEntry>>> loadFoodLog();
  Future<void> saveFoodLog(Map<String, List<FoodLogEntry>> log);

  Future<List<CustomFood>> loadCustomFoods();
  Future<void> saveCustomFoods(List<CustomFood> list);
  Future<bool> get hasCustomFoods;

  Future<List<CustomExercise>> loadCustomExercises();
  Future<void> saveCustomExercises(List<CustomExercise> list);

  Future<List<WorkoutTemplate>> loadWorkoutTemplates();
  Future<void> saveWorkoutTemplates(List<WorkoutTemplate> list);
  Future<bool> get hasWorkoutTemplates;

  Future<void> clearAll();
}
