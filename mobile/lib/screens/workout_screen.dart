import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../data/exercise_library.dart';
import '../models/enums.dart';
import '../models/workout.dart';
import '../models/workout_template.dart';
import '../services/app_state.dart';
import '../services/nav_controller.dart';
import '../theme.dart';
import '../utils/dates.dart';
import '../widgets/list_row.dart';
import '../widgets/section_card.dart';
import '../widgets/segmented_toggle.dart';

const _uuid = Uuid();
const String kCustomExerciseValue = '__custom__';

class WorkoutScreen extends StatefulWidget {
  const WorkoutScreen({super.key});

  @override
  State<WorkoutScreen> createState() => _WorkoutScreenState();
}

class _WorkoutScreenState extends State<WorkoutScreen> {
  String _date = todayISO();
  late String _name;
  String? _editingWorkoutId;
  String _lastAutoName = '';
  List<ExerciseEntry> _exercises = [];

  ExerciseType _pickerType = ExerciseType.strength;
  String? _pickerSelection;
  final TextEditingController _customNameCtrl = TextEditingController();
  final TextEditingController _templateNameCtrl = TextEditingController();
  late final TextEditingController _nameCtrl;

  NavController? _nav;

  @override
  void initState() {
    super.initState();
    _name = getDefaultWorkoutSessionName(_date);
    _lastAutoName = _name;
    _nameCtrl = TextEditingController(text: _name);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _nav = context.read<NavController>()..addListener(_handleNavChange);
    });
  }

  @override
  void dispose() {
    _nav?.removeListener(_handleNavChange);
    _customNameCtrl.dispose();
    _templateNameCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  void _setName(String value) {
    _name = value;
    _nameCtrl.value = TextEditingValue(text: value, selection: TextSelection.collapsed(offset: value.length));
  }

  void _handleNavChange() {
    final nav = context.read<NavController>();
    final toEdit = nav.consumeWorkoutToEdit();
    if (toEdit == null) return;
    setState(() {
      _editingWorkoutId = toEdit.id;
      _date = toEdit.date;
      _setName(toEdit.name);
      _lastAutoName = ''; // real data, not an auto placeholder
      _exercises = toEdit.exercises.map((e) => e.copy()).toList();
    });
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
      if (_name == _lastAutoName) {
        _setName(getDefaultWorkoutSessionName(_date));
        _lastAutoName = _name;
      }
    });
  }

  void _addExercise() {
    final app = context.read<AppState>();
    final isCustom = _pickerSelection == null || _pickerSelection == kCustomExerciseValue;
    final name = isCustom ? _customNameCtrl.text.trim() : _pickerSelection!;
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter an exercise name')));
      return;
    }
    if (isCustom) app.saveCustomExerciseIfNew(name, _pickerType);
    setState(() {
      _exercises.add(
        _pickerType == ExerciseType.cardio
            ? ExerciseEntry.cardio(name: name)
            : ExerciseEntry.strength(name: name),
      );
      _customNameCtrl.clear();
      _pickerSelection = null;
    });
  }

  Future<void> _saveWorkout() async {
    final app = context.read<AppState>();
    final exercises = _exercises
        .where((ex) => ex.type == ExerciseType.cardio ? (ex.duration != null && ex.duration! > 0) : ex.sets.isNotEmpty)
        .toList();
    if (exercises.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one set or a cardio duration')),
      );
      return;
    }
    final wasEditing = _editingWorkoutId != null;
    final workout = WorkoutSession(
      id: _editingWorkoutId ?? _uuid.v4(),
      date: _date,
      name: _name.trim().isEmpty ? 'Workout' : _name.trim(),
      exercises: exercises,
    );
    await app.saveWorkout(workout, isEditing: wasEditing);
    setState(() {
      _editingWorkoutId = null;
      _exercises = [];
      _date = todayISO();
      _setName(getDefaultWorkoutSessionName(_date));
      _lastAutoName = _name;
    });
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(wasEditing ? 'Workout updated' : 'Workout saved')),
    );
    context.read<NavController>().goTo(AppTab.history);
  }

  void _cancelEdit() {
    setState(() {
      _editingWorkoutId = null;
      _exercises = [];
      _date = todayISO();
      _setName(getDefaultWorkoutSessionName(_date));
      _lastAutoName = _name;
    });
  }

  Future<void> _loadTemplate(WorkoutTemplate template) async {
    if (_exercises.isNotEmpty) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Replace current exercises with "${template.name}"?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Replace')),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    setState(() {
      _exercises = template.exercises
          .map(
            (e) => e.type == ExerciseType.cardio
                ? ExerciseEntry.cardio(name: e.name)
                : ExerciseEntry.strength(name: e.name),
          )
          .toList();
    });
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Loaded "${template.name}" — fill in today\'s sets')),
    );
  }

  Future<void> _saveAsTemplate() async {
    if (_exercises.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add exercises first')));
      return;
    }
    final app = context.read<AppState>();
    final name = _templateNameCtrl.text.trim().isNotEmpty ? _templateNameCtrl.text.trim() : (_name.trim().isNotEmpty ? _name.trim() : 'My Routine');
    final exercises = _exercises.map((ex) => TemplateExercise(name: ex.name, type: ex.type)).toList();
    await app.saveAsTemplate(name, exercises);
    _templateNameCtrl.clear();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved template "$name"')));
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Templates',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (app.workoutTemplates.isEmpty)
                const EmptyState('No saved templates yet.')
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: app.workoutTemplates
                      .map(
                        (t) => ActionChip(
                          label: Text('${t.name} (${t.exercises.length})'),
                          onPressed: () => _loadTemplate(t),
                        ),
                      )
                      .toList(),
                ),
            ],
          ),
        ),
        SectionCard(
          title: 'Session',
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
              TextField(
                decoration: const InputDecoration(labelText: 'Session name'),
                controller: _nameCtrl,
                onChanged: (v) => _name = v,
              ),
            ],
          ),
        ),
        SectionCard(
          title: 'Add exercise',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SegmentedToggle<ExerciseType>(
                values: const [ExerciseType.strength, ExerciseType.cardio],
                selected: _pickerType,
                labelFor: (t) => t == ExerciseType.cardio ? 'Cardio' : 'Strength',
                onChanged: (t) => setState(() {
                  _pickerType = t;
                  _pickerSelection = null;
                }),
              ),
              const SizedBox(height: 12),
              _ExercisePicker(
                type: _pickerType,
                selection: _pickerSelection,
                customExerciseNames: app.customExercises
                    .where((e) => e.type == _pickerType)
                    .map((e) => e.name)
                    .toList(),
                onChanged: (v) => setState(() => _pickerSelection = v),
              ),
              if (_pickerSelection == kCustomExerciseValue || _pickerSelection == null) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _customNameCtrl,
                  decoration: const InputDecoration(labelText: 'Exercise name'),
                  onSubmitted: (_) => _addExercise(),
                ),
              ],
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _addExercise, child: const Text('Add exercise')),
            ],
          ),
        ),
        ..._exercises.asMap().entries.map(
          (entry) => SectionCard(
            child: _ExerciseBlock(
              exercise: entry.value,
              onRemove: () => setState(() => _exercises.removeAt(entry.key)),
              onChanged: () => setState(() {}),
            ),
          ),
        ),
        Row(
          children: [
            Expanded(child: ElevatedButton(onPressed: _saveWorkout, child: Text(_editingWorkoutId != null ? 'Update Workout' : 'Save Workout'))),
            if (_editingWorkoutId != null) ...[
              const SizedBox(width: 12),
              OutlinedButton(onPressed: _cancelEdit, child: const Text('Cancel')),
            ],
          ],
        ),
        const SizedBox(height: 14),
        SectionCard(
          title: 'Save as template',
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _templateNameCtrl,
                  decoration: const InputDecoration(labelText: 'Template name (optional)'),
                ),
              ),
              const SizedBox(width: 12),
              OutlinedButton(onPressed: _saveAsTemplate, child: const Text('Save')),
            ],
          ),
        ),
      ],
    );
  }
}

