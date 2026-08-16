import '../models/enums.dart';
import '../models/food.dart';
import '../models/workout_template.dart';

/// Seed data for a fresh install, ports of the web app's `CUSTOM_FOOD_SEED`
/// and `WORKOUT_TEMPLATE_SEED`. IDs are assigned when seeding (see
/// `StorageService.seedIfNeeded`), not stored here.
final List<({String name, Macros per100})> customFoodSeed = [
  (
    name: 'Perly nature (Jaouda fromage frais)',
    per100: const Macros(calories: 101, protein: 7.6, carbs: 0, fat: 0),
  ),
  (
    name: 'Joly thon au naturel (canned tuna in water)',
    per100: const Macros(calories: 108.8, protein: 24.8, carbs: 0.6, fat: 0.8),
  ),
  (
    name: 'Horse minced meat',
    per100: const Macros(calories: 133, protein: 21.4, carbs: 0, fat: 4.8),
  ),
  (
    name: 'Beef minced meat (5-10% fat)',
    per100: const Macros(calories: 176, protein: 20.0, carbs: 0, fat: 10.0),
  ),
  (
    name: 'Chicken breast (skinless)',
    per100: const Macros(calories: 165, protein: 31.0, carbs: 0, fat: 3.6),
  ),
  (
    name: 'Eggs (whole, boiled)',
    per100: const Macros(calories: 155, protein: 13.0, carbs: 1.1, fat: 11.0),
  ),
  (
    name: 'Rice (white, cooked)',
    per100: const Macros(calories: 130, protein: 2.7, carbs: 28.0, fat: 0.3),
  ),
  (
    name: 'Tajine (chicken/meat + veg, home-style)',
    per100: const Macros(calories: 130, protein: 12.0, carbs: 8.0, fat: 6.0),
  ),
  (
    name: 'Couscous (cooked, plain)',
    per100: const Macros(calories: 112, protein: 3.8, carbs: 23.2, fat: 0.2),
  ),
  (
    name: 'Msemen (Moroccan flatbread, plain)',
    per100: const Macros(calories: 330, protein: 7.0, carbs: 45.0, fat: 14.0),
  ),
  (
    name: 'Mille-feuille (pastry)',
    per100: const Macros(calories: 340, protein: 4.5, carbs: 32.0, fat: 22.0),
  ),
  (
    name: 'Nuts (mixed, raw)',
    per100: const Macros(calories: 600, protein: 20.0, carbs: 20.0, fat: 54.0),
  ),
];

final List<({String name, List<TemplateExercise> exercises})>
workoutTemplateSeed = [
  (
    name: 'Full Body (Wave 15→12→8→6)',
    exercises: [
      TemplateExercise(
        name: 'Dumbbell Bench Press',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Incline Dumbbell Press',
        type: ExerciseType.strength,
      ),
      TemplateExercise(name: 'Pullover', type: ExerciseType.strength),
      TemplateExercise(
        name: 'Lat Pulldown - Wide Grip',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Lat Pulldown - Close Grip',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Leg Press (Machine)',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Leg Extension (Machine)',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Seated Leg Curl (Machine)',
        type: ExerciseType.strength,
      ),
      TemplateExercise(
        name: 'Lateral Raise (Machine)',
        type: ExerciseType.strength,
      ),
      TemplateExercise(name: 'Pectoral fly', type: ExerciseType.strength),
      TemplateExercise(name: 'Preacher Curl', type: ExerciseType.strength),
      TemplateExercise(name: 'Cycling', type: ExerciseType.cardio),
    ],
  ),
];
