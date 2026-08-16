import '../models/daily_entry.dart';
import '../models/enums.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import 'dates.dart';

/// Pure calorie/maintenance/activity-level math, ported verbatim from the
/// web app's `app.js`. Kept free of Flutter imports so it's unit-testable
/// on its own and reusable from both [AppState] and the UI.

// Used to estimate calories burned when no weight is logged for the day.
const double defaultBodyweightKg = 75;

// Evidence-based daily minimums for the Today stat-card good/bad coloring.
const double waterLTarget = 4;
const double sleepHoursMin = 7; // general adult guideline is 7-9h
const double strengthMet = 6.0; // general resistance training, ~1 min/set
const double stepsKcalPerStepPerKg = 0.0005;

const Map<String, double> cardioMetTable = {
  'cycling': 7.5,
  'rowing machine': 7.0,
  'jump rope': 10.0,
  'stair climber': 8.0,
  'elliptical': 5.0,
  'treadmill': 8.0,
  'assault bike': 8.0,
  'ski erg': 7.0,
};

// Steps on a day with no logged workout still count as "active".
const int activeDayStepsThreshold = 8000;

// Fixed deficit for all calorie targets (rest/workout/cardio) — evidence-based
// range for fat loss while preserving muscle is ~10-25% below maintenance;
// not user-adjustable.
const int fixedDeficitPct = 25;

// Bumped whenever the target-computation policy changes, so installs with
// targets computed under an older policy force a one-time recompute.
const String calorieTargetPolicy = 'fixed25';

const int minHealthyDeficitPct = 10;
const int maxHealthyDeficitPct = 25;
const double minHealthyWeeklyLossPct = 0.5;
const double maxHealthyWeeklyLossPct = 1.0;

const int measuredMaintenanceWindowDays = 28;
const int measuredMaintenanceMinDays = 14;

const Map<DayType, String> dayTypeCalorieSettingsKey = {
  DayType.rest: 'restCalories',
  DayType.workout: 'workoutCalories',
  DayType.cardio: 'cardioCalories',
};

int? calorieTargetForDayType(AppSettings settings, DayType? dayType) {
  switch (dayType) {
    case DayType.rest:
      return settings.restCalories;
    case DayType.workout:
      return settings.workoutCalories;
    case DayType.cardio:
      return settings.cardioCalories;
    case null:
      return null;
  }
}

double getCardioMET(String name, double? pace) {
  final lname = name.toLowerCase();
  if (lname == 'running') {
    if (pace == null) return 9.8;
    if (pace <= 4) return 14.5;
    if (pace <= 5) return 12.8;
    if (pace <= 6) return 10.5;
    if (pace <= 7) return 9.0;
    if (pace <= 8) return 8.0;
    return 6.0;
  }
  if (lname == 'walking') {
    if (pace == null) return 3.5;
    if (pace <= 9) return 5.0;
    if (pace <= 12) return 3.8;
    return 3.0;
  }
  return cardioMetTable[lname] ?? 6.0;
}

double estimateExerciseCalories(ExerciseEntry ex, double? weightKg) {
  final w = weightKg ?? defaultBodyweightKg;
  if (ex.type == ExerciseType.cardio) {
    final duration = ex.duration ?? 0;
    if (duration <= 0) return 0;
    return getCardioMET(ex.name, ex.pace) * w * (duration / 60);
  }
  return ex.sets.length * strengthMet * w / 60;
}

class BurnedPart {
  final String label;
  final int kcal;
  const BurnedPart({required this.label, required this.kcal});
}

class BurnedBreakdown {
  final int total;
  final List<BurnedPart> parts;
  const BurnedBreakdown({required this.total, required this.parts});
}

