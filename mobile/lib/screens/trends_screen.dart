import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/daily_entry.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../utils/calc.dart' as calc;
import '../utils/dates.dart';
import '../widgets/section_card.dart';
import '../widgets/trend_chart.dart';

class TrendsScreen extends StatefulWidget {
  const TrendsScreen({super.key});

  @override
  State<TrendsScreen> createState() => _TrendsScreenState();
}

class _TrendsScreenState extends State<TrendsScreen> {
  String _start = addDaysISO(todayISO(), -29);
  String _end = todayISO();
  bool _initialized = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final app = context.watch<AppState>();

    if (!_initialized) {
      final earliest = calc.getEarliestLoggedDate(app.daily);
      if (earliest != null) _start = earliest;
      _initialized = true;
    }

    List<ChartPoint> pointsFor(double? Function(DailyEntry entry) getter) {
      final pts = <ChartPoint>[];
      for (final d in app.daily.keys) {
        if (d.compareTo(_start) < 0 || d.compareTo(_end) > 0) continue;
        final v = getter(app.daily[d]!);
        if (v != null) pts.add(ChartPoint(d, v));
      }
      pts.sort((a, b) => a.date.compareTo(b.date));
      return pts;
    }

    final intakePoints = pointsFor((e) => e.calories?.toDouble());
    final burnedPoints = <ChartPoint>[];
    final goalPoints = <ChartPoint>[];
    for (final d in app.daily.keys) {
      if (d.compareTo(_start) < 0 || d.compareTo(_end) > 0) continue;
      final entry = app.daily[d]!;
      final burned = calc.getCaloriesBurnedBreakdown(date: d, weightKg: entry.weight, steps: entry.steps, workouts: app.workouts).total;
      if (burned > 0) burnedPoints.add(ChartPoint(d, burned.toDouble()));
      final goal = calc.calorieTargetForDayType(app.settings, entry.dayType);
      if (goal != null) goalPoints.add(ChartPoint(d, goal.toDouble()));
    }
    burnedPoints.sort((a, b) => a.date.compareTo(b.date));
    goalPoints.sort((a, b) => a.date.compareTo(b.date));

    final maintenance = (intakePoints.isNotEmpty || burnedPoints.isNotEmpty)
        ? calc.computeMaintenanceCalories(daily: app.daily, settings: app.settings)
        : null;

    final caloriesSeries = [
      ChartSeries(points: intakePoints, color: c.accent),
      ChartSeries(points: burnedPoints, color: c.accent2),
      if (goalPoints.isNotEmpty) ChartSeries(points: goalPoints, color: c.accent3),
      if (maintenance != null)
        ChartSeries(
          color: c.textDim,
          dashed: true,
          points: _flatSeries(_start, _end, maintenance.tdee.toDouble()),
        ),
    ];

    final today = todayISO();
    final todayEntry = app.daily[today];
    final todayIntake = todayEntry?.calories;
    final todayGoal = calc.calorieTargetForDayType(app.settings, todayEntry?.dayType);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Date range',
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(context: context, initialDate: fromISO(_start), firstDate: DateTime(2000), lastDate: DateTime(2100));
                    if (picked != null) setState(() => _start = toISO(picked));
                  },
                  child: InputDecorator(decoration: const InputDecoration(labelText: 'Start'), child: Text(formatDateShort(_start))),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(context: context, initialDate: fromISO(_end), firstDate: DateTime(2000), lastDate: DateTime(2100));
                    if (picked != null) setState(() => _end = toISO(picked));
                  },
                  child: InputDecorator(decoration: const InputDecoration(labelText: 'End'), child: Text(formatDateShort(_end))),
                ),
              ),
            ],
          ),
        ),
        SectionCard(
          title: 'Calories',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  _Legend(color: c.accent, label: 'Intake${todayIntake != null ? ' ($todayIntake)' : ''}'),
                  _Legend(color: c.accent2, label: 'Burned'),
                  if (goalPoints.isNotEmpty) _Legend(color: c.accent3, label: 'Goal${todayGoal != null ? ' ($todayGoal)' : ''}'),
                  if (maintenance != null) _Legend(color: c.textDim, label: 'Maintenance (${maintenance.tdee})'),
                ],
              ),
              const SizedBox(height: 8),
              TrendChart(series: caloriesSeries),
              if (todayGoal != null && maintenance != null) ...[
                const SizedBox(height: 8),
                _AlignmentBadge(todayIntake: todayIntake, todayGoal: todayGoal, maintenance: maintenance),
              ],
            ],
          ),
        ),
        _MetricCard(title: 'Sleep (h)', color: c.accent, points: pointsFor((e) => e.sleepHours)),
        _MetricCard(title: 'Water (L)', color: c.accent, points: pointsFor((e) => e.water)),
        _MetricCard(title: 'Cigarettes', color: c.accent, points: pointsFor((e) => e.cigarettes?.toDouble())),
        _MetricCard(title: 'Protein (g)', color: c.accent, points: pointsFor((e) => e.protein?.toDouble())),
        _MetricCard(title: 'Carbs (g)', color: c.accent, points: pointsFor((e) => e.carbs?.toDouble())),
        _MetricCard(title: 'Fat (g)', color: c.accent, points: pointsFor((e) => e.fat?.toDouble())),
        _MetricCard(title: 'Steps', color: c.accent, points: pointsFor((e) => e.steps?.toDouble())),
      ],
    );
  }

  // A flat reference line only needs its two endpoints — fl_chart draws a
  // straight segment between them, so there's no need for one point per day.
  List<ChartPoint> _flatSeries(String start, String end, double value) {
    if (start == end) return [ChartPoint(start, value)];
    return [ChartPoint(start, value), ChartPoint(end, value)];
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final Color color;
  final List<ChartPoint> points;

  const _MetricCard({required this.title, required this.color, required this.points});

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: title,
      child: TrendChart(series: [ChartSeries(points: points, color: color)]),
    );
  }
}

