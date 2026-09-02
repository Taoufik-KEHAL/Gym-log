import 'enums.dart';

/// App-wide settings, mirrors `gymlog.settings`.
class AppSettings {
  int? restCalories;
  int? workoutCalories;
  int? cardioCalories;

  /// ISO "yyyy-MM-dd". The preferred way to know age — read through [age],
  /// which is computed live so it keeps itself up to date without the user
  /// ever having to touch it again.
  String? dateOfBirth;

  /// Fallback for settings saved before [dateOfBirth] existed. Only read
  /// through [age] when there's no birth date on file yet.
  int? legacyAgeYears;

  int? heightCm;
  ActivityLevel activityLevel;
  Sex sex;

  /// Whether this account smokes — collected once during onboarding. Gates
  /// whether the daily Cigarettes field shows up on the Today form; already
  /// logged cigarette data is never hidden retroactively based on this.
  bool? isSmoker;

  int? maintenanceTdeeForTargets;
  String? calorieTargetPolicy;

  AppSettings({
    this.restCalories,
    this.workoutCalories,
    this.cardioCalories,
    this.dateOfBirth,
    this.legacyAgeYears,
    this.heightCm,
    this.activityLevel = ActivityLevel.moderate,
    this.sex = Sex.male,
    this.isSmoker,
    this.maintenanceTdeeForTargets,
    this.calorieTargetPolicy,
  });

  /// Age in whole years, derived from [dateOfBirth] when it's set (so it
  /// keeps advancing on its own), falling back to a one-time stored age for
  /// settings saved before date-of-birth was collected.
  int? get age {
    final dob = dateOfBirth;
    if (dob == null) return legacyAgeYears;
    final birth = DateTime.parse(dob);
    final now = DateTime.now();
    var years = now.year - birth.year;
    final hadBirthdayThisYear =
        (now.month > birth.month) || (now.month == birth.month && now.day >= birth.day);
    if (!hadBirthdayThisYear) years--;
    return years;
  }

  /// True until sex, date of birth, height, and smoker status have all been
  /// entered once — gates the one-time onboarding flow.
  bool get needsOnboarding => dateOfBirth == null || heightCm == null || isSmoker == null;

  factory AppSettings.fromJson(Map<String, dynamic> json) => AppSettings(
    restCalories: (json['restCalories'] as num?)?.round(),
    workoutCalories: (json['workoutCalories'] as num?)?.round(),
    cardioCalories: (json['cardioCalories'] as num?)?.round(),
    dateOfBirth: json['dateOfBirth'] as String?,
    legacyAgeYears: (json['age'] as num?)?.round(),
    heightCm: (json['heightCm'] as num?)?.round(),
    activityLevel: activityLevelFromJson(json['activityLevel'] as String?),
    sex: sexFromJson(json['sex'] as String?),
    isSmoker: json['isSmoker'] as bool?,
    maintenanceTdeeForTargets: (json['maintenanceTdeeForTargets'] as num?)
        ?.round(),
    calorieTargetPolicy: json['calorieTargetPolicy'] as String?,
  );

  Map<String, dynamic> toJson() => {
    if (restCalories != null) 'restCalories': restCalories,
    if (workoutCalories != null) 'workoutCalories': workoutCalories,
    if (cardioCalories != null) 'cardioCalories': cardioCalories,
    if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
    if (dateOfBirth == null && legacyAgeYears != null) 'age': legacyAgeYears,
    if (heightCm != null) 'heightCm': heightCm,
    'activityLevel': activityLevelToJson(activityLevel),
    'sex': sexToJson(sex),
    if (isSmoker != null) 'isSmoker': isSmoker,
    if (maintenanceTdeeForTargets != null)
      'maintenanceTdeeForTargets': maintenanceTdeeForTargets,
    if (calorieTargetPolicy != null)
      'calorieTargetPolicy': calorieTargetPolicy,
  };
}
