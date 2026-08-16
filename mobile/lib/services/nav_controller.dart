import 'package:flutter/foundation.dart';

import '../models/workout.dart';

/// Tab indices for [RootShell], shared so screens can request a switch
/// without hard-coding numbers everywhere.
class AppTab {
  static const int today = 0;
  static const int workout = 1;
  static const int food = 2;
  static const int history = 3;
  static const int trends = 4;
  static const int data = 5;
}

/// Cross-tab navigation: switching the bottom-nav tab from code, and handing
/// a workout from History to the Workout builder for editing (the JS
/// equivalent of `handleEditWorkout` calling `switchView("workout")`).
class NavController extends ChangeNotifier {
  int tabIndex = AppTab.today;
  WorkoutSession? _workoutToEdit;

  void goTo(int index) {
    tabIndex = index;
    notifyListeners();
  }

  void editWorkout(WorkoutSession workout) {
    _workoutToEdit = workout;
    tabIndex = AppTab.workout;
    notifyListeners();
  }

  WorkoutSession? consumeWorkoutToEdit() {
    final w = _workoutToEdit;
    _workoutToEdit = null;
    return w;
  }
}
