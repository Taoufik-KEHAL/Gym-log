import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/daily_entry.dart';
import '../models/enums.dart';
import '../models/settings.dart';
import '../models/workout.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../utils/calc.dart' as calc;
import '../utils/dates.dart';
import '../widgets/section_card.dart';
import '../widgets/segmented_toggle.dart';
import '../widgets/stat_card.dart';
import '../widgets/trend_chart.dart';

class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key});

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  String _date = todayISO();
  DayType? _dayType;

  late final TextEditingController _weightCtrl = TextEditingController();
  late final TextEditingController _sleepCtrl = TextEditingController();
  late final TextEditingController _stepsCtrl = TextEditingController();
  late final TextEditingController _waterCtrl = TextEditingController();
  late final TextEditingController _cigarettesCtrl = TextEditingController();

  String _trendStart = addDaysISO(todayISO(), -29);
  final String _trendEnd = todayISO();

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    _fillForm(app.entryFor(_date));
    final earliest = calc.getEarliestLoggedWeightDate(app.daily);
    if (earliest != null) _trendStart = earliest;
  }

  @override
  void dispose() {
    _weightCtrl.dispose();
    _sleepCtrl.dispose();
    _stepsCtrl.dispose();
    _waterCtrl.dispose();
    _cigarettesCtrl.dispose();
    super.dispose();
  }

  void _fillForm(DailyEntry entry) {
    _weightCtrl.text = entry.weight?.toString() ?? '';
    _sleepCtrl.text = entry.sleepHours?.toString() ?? '';
    _stepsCtrl.text = entry.steps?.toString() ?? '';
    _waterCtrl.text = entry.water?.toString() ?? '';
    _cigarettesCtrl.text = entry.cigarettes?.toString() ?? '';
    _dayType = entry.dayType;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: fromISO(_date),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      _date = toISO(picked);
      _fillForm(context.read<AppState>().entryFor(_date));
    });
  }

  Future<void> _save() async {
    final app = context.read<AppState>();
    final existing = app.entryFor(_date);
    final entry = DailyEntry(
      weight: double.tryParse(_weightCtrl.text),
      sleepHours: double.tryParse(_sleepCtrl.text),
      calories: existing.calories,
      protein: existing.protein,
      carbs: existing.carbs,
      fat: existing.fat,
      steps: int.tryParse(_stepsCtrl.text),
      water: double.tryParse(_waterCtrl.text),
      cigarettes: int.tryParse(_cigarettesCtrl.text),
      dayType: _dayType,
    );
    await app.saveDailyEntry(_date, entry);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Saved ${formatDateLong(_date)}'), duration: const Duration(seconds: 2)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final app = context.watch<AppState>();
    final entry = app.entryFor(_date);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Log',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Date'),
                  child: Text(formatDateLong(_date)),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _weightCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Weight (kg)'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _sleepCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Sleep (h)'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _stepsCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Steps'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _waterCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Water (L)'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _cigarettesCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Cigarettes'),
              ),
              const SizedBox(height: 12),
              SegmentedToggle<DayType?>(
                values: const [DayType.rest, DayType.workout, DayType.cardio],
                selected: _dayType,
                labelFor: (t) => dayTypeLabels[t]!,
                onChanged: (t) => setState(() => _dayType = _dayType == t ? null : t),
              ),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _save, child: const Text('Save')),
            ],
          ),
        ),
        SectionCard(
          title: 'Stats',
          child: _StatsGrid(entry: entry, daily: app.daily, date: _date, settings: app.settings, workouts: app.workouts),
        ),
        SectionCard(
          title: 'Weight trend',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TrendChart(
                series: [
                  ChartSeries(
                    color: c.accent,
                    points: (app.daily.entries
                          .where((e) => e.value.weight != null && e.key.compareTo(_trendStart) >= 0 && e.key.compareTo(_trendEnd) <= 0)
                          .map((e) => ChartPoint(e.key, e.value.weight!))
                          .toList()
                        ..sort((a, b) => a.date.compareTo(b.date))),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatsGrid extends StatelessWidget {
  final DailyEntry entry;
  final Map<String, DailyEntry> daily;
  final String date;
  final AppSettings settings;
  final List<WorkoutSession> workouts;

  const _StatsGrid({
    required this.entry,
    required this.daily,
    required this.date,
    required this.settings,
    required this.workouts,
  });

  @override
  Widget build(BuildContext context) {
    // Weight: good if lower than it was ~3-7 days ago.
    StatStatus weightStatus = StatStatus.none;
    if (entry.weight != null) {
      for (var back = 7; back >= 3; back--) {
        final ref = daily[addDaysISO(date, -back)];
        if (ref?.weight != null) {
          weightStatus = entry.weight! < ref!.weight! ? StatStatus.good : StatStatus.bad;
          break;
        }
      }
    }

    final waterStatus = entry.water == null
        ? StatStatus.none
        : (entry.water! >= calc.waterLTarget ? StatStatus.good : StatStatus.bad);
    final sleepStatus = entry.sleepHours == null
        ? StatStatus.none
        : (entry.sleepHours! >= calc.sleepHoursMin ? StatStatus.good : StatStatus.bad);
    final stepsStatus = entry.steps == null
        ? StatStatus.none
        : (entry.steps! >= calc.activeDayStepsThreshold ? StatStatus.good : StatStatus.bad);

    StatStatus cigStatus = StatStatus.none;
    if (entry.cigarettes != null) {
      if (entry.cigarettes == 0) {
        cigStatus = StatStatus.good;
      } else {
        final yest = daily[addDaysISO(date, -1)];
        if (yest?.cigarettes != null) {
          cigStatus = entry.cigarettes! < yest!.cigarettes! ? StatStatus.good : StatStatus.bad;
        }
      }
    }

    final target = calc.calorieTargetForDayType(settings, entry.dayType);
    String? calSub;
    Color? calSubColor;
    StatStatus calStatus = StatStatus.none;
    if (target != null) {
      final consumed = entry.calories ?? 0;
      final remaining = target - consumed;
      final c = context.colors;
      if (remaining >= 0) {
        calSub = remaining == 0 ? 'On goal' : '$remaining kcal remaining';
        calSubColor = c.accent;
        calStatus = StatStatus.good;
      } else {
        calSub = '${remaining.abs()} kcal over';
        calSubColor = c.danger;
        calStatus = StatStatus.bad;
      }
    }

    final burned = calc.getCaloriesBurnedBreakdown(
      date: date,
      weightKg: entry.weight,
      steps: entry.steps,
      workouts: workouts,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (entry.dayType != null || burned.total > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (entry.dayType != null)
                  _Badge(dayTypeLabels[entry.dayType]!),
                if (burned.total > 0)
                  _Badge('🔥 ${burned.total} kcal burned (est.)'),
              ],
            ),
          ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.8,
          children: [
            StatCard(label: 'Weight', value: entry.weight != null ? '${entry.weight} kg' : '—', status: weightStatus),
            StatCard(label: 'Sleep', value: entry.sleepHours != null ? '${entry.sleepHours} h' : '—', status: sleepStatus),
            StatCard(
              label: 'Calories',
              value: entry.calories != null ? '${entry.calories}' : '—',
              sub: calSub,
              subColor: calSubColor,
              status: calStatus,
            ),
            StatCard(label: 'Protein', value: entry.protein != null ? '${entry.protein} g' : '—'),
            StatCard(label: 'Carbs', value: entry.carbs != null ? '${entry.carbs} g' : '—'),
            StatCard(label: 'Fat', value: entry.fat != null ? '${entry.fat} g' : '—'),
            StatCard(label: 'Steps', value: entry.steps != null ? '${entry.steps}' : '—', status: stepsStatus),
            StatCard(label: 'Water', value: entry.water != null ? '${entry.water} L' : '—', status: waterStatus),
            StatCard(label: 'Cigarettes', value: entry.cigarettes != null ? '${entry.cigarettes}' : '—', status: cigStatus),
          ],
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  const _Badge(this.text);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.bgElev2, borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(color: c.text, fontSize: 12)),
    );
  }
}
