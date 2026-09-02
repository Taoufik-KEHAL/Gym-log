import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/enums.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../utils/dates.dart';
import '../widgets/segmented_toggle.dart';

/// One-time profile setup shown right after sign-in until sex, date of
/// birth, height, and smoker status are all on file — see
/// [AppSettings.needsOnboarding]. Also reachable later from the Data tab to
/// correct a mistake.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  late Sex _sex;
  DateTime? _dateOfBirth;
  late final TextEditingController _heightCtrl;
  bool? _isSmoker;

  @override
  void initState() {
    super.initState();
    final settings = context.read<AppState>().settings;
    _sex = settings.sex;
    _dateOfBirth = settings.dateOfBirth != null ? fromISO(settings.dateOfBirth!) : null;
    _heightCtrl = TextEditingController(text: settings.heightCm?.toString() ?? '');
    _isSmoker = settings.isSmoker;
  }

  @override
  void dispose() {
    _heightCtrl.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _dateOfBirth != null && int.tryParse(_heightCtrl.text) != null && _isSmoker != null;

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateOfBirth ?? DateTime(now.year - 30),
      firstDate: DateTime(now.year - 120),
      lastDate: now,
    );
    if (picked != null) setState(() => _dateOfBirth = picked);
  }

  void _save() {
    if (!_canSave) return;
    context.read<AppState>().updateSettings(
      sex: _sex,
      dateOfBirth: toISO(_dateOfBirth!),
      heightCm: int.parse(_heightCtrl.text),
      isSmoker: _isSmoker,
    );
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Your profile')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'A few details, entered once — used to estimate your maintenance '
                'calories. Your age keeps itself up to date from your date of birth.',
                style: TextStyle(color: c.textDim, fontSize: 13),
              ),
              const SizedBox(height: 24),
              Text('Sex', style: TextStyle(color: c.text, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SegmentedToggle<Sex>(
                values: const [Sex.male, Sex.female],
                selected: _sex,
                labelFor: (s) => s == Sex.male ? 'Male' : 'Female',
                onChanged: (s) => setState(() => _sex = s),
              ),
              const SizedBox(height: 20),
              Text('Date of birth', style: TextStyle(color: c.text, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _pickDateOfBirth,
                child: Text(
                  _dateOfBirth == null ? 'Select date' : formatDateOfBirth(toISO(_dateOfBirth!)),
                ),
              ),
              const SizedBox(height: 20),
              Text('Height', style: TextStyle(color: c.text, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              TextField(
                controller: _heightCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Height (cm)'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 20),
              Text('Do you smoke?', style: TextStyle(color: c.text, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SegmentedToggle<bool>(
                values: const [true, false],
                selected: _isSmoker,
                labelFor: (s) => s ? 'Yes' : 'No',
                onChanged: (s) => setState(() => _isSmoker = s),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: _canSave ? _save : null,
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
