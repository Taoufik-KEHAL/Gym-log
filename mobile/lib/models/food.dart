class Macros {
  final double calories;
  final double protein;
  final double carbs;
  final double fat;

  const Macros({
    required this.calories,
    required this.protein,
    required this.carbs,
    required this.fat,
  });

  factory Macros.fromJson(Map<String, dynamic> json) => Macros(
    calories: (json['calories'] as num).toDouble(),
    protein: (json['protein'] as num).toDouble(),
    carbs: (json['carbs'] as num).toDouble(),
    fat: (json['fat'] as num).toDouble(),
  );

  Map<String, dynamic> toJson() => {
    'calories': calories,
    'protein': protein,
    'carbs': carbs,
    'fat': fat,
  };
}

/// An item in a day's food log, mirrors entries under `gymlog.foodlog`.
class FoodLogEntry {
  String id;
  String name;
  int? grams;
  int calories;
  int protein;
  int carbs;
  int fat;
  double? units;
  double? unitGrams;

  FoodLogEntry({
    required this.id,
    required this.name,
    this.grams,
    required this.calories,
    required this.protein,
    required this.carbs,
    required this.fat,
    this.units,
    this.unitGrams,
  });

  factory FoodLogEntry.fromJson(Map<String, dynamic> json) => FoodLogEntry(
    id: json['id'] as String,
    name: json['name'] as String,
    grams: (json['grams'] as num?)?.round(),
    calories: (json['calories'] as num).round(),
    protein: (json['protein'] as num).round(),
    carbs: (json['carbs'] as num).round(),
    fat: (json['fat'] as num).round(),
    units: (json['units'] as num?)?.toDouble(),
    unitGrams: (json['unitGrams'] as num?)?.toDouble(),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (grams != null) 'grams': grams,
    'calories': calories,
    'protein': protein,
    'carbs': carbs,
    'fat': fat,
    if (units != null) 'units': units,
    if (unitGrams != null) 'unitGrams': unitGrams,
  };
}

/// A saved food product, mirrors entries under `gymlog.customfoods`.
class CustomFood {
  String id;
  String name;
  Macros per100;

  CustomFood({required this.id, required this.name, required this.per100});

  factory CustomFood.fromJson(Map<String, dynamic> json) => CustomFood(
    id: json['id'] as String,
    name: json['name'] as String,
    per100: Macros.fromJson(json['per100'] as Map<String, dynamic>),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'per100': per100.toJson(),
  };
}
