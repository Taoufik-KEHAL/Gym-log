import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../models/enums.dart';
import '../models/food.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../utils/dates.dart';
import '../widgets/list_row.dart';
import '../widgets/section_card.dart';
import '../widgets/segmented_toggle.dart';

const _uuid = Uuid();

class FoodScreen extends StatefulWidget {
  const FoodScreen({super.key});

  @override
  State<FoodScreen> createState() => _FoodScreenState();
}

class _FoodScreenState extends State<FoodScreen> {
  String _date = todayISO();
  final _searchCtrl = TextEditingController();
  CustomFood? _selected;
  QtyMode _qtyMode = QtyMode.grams;
  final _gramsCtrl = TextEditingController(text: '100');
  final _unitsCtrl = TextEditingController(text: '1');
  final _unitGramsCtrl = TextEditingController(text: '50');

  bool _showNewFood = false;
  final _newFoodNameCtrl = TextEditingController();
  final _newFoodCalCtrl = TextEditingController();
  final _newFoodProteinCtrl = TextEditingController();
  final _newFoodCarbsCtrl = TextEditingController();
  final _newFoodFatCtrl = TextEditingController();

  String? _editingMyFoodId;
  final _myFoodNameCtrl = TextEditingController();
  final _myFoodCalCtrl = TextEditingController();
  final _myFoodProteinCtrl = TextEditingController();
  final _myFoodCarbsCtrl = TextEditingController();
  final _myFoodFatCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    _gramsCtrl.dispose();
    _unitsCtrl.dispose();
    _unitGramsCtrl.dispose();
    _newFoodNameCtrl.dispose();
    _newFoodCalCtrl.dispose();
    _newFoodProteinCtrl.dispose();
    _newFoodCarbsCtrl.dispose();
    _newFoodFatCtrl.dispose();
    _myFoodNameCtrl.dispose();
    _myFoodCalCtrl.dispose();
    _myFoodProteinCtrl.dispose();
    _myFoodCarbsCtrl.dispose();
    _myFoodFatCtrl.dispose();
    super.dispose();
  }

  double get _effectiveGrams {
    if (_qtyMode == QtyMode.units) {
      final units = double.tryParse(_unitsCtrl.text) ?? 0;
      final perUnit = double.tryParse(_unitGramsCtrl.text) ?? 0;
      return units * perUnit;
    }
    return double.tryParse(_gramsCtrl.text) ?? 0;
  }

  void _selectProduct(CustomFood food) {
    setState(() {
      _selected = food;
      _gramsCtrl.text = '100';
      _unitsCtrl.text = '1';
      _unitGramsCtrl.text = '50';
      _qtyMode = QtyMode.grams;
      _searchCtrl.clear();
    });
  }

  Future<void> _addFromSearch() async {
    final selected = _selected;
    if (selected == null) return;
    final grams = _effectiveGrams;
    if (grams <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a quantity')));
      return;
    }
    final factor = grams / 100;
    final entry = FoodLogEntry(
      id: _uuid.v4(),
      name: selected.name,
      grams: grams.round(),
      calories: (selected.per100.calories * factor).round(),
      protein: (selected.per100.protein * factor).round(),
      carbs: (selected.per100.carbs * factor).round(),
      fat: (selected.per100.fat * factor).round(),
      units: _qtyMode == QtyMode.units ? double.tryParse(_unitsCtrl.text) : null,
      unitGrams: _qtyMode == QtyMode.units ? double.tryParse(_unitGramsCtrl.text) : null,
    );
    await context.read<AppState>().addFoodEntry(_date, entry);
    if (!mounted) return;
    setState(() => _selected = null);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Added to food log')));
  }

  Future<void> _saveNewFood() async {
    final name = _newFoodNameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a food name')));
      return;
    }
    final per100 = Macros(
      calories: double.tryParse(_newFoodCalCtrl.text) ?? 0,
      protein: double.tryParse(_newFoodProteinCtrl.text) ?? 0,
      carbs: double.tryParse(_newFoodCarbsCtrl.text) ?? 0,
      fat: double.tryParse(_newFoodFatCtrl.text) ?? 0,
    );
    final appState = context.read<AppState>();
    await appState.addCustomFood(name, per100);
    final added = appState.customFoods.last;
    for (final c in [_newFoodNameCtrl, _newFoodCalCtrl, _newFoodProteinCtrl, _newFoodCarbsCtrl, _newFoodFatCtrl]) {
      c.clear();
    }
    if (!mounted) return;
    setState(() => _showNewFood = false);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved to My Foods')));
    _selectProduct(added);
  }

  void _startEditMyFood(CustomFood f) {
    setState(() {
      _editingMyFoodId = f.id;
      _myFoodNameCtrl.text = f.name;
      _myFoodCalCtrl.text = '${f.per100.calories}';
      _myFoodProteinCtrl.text = '${f.per100.protein}';
      _myFoodCarbsCtrl.text = '${f.per100.carbs}';
      _myFoodFatCtrl.text = '${f.per100.fat}';
    });
  }

  void _cancelEditMyFood() {
    setState(() {
      _editingMyFoodId = null;
      for (final c in [_myFoodNameCtrl, _myFoodCalCtrl, _myFoodProteinCtrl, _myFoodCarbsCtrl, _myFoodFatCtrl]) {
        c.clear();
      }
    });
  }

  Future<void> _saveMyFood() async {
    final name = _myFoodNameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a food name')));
      return;
    }
    final per100 = Macros(
      calories: double.tryParse(_myFoodCalCtrl.text) ?? 0,
      protein: double.tryParse(_myFoodProteinCtrl.text) ?? 0,
      carbs: double.tryParse(_myFoodCarbsCtrl.text) ?? 0,
      fat: double.tryParse(_myFoodFatCtrl.text) ?? 0,
    );
    final app = context.read<AppState>();
    if (_editingMyFoodId != null) {
      await app.updateCustomFood(_editingMyFoodId!, name, per100);
      _cancelEditMyFood();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Updated $name')));
    } else {
      await app.addCustomFood(name, per100);
      for (final c in [_myFoodNameCtrl, _myFoodCalCtrl, _myFoodProteinCtrl, _myFoodCarbsCtrl, _myFoodFatCtrl]) {
        c.clear();
      }
      if (!mounted) return;
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Added to My Foods')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final app = context.watch<AppState>();
    final query = _searchCtrl.text.trim().toLowerCase();
    final matches = query.length < 2
        ? <CustomFood>[]
        : app.customFoods.where((f) => f.name.toLowerCase().contains(query)).toList();
    final entries = app.foodLog[_date] ?? [];
    final totals = entries.fold<Map<String, int>>(
      {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
      (t, e) => {
        'calories': t['calories']! + e.calories,
        'protein': t['protein']! + e.protein,
        'carbs': t['carbs']! + e.carbs,
        'fat': t['fat']! + e.fat,
      },
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Add food',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _searchCtrl,
                decoration: const InputDecoration(labelText: 'Search My Foods'),
                onChanged: (_) => setState(() {}),
              ),
              if (query.length >= 2 && matches.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('No matching food yet — add it below.', style: TextStyle(color: c.textDim, fontSize: 12)),
                ),
              if (matches.isNotEmpty)
                Column(
                  children: matches
                      .map(
                        (f) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(f.name),
                          subtitle: Text('${f.per100.calories.round()} kcal / 100 g'),
                          onTap: () => _selectProduct(f),
                        ),
                      )
                      .toList(),
                ),
              if (_selected != null) ...[
                const Divider(),
                Text(_selected!.name, style: TextStyle(color: c.text, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                SegmentedToggle<QtyMode>(
                  values: const [QtyMode.grams, QtyMode.units],
                  selected: _qtyMode,
                  labelFor: (m) => m == QtyMode.grams ? 'Grams' : 'Units',
                  onChanged: (m) => setState(() => _qtyMode = m),
                ),
                const SizedBox(height: 8),
                if (_qtyMode == QtyMode.grams)
                  TextField(
                    controller: _gramsCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Grams'),
                    onChanged: (_) => setState(() {}),
                  )
                else
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _unitsCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'Units'),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _unitGramsCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'Grams / unit'),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 8),
                Builder(builder: (context) {
                  final grams = _effectiveGrams;
                  final factor = grams / 100;
                  final p = _selected!.per100;
                  return Text(
                    '${(p.calories * factor).round()} kcal · ${(p.protein * factor).round()} g protein · '
                    '${(p.carbs * factor).round()} g carbs · ${(p.fat * factor).round()} g fat',
                    style: TextStyle(color: c.textDim, fontSize: 12),
                  );
                }),
                const SizedBox(height: 8),
                ElevatedButton(onPressed: _addFromSearch, child: const Text('Add to log')),
              ],
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => _showNewFood = !_showNewFood),
                child: Text(_showNewFood ? 'Hide new food form' : "Can't find it? Add a new food"),
              ),
              if (_showNewFood) ...[
                TextField(controller: _newFoodNameCtrl, decoration: const InputDecoration(labelText: 'Food name')),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: TextField(controller: _newFoodCalCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'kcal/100g'))),
                    const SizedBox(width: 8),
                    Expanded(child: TextField(controller: _newFoodProteinCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'protein/100g'))),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: TextField(controller: _newFoodCarbsCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'carbs/100g'))),
                    const SizedBox(width: 8),
                    Expanded(child: TextField(controller: _newFoodFatCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'fat/100g'))),
                  ],
                ),
                const SizedBox(height: 8),
                ElevatedButton(onPressed: _saveNewFood, child: const Text('Save new food')),
              ],
            ],
          ),
        ),
        SectionCard(
          title: 'Food log',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: fromISO(_date),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setState(() => _date = toISO(picked));
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Date'),
                  child: Text(formatDateLong(_date)),
                ),
              ),
              const SizedBox(height: 8),
              if (entries.isEmpty)
                const EmptyState('No food logged for this day.')
              else ...[
                ...entries.map(
                  (e) => ListRow(
                    title: e.name + (e.units != null ? ' (${e.units} × ${e.unitGrams} g = ${e.grams} g)' : (e.grams != null ? ' (${e.grams} g)' : '')),
                    subtitle: '${e.calories} kcal · ${e.protein} g protein · ${e.carbs} g carbs · ${e.fat} g fat',
                    actions: [
                      IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => context.read<AppState>().removeFoodEntry(_date, e.id),
                      ),
                    ],
                  ),
                ),
                const Divider(),
                Text(
                  'Total: ${totals['calories']} kcal · ${totals['protein']} g protein · ${totals['carbs']} g carbs · ${totals['fat']} g fat',
                  style: TextStyle(color: c.text, fontWeight: FontWeight.w600, fontSize: 12),
                ),
              ],
            ],
          ),
        ),
        SectionCard(
          title: 'My Foods',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(controller: _myFoodNameCtrl, decoration: const InputDecoration(labelText: 'Food name')),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: TextField(controller: _myFoodCalCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'kcal/100g'))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: _myFoodProteinCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'protein/100g'))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: TextField(controller: _myFoodCarbsCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'carbs/100g'))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: _myFoodFatCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'fat/100g'))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  ElevatedButton(onPressed: _saveMyFood, child: Text(_editingMyFoodId != null ? 'Update food' : 'Add to My Foods')),
                  if (_editingMyFoodId != null) ...[
                    const SizedBox(width: 8),
                    TextButton(onPressed: _cancelEditMyFood, child: const Text('Cancel')),
                  ],
                ],
              ),
              const Divider(),
              if (app.customFoods.isEmpty)
                const EmptyState('No foods saved yet.')
              else
                ...app.customFoods.map(
                  (f) => ListRow(
                    title: f.name,
                    subtitle: '${f.per100.calories.round()} kcal · ${f.per100.protein.round()} g protein · '
                        '${f.per100.carbs.round()} g carbs · ${f.per100.fat.round()} g fat (per 100g)',
                    actions: [
                      IconButton(icon: const Icon(Icons.edit_outlined, size: 18), onPressed: () => _startEditMyFood(f)),
                      IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => context.read<AppState>().removeCustomFood(f.id),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
