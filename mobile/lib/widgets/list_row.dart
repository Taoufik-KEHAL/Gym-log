import 'package:flutter/material.dart';

import '../theme.dart';

/// Two-line title/subtitle row with trailing action buttons, port of the
/// web app's `.food-log-item` used for food-log entries, "My Foods", and
/// workout templates.
class ListRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> actions;

  const ListRow({
    super.key,
    required this.title,
    required this.subtitle,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: c.text, fontWeight: FontWeight.w600)),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(color: c.textDim, fontSize: 12)),
                ],
              ],
            ),
          ),
          ...actions,
        ],
      ),
    );
  }
}

/// Centered dim-text placeholder, port of `.empty-state`.
class EmptyState extends StatelessWidget {
  final String text;
  const EmptyState(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(text, style: TextStyle(color: c.textDim, fontSize: 13)),
    );
  }
}
