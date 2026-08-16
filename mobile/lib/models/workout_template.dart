import 'enums.dart';

class TemplateExercise {
  String name;
  ExerciseType type;

  TemplateExercise({required this.name, required this.type});

  factory TemplateExercise.fromJson(Map<String, dynamic> json) =>
      TemplateExercise(
        name: json['name'] as String,
        type: exerciseTypeFromJson(json['type'] as String?),
      );

  Map<String, dynamic> toJson() => {
    'name': name,
    'type': exerciseTypeToJson(type),
  };
}

/// A reusable exercise list, mirrors entries under
/// `gymlog.customWorkoutTemplates`.
class WorkoutTemplate {
  String id;
  String name;
  List<TemplateExercise> exercises;

  WorkoutTemplate({
    required this.id,
    required this.name,
    required this.exercises,
  });

  factory WorkoutTemplate.fromJson(Map<String, dynamic> json) =>
      WorkoutTemplate(
        id: json['id'] as String,
        name: json['name'] as String,
        exercises: (json['exercises'] as List<dynamic>? ?? [])
            .map((e) => TemplateExercise.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'exercises': exercises.map((e) => e.toJson()).toList(),
  };
}
