import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../theme.dart';
import '../utils/dates.dart';

class ChartPoint {
  final String date;
  final double value;
  const ChartPoint(this.date, this.value);
}

class ChartSeries {
  final List<ChartPoint> points;
  final Color color;
  final bool dashed;
  const ChartSeries({required this.points, required this.color, this.dashed = false});
}

/// Multi-series line chart over a shared date axis, port of the web app's
/// canvas-based `drawMultiLineChart`. Series with `dashed: true` (goal /
/// maintenance reference lines) render without dots.
class TrendChart extends StatelessWidget {
  final List<ChartSeries> series;
  final double height;

  const TrendChart({super.key, required this.series, this.height = 160});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final allDates = <String>{};
    for (final s in series) {
      for (final p in s.points) {
        allDates.add(p.date);
      }
    }
    final dates = allDates.toList()..sort();

    if (dates.length < 2) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text(
            'Log at least two days to see a trend.',
            style: TextStyle(color: c.textDim, fontSize: 12),
          ),
        ),
      );
    }

    final dateIndex = {for (var i = 0; i < dates.length; i++) dates[i]: i};

    double minY = double.infinity, maxY = -double.infinity;
    for (final s in series) {
      for (final p in s.points) {
        if (p.value < minY) minY = p.value;
        if (p.value > maxY) maxY = p.value;
      }
    }
    if (minY == maxY) {
      minY -= 1;
      maxY += 1;
    }
    final pad = (maxY - minY) * 0.15;
    minY -= pad;
    maxY += pad;

    final maxLabels = 5;
    final labelStep = ((dates.length - 1) / (maxLabels - 1)).ceil().clamp(1, dates.length);

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minY: minY,
          maxY: maxY,
          minX: 0,
          maxX: (dates.length - 1).toDouble(),
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 20,
                interval: labelStep.toDouble(),
                getTitlesWidget: (value, meta) {
                  final idx = value.round();
                  if (idx < 0 || idx >= dates.length) return const SizedBox.shrink();
                  if (idx % labelStep != 0 && idx != dates.length - 1) {
                    return const SizedBox.shrink();
                  }
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      formatDateShort(dates[idx]),
                      style: TextStyle(color: c.textDim, fontSize: 9),
                    ),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => c.bgElev2,
              getTooltipItems: (spots) => spots.map((s) {
                final idx = s.x.round();
                final label = idx >= 0 && idx < dates.length ? formatDateShort(dates[idx]) : '';
                return LineTooltipItem(
                  '$label\n${_fmt(s.y)}',
                  TextStyle(color: c.text, fontSize: 11),
                );
              }).toList(),
            ),
          ),
          lineBarsData: series.map((s) {
            final spots = s.points
                .map((p) => FlSpot(dateIndex[p.date]!.toDouble(), p.value))
                .toList()
              ..sort((a, b) => a.x.compareTo(b.x));
            return LineChartBarData(
              spots: spots,
              isCurved: false,
              color: s.color,
              barWidth: 2,
              dashArray: s.dashed ? [5, 4] : null,
              dotData: FlDotData(show: !s.dashed),
              belowBarData: BarAreaData(show: false),
            );
          }).toList(),
        ),
      ),
    );
  }

  static String _fmt(double v) {
    final r = (v * 10).round() / 10;
    return r == r.roundToDouble() ? r.round().toString() : r.toString();
  }
}