BurnedBreakdown getCaloriesBurnedBreakdown({
  required String date,
  required double? weightKg,
  required int? steps,
  required List<WorkoutSession> workouts,
}) {
  final w = weightKg ?? defaultBodyweightKg;
  final parts = <BurnedPart>[];
  for (final wk in workouts.where((wk) => wk.date == date)) {
    for (final ex in wk.exercises) {
      final kcal = estimateExerciseCalories(ex, w).round();
      if (kcal <= 0) continue;
      final detail = ex.type == ExerciseType.cardio
          ? '${(ex.duration ?? 0).round()} min'
          : '${ex.sets.length} sets';
      parts.add(BurnedPart(label: '${ex.name} ($detail)', kcal: kcal));
    }
  }
  if (steps != null && steps > 0) {
    final stepsKcal = (steps * w * stepsKcalPerStepPerKg).round();
    if (stepsKcal > 0) {
      parts.add(BurnedPart(label: '$steps steps', kcal: stepsKcal));
    }
  }
  final total = parts.fold<int>(0, (sum, p) => sum + p.kcal);
  return BurnedBreakdown(total: total, parts: parts);
}

({double weight, String date})? getLatestLoggedWeight(
  Map<String, DailyEntry> daily,
) {
  final dates = daily.keys.where((d) => daily[d]!.weight != null).toList()
    ..sort();
  if (dates.isEmpty) return null;
  final date = dates.last;
  return (weight: daily[date]!.weight!, date: date);
}

String? getEarliestLoggedWeightDate(Map<String, DailyEntry> daily) {
  final dates = daily.keys.where((d) => daily[d]!.weight != null).toList()
    ..sort();
  return dates.isEmpty ? null : dates.first;
}

String? getEarliestLoggedDate(Map<String, DailyEntry> daily) {
  final dates = daily.keys.toList()..sort();
  return dates.isEmpty ? null : dates.first;
}

class ActivitySuggestion {
  final ActivityLevel level;
  final int activeDays;
  final int loggedDays;
  const ActivitySuggestion({
    required this.level,
    required this.activeDays,
    required this.loggedDays,
  });
}

ActivitySuggestion? computeActivityLevelFromHistory({
  required Map<String, DailyEntry> daily,
  required List<WorkoutSession> workouts,
}) {
  final end = todayISO();
  final start = addDaysISO(end, -6);
  final loggedDays = daily.keys.where((d) => d.compareTo(start) >= 0 && d.compareTo(end) <= 0).toList();
  if (loggedDays.length < 4) return null;

  final activeDates = <String>{};
  for (final d in loggedDays) {
    final entry = daily[d]!;
    if (entry.dayType == DayType.workout || entry.dayType == DayType.cardio) {
      activeDates.add(d);
    }
    if (entry.steps != null && entry.steps! >= activeDayStepsThreshold) {
      activeDates.add(d);
    }
  }
  for (final w in workouts) {
    if (w.date.compareTo(start) >= 0 && w.date.compareTo(end) <= 0) {
      activeDates.add(w.date);
    }
  }

  final activeCount = activeDates.length;
  ActivityLevel level;
  if (activeCount <= 1) {
    level = ActivityLevel.sedentary;
  } else if (activeCount <= 3) {
    level = ActivityLevel.light;
  } else if (activeCount <= 5) {
    level = ActivityLevel.moderate;
  } else if (activeCount == 6) {
    level = ActivityLevel.active;
  } else {
    level = ActivityLevel.veryActive;
  }

  return ActivitySuggestion(
    level: level,
    activeDays: activeCount,
    loggedDays: loggedDays.length,
  );
}

class MeasuredMaintenance {
  final int tdee;
  final int avgIntake;
  final double weightStart;
  final double weightEnd;
  final double weightChangeKg;
  final int periodDays;
  final int loggedCalorieDays;
  final String start;
  final String end;
  const MeasuredMaintenance({
    required this.tdee,
    required this.avgIntake,
    required this.weightStart,
    required this.weightEnd,
    required this.weightChangeKg,
    required this.periodDays,
    required this.loggedCalorieDays,
    required this.start,
    required this.end,
  });
}