class _ExercisePicker extends StatelessWidget {
  final ExerciseType type;
  final String? selection;
  final List<String> customExerciseNames;
  final ValueChanged<String?> onChanged;

  const _ExercisePicker({
    required this.type,
    required this.selection,
    required this.customExerciseNames,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final items = <DropdownMenuItem<String>>[];
    if (type == ExerciseType.cardio) {
      for (final name in exerciseLibrary['Cardio']!) {
        items.add(DropdownMenuItem(value: name, child: Text(name)));
      }
    } else {
      for (final group in exerciseLibrary.keys.where((g) => g != 'Cardio')) {
        for (final name in exerciseLibrary[group]!) {
          items.add(DropdownMenuItem(value: name, child: Text('$group · $name')));
        }
      }
    }
    for (final name in customExerciseNames) {
      items.add(DropdownMenuItem(value: name, child: Text('My Exercises · $name')));
    }
    items.add(const DropdownMenuItem(value: kCustomExerciseValue, child: Text('Other (type your own)…')));

    return DropdownButtonFormField<String>(
      isExpanded: true,
      initialValue: selection,
      decoration: const InputDecoration(labelText: 'Exercise'),
      items: items,
      onChanged: onChanged,
    );
  }
}

class _ExerciseBlock extends StatefulWidget {
  final ExerciseEntry exercise;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  const _ExerciseBlock({required this.exercise, required this.onRemove, required this.onChanged});

