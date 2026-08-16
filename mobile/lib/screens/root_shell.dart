import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/nav_controller.dart';
import 'data_screen.dart';
import 'food_screen.dart';
import 'history_screen.dart';
import 'today_screen.dart';
import 'trends_screen.dart';
import 'workout_screen.dart';

/// Bottom-nav shell with the six tabs. Uses [IndexedStack] so each screen
/// keeps its widget state (in-progress forms, scroll position) when the
/// user switches away and back, matching the web app's behavior of never
/// tearing down a view's DOM.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Gym Log')),
      body: IndexedStack(
        index: nav.tabIndex,
        children: const [
          TodayScreen(),
          WorkoutScreen(),
          FoodScreen(),
          HistoryScreen(),
          TrendsScreen(),
          DataScreen(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: nav.tabIndex,
        onTap: nav.goTo,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.today_outlined), label: 'Today'),
          BottomNavigationBarItem(icon: Icon(Icons.fitness_center_outlined), label: 'Workout'),
          BottomNavigationBarItem(icon: Icon(Icons.restaurant_outlined), label: 'Food'),
          BottomNavigationBarItem(icon: Icon(Icons.history_outlined), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.show_chart_outlined), label: 'Trends'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_outlined), label: 'Data'),
        ],
      ),
    );
  }
}
