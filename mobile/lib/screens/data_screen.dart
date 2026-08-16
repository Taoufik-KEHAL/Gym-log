import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/enums.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../utils/calc.dart' as calc;
import '../utils/dates.dart';
import '../widgets/list_row.dart';
import '../widgets/section_card.dart';
import '../widgets/segmented_toggle.dart';

class DataScreen extends StatefulWidget {
  const DataScreen({super.key});

  @override
  State<DataScreen> createState() => _DataScreenState();
}

class _DataScreenState extends State<DataScreen> {
  late final TextEditingController _ageCtrl;
  late final TextEditingController _heightCtrl;
  bool _showImportBox = false;
  final _importCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final settings = context.read<AppState>().settings;
    _ageCtrl = TextEditingController(text: settings.age?.toString() ?? '');
    _heightCtrl = TextEditingController(text: settings.heightCm?.toString() ?? '');
  }

  @override
  void dispose() {
    _ageCtrl.dispose();
    _heightCtrl.dispose();
    _importCtrl.dispose();
    super.dispose();
  }

  void _onSettingsFieldChanged() {
    final app = context.read<AppState>();
    app.updateSettings(
      age: int.tryParse(_ageCtrl.text),
      clearAge: _ageCtrl.text.trim().isEmpty,
      heightCm: int.tryParse(_heightCtrl.text),
      clearHeight: _heightCtrl.text.trim().isEmpty,
    );
  }

  Future<void> _export() async {
    final app = context.read<AppState>();
    final payload = app.exportAll();
    final json = const JsonEncoder.withIndent('  ').convert(payload);
    final filename = 'gymlog-backup-${todayISO()}.json';
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsString(json);
    await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], text: 'Gym Log backup $filename'));
  }

  Future<void> _importFromFile() async {
    final result = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: ['json']);
    if (result == null || result.files.single.path == null) return;
    final text = await File(result.files.single.path!).readAsString();
    await _applyImport(text);
  }

  Future<void> _applyImport(String text) async {
    Map<String, dynamic> payload;
    try {
      payload = jsonDecode(text) as Map<String, dynamic>;
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invalid JSON')));
      return;
    }
    await context.read<AppState>().importAll(payload);
    if (!mounted) return;
    final settings = context.read<AppState>().settings;
    setState(() {
      _ageCtrl.text = settings.age?.toString() ?? '';
      _heightCtrl.text = settings.heightCm?.toString() ?? '';
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Import complete')));
  }

  Future<void> _clearAll() async {
    final appState = context.read<AppState>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Erase all logged data on this device?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Erase')),
        ],
      ),
    );
    if (confirmed != true) return;
    await appState.clearAll();
    if (!mounted) return;
    setState(() {
      _ageCtrl.clear();
      _heightCtrl.clear();
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('All data erased')));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final app = context.watch<AppState>();
    final settings = app.settings;

    final suggestion = calc.computeActivityLevelFromHistory(daily: app.daily, workouts: app.workouts);
    final maintenance = calc.computeMaintenanceCalories(daily: app.daily, settings: settings);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Maintenance calories',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ageCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Age'),
                      onChanged: (_) => _onSettingsFieldChanged(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _heightCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Height (cm)'),
                      onChanged: (_) => _onSettingsFieldChanged(),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SegmentedToggle<Sex>(
                values: const [Sex.male, Sex.female],
                selected: settings.sex,
                labelFor: (s) => s == Sex.male ? 'Male' : 'Female',
                onChanged: (s) => app.updateSettings(sex: s),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<ActivityLevel>(
                initialValue: settings.activityLevel,
                decoration: const InputDecoration(labelText: 'Activity level'),
                items: ActivityLevel.values
                    .map((l) => DropdownMenuItem(value: l, child: Text(activityLevelLabels[l]!)))
                    .toList(),
                onChanged: (l) {
                  if (l != null) app.updateSettings(activityLevel: l);
                },
              ),
              if (suggestion != null) ...[
                const SizedBox(height: 8),
                Text(
                  '📊 Based on your last ${suggestion.loggedDays} logged days (${suggestion.activeDays} active), '
                  'your activity level looks like ${activityLevelLabels[suggestion.level]}.',
                  style: TextStyle(color: c.textDim, fontSize: 12),
                ),
              ],
              const SizedBox(height: 12),
              if (maintenance == null)
                Text('Enter your age and height above to estimate maintenance calories.', style: TextStyle(color: c.textDim, fontSize: 13))
              else
                _MaintenanceResultView(result: maintenance),
              if (settings.workoutCalories != null) ...[
                const SizedBox(height: 8),
                Text(
                  '${settings.workoutCalories} kcal/day target — same for rest, workout, and cardio days, fixed 25% below maintenance.',
                  style: TextStyle(color: c.text, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ],
          ),
        ),
        SectionCard(
          title: 'Workout templates',
          child: app.workoutTemplates.isEmpty
              ? const EmptyState('No saved templates yet.')
              : Column(
                  children: app.workoutTemplates
                      .map(
                        (t) => ListRow(
                          title: t.name,
                          subtitle: t.exercises.map((e) => e.name).join(', '),
                          actions: [
                            IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () => app.removeWorkoutTemplate(t.id),
                            ),
                          ],
                        ),
                      )
                      .toList(),
                ),
        ),
        SectionCard(
          title: 'Backup',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ElevatedButton(onPressed: _export, child: const Text('Export JSON')),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: _importFromFile, child: const Text('Import from file')),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => _showImportBox = !_showImportBox),
                child: Text(_showImportBox ? 'Hide paste-JSON box' : 'Or paste JSON to import'),
              ),
              if (_showImportBox) ...[
                TextField(
                  controller: _importCtrl,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: 'Paste backup JSON here'),
                ),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: () async {
                    final text = _importCtrl.text.trim();
                    if (text.isEmpty) return;
                    await _applyImport(text);
                    _importCtrl.clear();
                    setState(() => _showImportBox = false);
                  },
                  child: const Text('Import'),
                ),
              ],
              const SizedBox(height: 16),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger)),
                onPressed: _clearAll,
                child: const Text('Erase all data'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MaintenanceResultView extends StatelessWidget {
  final calc.MaintenanceResult result;
  const _MaintenanceResultView({required this.result});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    String label, note;
    if (result.method == 'measured') {
      final m = result.measured!;
      final changeAbs = m.weightChangeKg.abs().toStringAsFixed(1);
      final trendWord = m.weightChangeKg > 0 ? 'lost' : (m.weightChangeKg < 0 ? 'gained' : 'held steady on');
      label = 'Measured maintenance: ${result.tdee} kcal';
      note = 'from ${m.periodDays} days of your data (${formatDateShort(m.start)}–${formatDateShort(m.end)}): '
          'avg intake ${m.avgIntake} kcal, $trendWord $changeAbs kg';
    } else {
      label = 'Estimated maintenance: ${result.tdee} kcal';
      note = result.usedDefaultWeight!
          ? '${calc.defaultBodyweightKg.round()} kg assumed — log a weight on Today for a real estimate'
          : 'using ${result.weight} kg from ${formatDateLong(result.weightDate!)} (log weight + calories daily to switch to a measured estimate)';
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: c.bgElev2, borderRadius: BorderRadius.circular(20)),
          child: Text(label, style: TextStyle(color: c.text, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 4),
        Text(note, style: TextStyle(color: c.textDim, fontSize: 12)),
      ],
    );
  }
}
