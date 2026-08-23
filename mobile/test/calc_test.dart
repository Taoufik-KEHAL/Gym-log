import 'package:flutter_test/flutter_test.dart';
import 'package:gymlog/models/daily_entry.dart';
import 'package:gymlog/models/enums.dart';
import 'package:gymlog/models/settings.dart';
import 'package:gymlog/models/workout.dart';
import 'package:gymlog/utils/calc.dart' as calc;
import 'package:gymlog/utils/dates.dart';

void main() {
  group('estimateExerciseCalories', () {
    test('strength: sets * MET * weight / 60', () {
      final ex = ExerciseEntry.strength(
        name: 'Squat',
        sets: [SetEntry(reps: 8, weight: 60), SetEntry(reps: 8, weight: 60)],
      );
      // 2 sets * 6.0 MET * 80kg / 60 = 16.0
      expect(calc.estimateExerciseCalories(ex, 80), closeTo(16.0, 0.001));
    });

    test('strength: falls back to default bodyweight when none logged', () {
      final ex = ExerciseEntry.strength(name: 'Squat', sets: [SetEntry(reps: 8, weight: 60)]);
      expect(
        calc.estimateExerciseCalories(ex, null),
        closeTo(1 * 6.0 * calc.defaultBodyweightKg / 60, 0.001),
      );
    });

    test('cardio: zero duration burns nothing', () {
      final ex = ExerciseEntry.cardio(name: 'Cycling', duration: 0);
      expect(calc.estimateExerciseCalories(ex, 70), 0);
    });

    test('cardio: MET table lookup for cycling', () {
      final ex = ExerciseEntry.cardio(name: 'Cycling', duration: 30);
      // 7.5 MET * 70kg * (30/60) = 262.5
      expect(calc.estimateExerciseCalories(ex, 70), closeTo(262.5, 0.001));
    });

    test('cardio: running MET varies by pace', () {
      final fast = ExerciseEntry.cardio(name: 'Running', duration: 30, pace: 4);
      final slow = ExerciseEntry.cardio(name: 'Running', duration: 30, pace: 9);
      expect(calc.estimateExerciseCalories(fast, 70), greaterThan(calc.estimateExerciseCalories(slow, 70)));
    });
  });

  group('getCaloriesBurnedBreakdown', () {
    test('sums workout exercises and step-based burn for the matching date', () {
      final workouts = [
        WorkoutSession(
          id: 'w1',
          date: '2026-01-01',
          name: 'Leg day',
          exercises: [
            ExerciseEntry.strength(name: 'Squat', sets: [SetEntry(reps: 8, weight: 60)]),
          ],
        ),
        WorkoutSession(id: 'w2', date: '2026-01-02', name: 'Other day', exercises: []),
      ];
      final result = calc.getCaloriesBurnedBreakdown(
        date: '2026-01-01',
        weightKg: 80,
        steps: 10000,
        workouts: workouts,
      );
      // Squat: 1 * 6.0 * 80 / 60 = 8 kcal; steps: 10000 * 80 * 0.0005 = 400 kcal
      expect(result.parts.length, 2);
      expect(result.total, 8 + 400);
    });

    test('ignores workouts on other dates', () {
      final workouts = [
        WorkoutSession(id: 'w1', date: '2026-01-05', name: 'Other', exercises: [
          ExerciseEntry.strength(name: 'Squat', sets: [SetEntry(reps: 8, weight: 60)]),
        ]),
      ];
      final result = calc.getCaloriesBurnedBreakdown(date: '2026-01-01', weightKg: 80, steps: null, workouts: workouts);
      expect(result.total, 0);
      expect(result.parts, isEmpty);
    });
  });

  group('computeMeasuredMaintenance', () {
    test('returns null with fewer than the minimum days of history', () {
      final daily = <String, DailyEntry>{
        '2026-01-01': DailyEntry(weight: 80, calories: 2000),
        '2026-01-02': DailyEntry(weight: 80, calories: 2000),
      };
      expect(calc.computeMeasuredMaintenance(daily), isNull);
    });

    test('computes TDEE from weight change and average intake over 28 days', () {
      final daily = <String, DailyEntry>{};
      // Flat 2000 kcal/day intake; weight declines from 80kg to 79kg over the window.
      for (var i = 0; i < 28; i++) {
        final date = addDaysISO('2026-01-01', i);
        final weight = 80.0 - (i / 27.0); // linear 80 -> 79
        daily[date] = DailyEntry(weight: weight, calories: 2000);
      }
      final result = calc.computeMeasuredMaintenance(daily);
      expect(result, isNotNull);
      expect(result!.avgIntake, 2000);
      // weightChangeKg ~= 1 (start avg ~79.9, end avg ~79.1), deficit ~7700*1/28 ~= 275
      // tdee = round((2000 + ~275)/10)*10, roughly in the 2250-2300 range.
      expect(result.tdee, greaterThan(2200));
      expect(result.tdee, lessThan(2350));
    });
  });

  group('computeMaintenanceCalories (formula fallback)', () {
    test('uses Mifflin-St Jeor with default bodyweight when nothing logged', () {
      final settings = AppSettings(
        legacyAgeYears: 30,
        heightCm: 180,
        sex: Sex.male,
        activityLevel: ActivityLevel.moderate,
      );
      final result = calc.computeMaintenanceCalories(daily: {}, settings: settings);
      expect(result, isNotNull);
      expect(result!.method, 'formula');
      expect(result.usedDefaultWeight, isTrue);
      // BMR = 10*75 + 6.25*180 - 5*30 + 5 = 750+1125-150+5 = 1730; TDEE = 1730*1.55 = 2681.5 -> rounds to 2680
      expect(result.tdee, 2680);
    });

    test('returns null without age/height and no measured history', () {
      final settings = AppSettings();
      expect(calc.computeMaintenanceCalories(daily: {}, settings: settings), isNull);
    });
  });

  group('calorieTargetForDayType', () {
    test('maps each day type to its settings field', () {
      final settings = AppSettings(restCalories: 1800, workoutCalories: 2200, cardioCalories: 2000);
      expect(calc.calorieTargetForDayType(settings, DayType.rest), 1800);
      expect(calc.calorieTargetForDayType(settings, DayType.workout), 2200);
      expect(calc.calorieTargetForDayType(settings, DayType.cardio), 2000);
      expect(calc.calorieTargetForDayType(settings, null), isNull);
    });
  });

  group('date helpers', () {
    test('addDaysISO adds/subtracts calendar days', () {
      expect(addDaysISO('2026-01-01', 1), '2026-01-02');
      expect(addDaysISO('2026-01-01', -1), '2025-12-31');
    });

    test('daysBetweenISO counts inclusive-exclusive day span', () {
      expect(daysBetweenISO('2026-01-01', '2026-01-08'), 7);
    });
  });
}
