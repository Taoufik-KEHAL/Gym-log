import 'enums.dart';

/// A user-added exercise name not present in the built-in library, mirrors
/// entries under `gymlog.customExercises`.
class CustomExercise {
  String name;
  ExerciseType type;

  CustomExercise({required this.name, required this.type});

  factory CustomExercise.fromJson(Map<String, dynamic> json) =>
      CustomExercise(
        name: json['name'] as String,
        type: exerciseTypeFromJson(json['type'] as String?),
      );

  Map<String, dynamic> toJson() => {
    'name': name,
    'type': exerciseTypeToJson(type),
  };
}
