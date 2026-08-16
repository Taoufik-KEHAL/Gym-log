import 'package:flutter/material.dart';

import '../theme.dart';

enum StatStatus { none, good, bad }

/// A single metric tile on the Today screen, port of `.stat` /
/// `.stat.stat-good` / `.stat.stat-bad`.
class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color? subColor;
  final StatStatus status;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.sub,
    this.subColor,
    this.status = StatStatus.none,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final borderColor = switch (status) {
      StatStatus.good => c.accent,
      StatStatus.bad => c.danger,
      StatStatus.none => c.border,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.bgElev,
        border: Border.all(color: borderColor, width: status == StatStatus.none ? 1 : 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(color: c.textDim, fontSize: 11, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(color: c.text, fontSize: 20, fontWeight: FontWeight.w700),
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(
              sub!,
              style: TextStyle(color: subColor ?? c.textDim, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}
