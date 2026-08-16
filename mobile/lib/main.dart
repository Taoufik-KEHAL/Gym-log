import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/root_shell.dart';
import 'services/app_state.dart';
import 'services/nav_controller.dart';
import 'theme.dart';

void main() {
  runApp(const GymLogApp());
}

class GymLogApp extends StatelessWidget {
  const GymLogApp({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AppState>(
      future: AppState.create(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const MaterialApp(
            home: Scaffold(
              backgroundColor: Color(0xFF0F1115),
              body: Center(child: CircularProgressIndicator()),
            ),
          );
        }
        return MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: snapshot.data!),
            ChangeNotifierProvider(create: (_) => NavController()),
          ],
          child: MaterialApp(
            title: 'Gym Log',
            debugShowCheckedModeBanner: false,
            theme: buildTheme(AppColors.light, Brightness.light),
            darkTheme: buildTheme(AppColors.dark, Brightness.dark),
            home: const RootShell(),
          ),
        );
      },
    );
  }
}
