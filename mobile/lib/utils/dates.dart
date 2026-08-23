import 'package:intl/intl.dart';

/// ISO yyyy-MM-dd for the given date, defaulting to local "today".
String todayISO() => toISO(DateTime.now());

String toISO(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

DateTime fromISO(String iso) => DateTime.parse(iso);

String addDaysISO(String iso, int delta) =>
    toISO(fromISO(iso).add(Duration(days: delta)));

int daysBetweenISO(String a, String b) =>
    fromISO(b).difference(fromISO(a)).inDays;

String formatDateLong(String iso) =>
    DateFormat('EEE, MMM d').format(fromISO(iso));

String formatDateShort(String iso) => DateFormat('d MMM').format(fromISO(iso));

String formatDateOfBirth(String iso) => DateFormat('d MMM yyyy').format(fromISO(iso));

String getDefaultWorkoutSessionName(String iso) {
  final d = fromISO(iso);
  final dayName = DateFormat('EEEE').format(d);
  final month = iso.substring(5, 7);
  return '$dayName-$month';
}
