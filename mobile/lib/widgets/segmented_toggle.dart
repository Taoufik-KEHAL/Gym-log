import 'package:flutter/material.dart';

import '../theme.dart';

/// Row of mutually-exclusive pill buttons, port of the web app's
/// `.segmented .segment` toggle groups (day type, sex, exercise type, etc.).
class SegmentedToggle<T> extends StatelessWidget {
  final List<T> values;
  final T? selected;
  final String Function(T) labelFor;
  final ValueChanged<T> onChanged;

  const SegmentedToggle({
    super.key,
    required this.values,
    required this.selected,
    required this.labelFor,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: values.map((v) {
        final active = v == selected;
        return ChoiceChip(
          label: Text(labelFor(v)),
          selected: active,
          onSelected: (_) => onChanged(v),
          backgroundColor: c.bgElev2,
          selectedColor: c.accent,
          labelStyle: TextStyle(
            color: active
                ? (Theme.of(context).brightness == Brightness.dark
                      ? Colors.black
                      : Colors.white)
                : c.text,
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(color: active ? c.accent : c.border),
          ),
        );
      }).toList(),
    );
  }
}
