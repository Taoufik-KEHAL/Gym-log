import 'enums.dart';

/// One day's logged stats, keyed by ISO date ("yyyy-MM-dd") in [AppState.daily].
/// Mirrors the shape stored under `gymlog.daily` by the original web app.
class DailyEntry {
  double? weight;
  double? sleepHours;
  int? calories;
  int? protein;
  int? carbs;
  int? fat;
  int? steps;
  double? water;
  int? cigarettes;
  DayType? dayType;

  DailyEntry({
    this.weight,
    this.sleepHours,
    this.calories,
    this.protein,
    this.carbs,
    this.fat,
    this.steps,
    this.water,
    this.cigarettes,
    this.dayType,
  });

  bool get isEmpty =>
      weight == null &&
      sleepHours == null &&
      calories == null &&
      protein == null &&
      carbs == null &&
      fat == null &&
      steps == null &&
      water == null &&
      cigarettes == null &&
      dayType == null;

  factory DailyEntry.fromJson(Map<String, dynamic> json) => DailyEntry(
    weight: (json['weight'] as num?)?.toDouble(),
    sleepHours: (json['sleepHours'] as num?)?.toDouble(),
    calories: (json['calories'] as num?)?.round(),
    protein: (json['protein'] as num?)?.round(),
    carbs: (json['carbs'] as num?)?.round(),
    fat: (json['fat'] as num?)?.round(),
    steps: (json['steps'] as num?)?.round(),
    water: (json['water'] as num?)?.toDouble(),
    cigarettes: (json['cigarettes'] as num?)?.round(),
    dayType: dayTypeFromJson(json['dayType'] as String?),
  );

  Map<String, dynamic> toJson() => {
    if (weight != null) 'weight': weight,
    if (sleepHours != null) 'sleepHours': sleepHours,
    if (calories != null) 'calories': calories,
    if (protein != null) 'protein': protein,
    if (carbs != null) 'carbs': carbs,
    if (fat != null) 'fat': fat,
    if (steps != null) 'steps': steps,
    if (water != null) 'water': water,
    if (cigarettes != null) 'cigarettes': cigarettes,
    if (dayType != null) 'dayType': dayTypeToJson(dayType),
  };

  DailyEntry copy() => DailyEntry(
    weight: weight,
    sleepHours: sleepHours,
    calories: calories,
    protein: protein,
    carbs: carbs,
    fat: fat,
    steps: steps,
    water: water,
    cigarettes: cigarettes,
    dayType: dayType,
  );
}
