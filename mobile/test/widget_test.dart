import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:gymlog/main.dart';

void main() {
  testWidgets('App launches and shows the bottom tab bar', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const GymLogApp());
    await tester.pumpAndSettle();

    expect(find.text('Gym Log'), findsWidgets);
    expect(find.text('Today'), findsWidgets);
    expect(find.text('Workout'), findsWidgets);
    expect(find.text('Data'), findsWidgets);
  });

  testWidgets('Every tab renders without throwing', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const GymLogApp());
    await tester.pumpAndSettle();

    for (final label in ['Today', 'Workout', 'Food', 'History', 'Trends', 'Data']) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'tapping $label tab threw');
    }
  });

  testWidgets('Every tab renders without throwing when data is already logged', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({
      'gymlog.daily': '{"2026-01-01":{"weight":80,"sleepHours":7.5,"calories":2200,"protein":150,'
          '"carbs":200,"fat":70,"steps":9000,"water":3.5,"cigarettes":0,"dayType":"workout"},'
          '"2026-01-02":{"weight":79.5,"calories":2100}}',
      'gymlog.workouts': '[{"id":"w1","date":"2026-01-01","name":"Leg day","exercises":'
          '[{"name":"Barbell Squat","type":"strength","sets":[{"reps":8,"weight":80}]}]}]',
      'gymlog.settings': '{"age":30,"heightCm":180,"activityLevel":"moderate","sex":"male"}',
      'gymlog.foodlog': '{"2026-01-01":[{"id":"f1","name":"Chicken breast","grams":150,'
          '"calories":248,"protein":47,"carbs":0,"fat":5}]}',
    });
    await tester.pumpWidget(const GymLogApp());
    await tester.pumpAndSettle();

    for (final label in ['Today', 'Workout', 'Food', 'History', 'Trends', 'Data']) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'tapping $label tab with seeded data threw');
    }
  });
}
