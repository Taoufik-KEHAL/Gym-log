import 'enums.dart';

class SetEntry {
  double reps;
  double weight;

  SetEntry({required this.reps, required this.weight});

  factory SetEntry.fromJson(Map<String, dynamic> json) => SetEntry(
    reps: (json['reps'] as num).toDouble(),
    weight: (json['weight'] as num).toDouble(),
  );

  Map<String, dynamic> toJson() => {'reps': reps, 'weight': weight};
}

/// A single exercise inside a [WorkoutSession] (strength: list of sets;
/// cardio: duration/pace instead of sets).
class ExerciseEntry {
  String name;
  ExerciseType type;
  List<SetEntry> sets;
  double? duration; // minutes, cardio only
  double? pace; // min/km, cardio only

  ExerciseEntry.strength({required this.name, List<SetEntry>? sets})
    : type = ExerciseType.strength,
      sets = sets ?? [],
      duration = null,
      pace = null;

  ExerciseEntry.cardio({required this.name, this.duration, this.pace})
    : type = ExerciseType.cardio,
      sets = [];

  factory ExerciseEntry.fromJson(Map<String, dynamic> json) {
    final type = exerciseTypeFromJson(json['type'] as String?);
    if (type == ExerciseType.cardio) {
      return ExerciseEntry.cardio(
        name: json['name'] as String,
        duration: (json['duration'] as num?)?.toDouble(),
        pace: (json['pace'] as num?)?.toDouble(),
      );
    }
    return ExerciseEntry.strength(
      name: json['name'] as String,
      sets: (json['sets'] as List<dynamic>? ?? [])
          .map((s) => SetEntry.fromJson(s as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'type': exerciseTypeToJson(type),
    if (type == ExerciseType.strength)
      'sets': sets.map((s) => s.toJson()).toList(),
    if (type == ExerciseType.cardio) 'duration': duration,
    if (type == ExerciseType.cardio) 'pace': pace,
  };

  ExerciseEntry copy() {
    if (type == ExerciseType.cardio) {
      return ExerciseEntry.cardio(name: name, duration: duration, pace: pace);
    }
    return ExerciseEntry.strength(
      name: name,
      sets: sets.map((s) => SetEntry(reps: s.reps, weight: s.weight)).toList(),
    );
  }
}

class WorkoutSession {
  String id;
  String date; // ISO yyyy-MM-dd
  String name;
  List<ExerciseEntry> exercises;

  WorkoutSession({
    required this.id,
    required this.date,
    required this.name,
    required this.exercises,
  });

  factory WorkoutSession.fromJson(Map<String, dynamic> json) =>
      WorkoutSession(
        id: json['id'] as String,
        date: json['date'] as String,
        name: json['name'] as String,
        exercises: (json['exercises'] as List<dynamic>? ?? [])
            .map((e) => ExerciseEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'date': date,
    'name': name,
    'exercises': exercises.map((e) => e.toJson()).toList(),
  };
}