class _Legend extends StatelessWidget {
  final Color color;
  final String label;
  const _Legend({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: c.text, fontSize: 11)),
      ],
    );
  }
}

class _AlignmentBadge extends StatelessWidget {
  final int? todayIntake;
  final int? todayGoal;
  final calc.MaintenanceResult maintenance;

  const _AlignmentBadge({required this.todayIntake, required this.todayGoal, required this.maintenance});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final deficitPct = (((maintenance.tdee - todayGoal!) / maintenance.tdee) * 100).round();
    final deficitHealthy = deficitPct >= calc.minHealthyDeficitPct && deficitPct <= calc.maxHealthyDeficitPct;
    final deficitNote = deficitPct < 0 ? 'goal is ${deficitPct.abs()}% above maintenance (surplus)' : 'goal is $deficitPct% below maintenance';

    bool? intakeHealthy;
    String intakeNote = '';
    if (todayIntake != null) {
      final intakeDiffPct = (((todayIntake! - todayGoal!) / todayGoal!) * 100).round();
      intakeHealthy = intakeDiffPct.abs() <= 10;
      intakeNote = intakeDiffPct > 0
          ? 'intake is $intakeDiffPct% over today\'s goal'
          : intakeDiffPct < 0
              ? 'intake is ${intakeDiffPct.abs()}% under today\'s goal'
              : "intake matches today's goal";
    }

    bool? rateHealthy;
    String rateNote = '';
    final measured = maintenance.measured;
    if (maintenance.method == 'measured' && measured != null) {
      final ratePctPerWeek = (measured.weightChangeKg / measured.periodDays * 7) / measured.weightStart * 100;
      rateHealthy = ratePctPerWeek >= calc.minHealthyWeeklyLossPct && ratePctPerWeek <= calc.maxHealthyWeeklyLossPct;
      rateNote = ratePctPerWeek > 0
          ? 'losing ${ratePctPerWeek.toStringAsFixed(1)}%/week'
          : ratePctPerWeek < 0
              ? 'gaining ${ratePctPerWeek.abs().toStringAsFixed(1)}%/week'
              : 'weight stable';
    }

    final checks = 1 + (intakeHealthy == null ? 0 : 1) + (rateHealthy == null ? 0 : 1);
    final passCount = (deficitHealthy ? 1 : 0) + (intakeHealthy == true ? 1 : 0) + (rateHealthy == true ? 1 : 0);
    String icon, label;
    Color color;
    if (passCount == checks) {
      icon = '🟢';
      label = 'Aligned';
      color = c.accent;
    } else if (passCount == 0) {
      icon = '🔴';
      label = 'Not aligned';
      color = c.danger;
    } else {
      icon = '🟡';
      label = 'Partially aligned';
      color = c.accent2;
    }

    final notes = [deficitNote, if (intakeHealthy != null) intakeNote, if (rateHealthy != null) rateNote];

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 8,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
          child: Text('$icon $label', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        Text(notes.join(' · '), style: TextStyle(color: c.textDim, fontSize: 11)),
      ],
    );
  }
}
