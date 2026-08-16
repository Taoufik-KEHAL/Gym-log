import 'package:flutter/material.dart';

/// Color tokens ported from `www/css/style.css`'s `:root` (dark, the
/// default) and its `prefers-color-scheme: light` override.
class AppColors {
  final Color bg;
  final Color bgElev;
  final Color bgElev2;
  final Color border;
  final Color text;
  final Color textDim;
  final Color accent;
  final Color accentDim;
  final Color accent2;
  final Color accent3;
  final Color danger;

  const AppColors({
    required this.bg,
    required this.bgElev,
    required this.bgElev2,
    required this.border,
    required this.text,
    required this.textDim,
    required this.accent,
    required this.accentDim,
    required this.accent2,
    required this.accent3,
    required this.danger,
  });

  static const dark = AppColors(
    bg: Color(0xFF0F1115),
    bgElev: Color(0xFF181B21),
    bgElev2: Color(0xFF21252D),
    border: Color(0xFF2A2F3A),
    text: Color(0xFFF2F3F5),
    textDim: Color(0xFF9AA1AC),
    accent: Color(0xFF5EC2A0),
    accentDim: Color(0xFF3A7A63),
    accent2: Color(0xFFF0A03C),
    accent3: Color(0xFF5B9BD5),
    danger: Color(0xFFE0645A),
  );

  static const light = AppColors(
    bg: Color(0xFFF4F5F7),
    bgElev: Color(0xFFFFFFFF),
    bgElev2: Color(0xFFECEEF1),
    border: Color(0xFFDDE1E6),
    text: Color(0xFF191B1F),
    textDim: Color(0xFF5A616C),
    accent: Color(0xFF1F8F6C),
    accentDim: Color(0xFFCDECE1),
    accent2: Color(0xFFB5720A),
    accent3: Color(0xFF2F6FB0),
    danger: Color(0xFFC9463C),
  );
}

/// Extension so widgets can grab `Theme.of(context).extension<AppColorsExt>()`
/// style tokens without threading them through constructors.
class AppColorsExt extends ThemeExtension<AppColorsExt> {
  final AppColors colors;
  const AppColorsExt(this.colors);

  @override
  AppColorsExt copyWith({AppColors? colors}) =>
      AppColorsExt(colors ?? this.colors);

  @override
  AppColorsExt lerp(ThemeExtension<AppColorsExt>? other, double t) => this;
}

ThemeData buildTheme(AppColors c, Brightness brightness) {
  final base = ThemeData(brightness: brightness, useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: c.accent,
      secondary: c.accent3,
      error: c.danger,
      surface: c.bgElev,
    ),
    cardColor: c.bgElev,
    dividerColor: c.border,
    textTheme: base.textTheme.apply(
      bodyColor: c.text,
      displayColor: c.text,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      foregroundColor: c.text,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
    ),
    cardTheme: CardThemeData(
      color: c.bgElev,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.bgElev2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.border),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: c.bgElev,
      selectedItemColor: c.accent,
      unselectedItemColor: c.textDim,
      type: BottomNavigationBarType.fixed,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: brightness == Brightness.dark ? Colors.black : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    extensions: [AppColorsExt(c)],
  );
}

extension AppColorsContext on BuildContext {
  AppColors get colors =>
      Theme.of(this).extension<AppColorsExt>()?.colors ?? AppColors.dark;
}
