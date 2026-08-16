import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/daily_entry.dart';
import '../models/enums.dart';
import '../models/workout.dart';
import '../services/app_state.dart';
import '../services/nav_controller.dart';
import '../theme.dart';
import '../utils/calc.dart' as calc;
import '../utils/dates.dart';
import '../widgets/section_card.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  Future<void> _confirmDelete(BuildContext context, String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this workout?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      await context.read<AppState>().deleteWorkout(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final dates = <String>{...app.daily.keys, ...app.workouts.map((w) => w.date)}.toList()
      ..sort((a, b) => b.compareTo(a));

    if (dates.isEmpty) {
      return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No entries yet. Log a day or a workout to get started.')));
    }

    final weightDatesAsc = app.daily.keys.where((d) => app.daily[d]!.weight != null).toList()..sort();
    final prevWeightByDate = <String, double>{};
    for (var i = 1; i < weightDatesAsc.length; i++) {
      prevWeightByDate[weightDatesAsc[i]] = app.daily[weightDatesAsc[i - 1]]!.weight!;
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: dates.length,
      itemBuilder: (context, i) {
        final date = dates[i];
        final entry = app.daily[date];
        final dayWorkouts = app.workouts.where((w) => w.date == date).toList();
        return SectionCard(
          child: _HistoryDay(
            date: date,
            entry: entry,
            prevWeight: prevWeightByDate[date],
            workouts: dayWorkouts,
            onEdit: (w) => context.read<NavController>().editWorkout(w),
            onDelete: (id) => _confirmDelete(context, id),
          ),
        );
      },
    );
  }
}

class _HistoryDay extends StatelessWidget {
  final String date;
  final DailyEntry? entry;
  final double? prevWeight;
  final List<WorkoutSession> workouts;
  final ValueChanged<WorkoutSession> onEdit;
  final ValueChanged<String> onDelete;

  const _HistoryDay({
    required this.date,
    required this.entry,
    required this.prevWeight,
    required this.workouts,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final parts = <String>[];
    if (entry != null) {
      if (entry!.weight != null) parts.add('${entry!.weight} kg');
      if (entry!.sleepHours != null) parts.add('${entry!.sleepHours} h sleep');
      if (entry!.calories != null) parts.add('${entry!.calories} kcal');
      if (entry!.protein != null) parts.add('${entry!.protein} g protein');
      if (entry!.carbs != null) parts.add('${entry!.carbs} g carbs');
      if (entry!.fat != null) parts.add('${entry!.fat} g fat');
      if (entry!.steps != null) parts.add('${entry!.steps} steps');
      if (entry!.water != null) parts.add('${entry!.water} L water');
      if (entry!.cigarettes != null) parts.add('${entry!.cigarettes} cigarettes');
    }
    final weightDiff = (entry?.weight != null && prevWeight != null)
        ? ((entry!.weight! - prevWeight!) * 10).round() / 10
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(formatDateLong(date), style: TextStyle(color: c.text, fontWeight: FontWeight.w700)),
            if (entry?.dayType != null) ...[
              const SizedBox(width: 8),
              Text(dayTypeLabels[entry!.dayType]!, style: TextStyle(color: c.textDim, fontSize: 12)),
            ],
          ],
        ),
        if (parts.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(
            children: [
              Text(parts.join(' · '), style: TextStyle(color: c.text, fontSize: 13)),
              if (weightDiff != null)
                Text(
                  ' (${weightDiff > 0 ? '+' : ''}$weightDiff)',
                  style: TextStyle(color: weightDiff < 0 ? c.accent : (weightDiff > 0 ? c.danger : c.textDim), fontSize: 13),
                ),
            ],
          ),
        ],
        ...workouts.map((w) => _WorkoutBlock(workout: w, dayWeight: entry?.weight, onEdit: () => onEdit(w), onDelete: () => onDelete(w.id))),
      ],
    );
  }
}

class _WorkoutBlock extends StatelessWidget {
  final WorkoutSession workout;
  final double? dayWeight;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _WorkoutBlock({required this.workout, required this.dayWeight, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final totalSets = workout.exercises
        .where((e) => e.type != ExerciseType.cardio)
        .fold<int>(0, (sum, e) => sum + e.sets.length);
    final cardioCount = workout.exercises.where((e) => e.type == ExerciseType.cardio).length;
    final workoutKcal = workout.exercises
        .fold<double>(0, (sum, e) => sum + calc.estimateExerciseCalories(e, dayWeight))
        .round();
    final summary = [
      if (totalSets > 0) '$totalSets sets',
      if (cardioCount > 0) '$cardioCount cardio',
      if (workoutKcal > 0) '~$workoutKcal kcal burned',
    ].join(', ');

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: c.bgElev2, borderRadius: BorderRadius.circular(10)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '🏋️ ${workout.name}${summary.isNotEmpty ? ' — $summary' : ''}',
                    style: TextStyle(color: c.text, fontWeight: FontWeight.w600),
                  ),
                ),
                IconButton(icon: const Icon(Icons.edit_outlined, size: 18), onPressed: onEdit),
                IconButton(icon: Icon(Icons.delete_outline, size: 18, color: c.danger), onPressed: onDelete),
              ],
            ),
            ...workout.exercises.map((ex) {
              final kcal = calc.estimateExerciseCalories(ex, dayWeight).round();
              final detail = ex.type == ExerciseType.cardio
                  ? [if (ex.duration != null) '${ex.duration} min', if (ex.pace != null) '${ex.pace} min/km'].join(' @ ')
                  : ex.sets.asMap().entries.map((s) => '#${s.key + 1} — ${s.value.reps} reps @ ${s.value.weight} kg').join('\n');
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${ex.name}${kcal > 0 ? ' — ~$kcal kcal' : ''}', style: TextStyle(color: c.text, fontSize: 13, fontWeight: FontWeight.w600)),
                    if (detail.isNotEmpty)
                      Text(detail, style: TextStyle(color: c.textDim, fontSize: 12)),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