/// avg_kcal_intake = average(daily logged calories) over the period
/// weight_start / weight_end = 7-day average weight at the start/end
/// weight_change_kg = weight_start - weight_end (positive = loss)
/// total_deficit_kcal = weight_change_kg * 7700; daily_deficit_kcal = total/days
/// TDEE = avg_kcal_intake + daily_deficit_kcal
MeasuredMaintenance? computeMeasuredMaintenance(Map<String, DailyEntry> daily) {
  final weightDates = daily.keys.where((d) => daily[d]!.weight != null).toList()
    ..sort();
  if (weightDates.isEmpty) return null;

  final earliest = weightDates.first;
  final end = weightDates.last;
  var start = addDaysISO(end, -(measuredMaintenanceWindowDays - 1));
  if (start.compareTo(earliest) < 0) start = earliest;
  final periodDays = daysBetweenISO(start, end) + 1;
  if (periodDays < measuredMaintenanceMinDays) return null;

  double? avgWeightInWindow(String winStart, String winEnd) {
    final vals = <double>[];
    var d = winStart;
    while (d.compareTo(winEnd) <= 0) {
      final w = daily[d]?.weight;
      if (w != null) vals.add(w);
      d = addDaysISO(d, 1);
    }
    if (vals.length < 3) return null;
    return vals.reduce((a, b) => a + b) / vals.length;
  }

  final weightStart = avgWeightInWindow(start, addDaysISO(start, 6));
  final weightEnd = avgWeightInWindow(addDaysISO(end, -6), end);
  if (weightStart == null || weightEnd == null) return null;

  final calorieVals = <int>[];
  var d = start;
  while (d.compareTo(end) <= 0) {
    final c = daily[d]?.calories;
    if (c != null) calorieVals.add(c);
    d = addDaysISO(d, 1);
  }
  if (calorieVals.length < 7) return null;
  final avgIntake = calorieVals.reduce((a, b) => a + b) / calorieVals.length;

  final weightChangeKg = weightStart - weightEnd;
  final totalDeficitKcal = weightChangeKg * 7700;
  final dailyDeficitKcal = totalDeficitKcal / periodDays;
  final tdee = (((avgIntake + dailyDeficitKcal) / 10).round()) * 10;

  return MeasuredMaintenance(
    tdee: tdee,
    avgIntake: avgIntake.round(),
    weightStart: weightStart,
    weightEnd: weightEnd,
    weightChangeKg: weightChangeKg,
    periodDays: periodDays,
    loggedCalorieDays: calorieVals.length,
    start: start,
    end: end,
  );
}

class MaintenanceResult {
  final int tdee;
  final String method; // 'measured' | 'formula'
  final MeasuredMaintenance? measured;
  final double? weight;
  final bool? usedDefaultWeight;
  final String? weightDate;
  const MaintenanceResult({
    required this.tdee,
    required this.method,
    this.measured,
    this.weight,
    this.usedDefaultWeight,
    this.weightDate,
  });
}

MaintenanceResult? computeMaintenanceCalories({
  required Map<String, DailyEntry> daily,
  required AppSettings settings,
}) {
  final measured = computeMeasuredMaintenance(daily);
  if (measured != null) {
    return MaintenanceResult(
      tdee: measured.tdee,
      method: 'measured',
      measured: measured,
    );
  }

  final age = settings.age;
  final heightCm = settings.heightCm;
  if (age == null || heightCm == null) return null;

  final latest = getLatestLoggedWeight(daily);
  final weight = latest?.weight ?? defaultBodyweightKg;

  final bmr =
      10 * weight +
      6.25 * heightCm -
      5 * age +
      (settings.sex == Sex.female ? -161 : 5);
  final multiplier = activityMultipliers[settings.activityLevel]!;
  final tdee = (((bmr * multiplier) / 10).round()) * 10;

  return MaintenanceResult(
    tdee: tdee,
    method: 'formula',
    weight: weight,
    usedDefaultWeight: latest == null,
    weightDate: latest?.date,
  );
}
