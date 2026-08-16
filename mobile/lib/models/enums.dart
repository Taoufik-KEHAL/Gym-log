enum ExerciseType { strength, cardio }

ExerciseType exerciseTypeFromJson(String? value) =>
    value == 'cardio' ? ExerciseType.cardio : ExerciseType.strength;

String exerciseTypeToJson(ExerciseType type) =>
    type == ExerciseType.cardio ? 'cardio' : 'strength';

enum DayType { rest, workout, cardio }

DayType? dayTypeFromJson(String? value) {
  switch (value) {
    case 'rest':
      return DayType.rest;
    case 'workout':
      return DayType.workout;
    case 'cardio':
      return DayType.cardio;
    default:
      return null;
  }
}

String? dayTypeToJson(DayType? type) {
  switch (type) {
    case DayType.rest:
      return 'rest';
    case DayType.workout:
      return 'workout';
    case DayType.cardio:
      return 'cardio';
    case null:
      return null;
  }
}

const Map<DayType, String> dayTypeLabels = {
  DayType.rest: '😴 Rest day',
  DayType.workout: '🏋️ Workout day',
  DayType.cardio: '🏃 Cardio day',
};

enum Sex { male, female }

Sex sexFromJson(String? value) => value == 'female' ? Sex.female : Sex.male;

String sexToJson(Sex sex) => sex == Sex.female ? 'female' : 'male';

enum ActivityLevel { sedentary, light, moderate, active, veryActive }

ActivityLevel activityLevelFromJson(String? value) {
  switch (value) {
    case 'sedentary':
      return ActivityLevel.sedentary;
    case 'light':
      return ActivityLevel.light;
    case 'active':
      return ActivityLevel.active;
    case 'very_active':
      return ActivityLevel.veryActive;
    case 'moderate':
    default:
      return ActivityLevel.moderate;
  }
}

String activityLevelToJson(ActivityLevel level) {
  switch (level) {
    case ActivityLevel.sedentary:
      return 'sedentary';
    case ActivityLevel.light:
      return 'light';
    case ActivityLevel.moderate:
      return 'moderate';
    case ActivityLevel.active:
      return 'active';
    case ActivityLevel.veryActive:
      return 'very_active';
  }
}

const Map<ActivityLevel, double> activityMultipliers = {
  ActivityLevel.sedentary: 1.2,
  ActivityLevel.light: 1.375,
  ActivityLevel.moderate: 1.55,
  ActivityLevel.active: 1.725,
  ActivityLevel.veryActive: 1.9,
};

const Map<ActivityLevel, String> activityLevelLabels = {
  ActivityLevel.sedentary: 'Sedentary',
  ActivityLevel.light: 'Light',
  ActivityLevel.moderate: 'Moderate',
  ActivityLevel.active: 'Active',
  ActivityLevel.veryActive: 'Very active',
};

enum QtyMode { grams, units }
