import 'enums.dart';

/// App-wide settings, mirrors `gymlog.settings`.
class AppSettings {
  int? restCalories;
  int? workoutCalories;
  int? cardioCalories;
  int? age;
  int? heightCm;
  ActivityLevel activityLevel;
  Sex sex;
  int? maintenanceTdeeForTargets;
  String? calorieTargetPolicy;

  AppSettings({
    this.restCalories,
    this.workoutCalories,
    this.cardioCalories,
    this.age,
    this.heightCm,
    this.activityLevel = ActivityLevel.moderate,
    this.sex = Sex.male,
    this.maintenanceTdeeForTargets,
    this.calorieTargetPolicy,
  });

  factory AppSettings.fromJson(Map<String, dynamic> json) => AppSettings(
    restCalories: (json['restCalories'] as num?)?.round(),
    workoutCalories: (json['workoutCalories'] as num?)?.round(),
    cardioCalories: (json['cardioCalories'] as num?)?.round(),
    age: (json['age'] as num?)?.round(),
    heightCm: (json['heightCm'] as num?)?.round(),
    activityLevel: activityLevelFromJson(json['activityLevel'] as String?),
    sex: sexFromJson(json['sex'] as String?),
    maintenanceTdeeForTargets: (json['maintenanceTdeeForTargets'] as num?)
        ?.round(),
    calorieTargetPolicy: json['calorieTargetPolicy'] as String?,
  );

  Map<String, dynamic> toJson() => {
    if (restCalories != null) 'restCalories': restCalories,
    if (workoutCalories != null) 'workoutCalories': workoutCalories,
    if (cardioCalories != null) 'cardioCalories': cardioCalories,
    if (age != null) 'age': age,
    if (heightCm != null) 'heightCm': heightCm,
    'activityLevel': activityLevelToJson(activityLevel),
    'sex': sexToJson(sex),
    if (maintenanceTdeeForTargets != null)
      'maintenanceTdeeForTargets': maintenanceTdeeForTargets,
    if (calorieTargetPolicy != null)
      'calorieTargetPolicy': calorieTargetPolicy,
  };
}