  @override
  State<_ExerciseBlock> createState() => _ExerciseBlockState();
}

class _ExerciseBlockState extends State<_ExerciseBlock> {
  final _repsCtrl = TextEditingController();
  final _weightCtrl = TextEditingController();
  final _durationCtrl = TextEditingController();
  final _paceCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _durationCtrl.text = widget.exercise.duration?.toString() ?? '';
    _paceCtrl.text = widget.exercise.pace?.toString() ?? '';
  }

  @override
  void dispose() {
    _repsCtrl.dispose();
    _weightCtrl.dispose();
    _durationCtrl.dispose();
    _paceCtrl.dispose();
    super.dispose();
  }

  void _addSet() {
    final reps = double.tryParse(_repsCtrl.text);
    if (reps == null || reps <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter reps')));
      return;
    }
    final weight = double.tryParse(_weightCtrl.text) ?? 0;
    setState(() {
      widget.exercise.sets.add(SetEntry(reps: reps, weight: weight));
      _repsCtrl.clear();
      _weightCtrl.clear();
    });
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final ex = widget.exercise;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(ex.name, style: TextStyle(color: c.text, fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            TextButton(onPressed: widget.onRemove, child: const Text('Remove')),
          ],
        ),
        if (ex.type == ExerciseType.cardio) ...[
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _durationCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Duration (min)'),
                  onChanged: (v) {
                    ex.duration = double.tryParse(v);
                    widget.onChanged();
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _paceCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Pace (min/km)'),
                  onChanged: (v) {
                    ex.pace = double.tryParse(v);
                    widget.onChanged();
                  },
                ),
              ),
            ],
          ),
        ] else ...[
          ...ex.sets.asMap().entries.map(
            (entry) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Text('#${entry.key + 1}', style: TextStyle(color: c.textDim, fontSize: 12)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${entry.value.reps} reps @ ${entry.value.weight} kg',
                      style: TextStyle(color: c.text, fontWeight: FontWeight.w600),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      setState(() => ex.sets.removeAt(entry.key));
                      widget.onChanged();
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _repsCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Reps'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _weightCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Weight (kg)'),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(onPressed: _addSet, child: const Text('Add set')),
            ],
          ),
        ],
      ],
    );
  }
}
