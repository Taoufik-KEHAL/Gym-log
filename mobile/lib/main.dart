import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'firebase_options.dart';
import 'screens/root_shell.dart';
import 'screens/sign_in_screen.dart';
import 'services/account_info.dart';
import 'services/app_state.dart';
import 'services/auth_service.dart';
import 'services/firestore_storage_service.dart';
import 'services/local_storage_service.dart';
import 'services/nav_controller.dart';
import 'services/storage_backend.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  var firebaseReady = true;
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    firebaseReady = false;
  }
  runApp(GymLogApp(firebaseReady: firebaseReady));
}

const _bgColor = Color(0xFF0F1115);

/// App root: brings up Firebase, gates on Google sign-in, and — once
/// signed in — hands a cloud-backed [GymLogStorage] to [GymLogHome].
class GymLogApp extends StatelessWidget {
  final bool firebaseReady;
  const GymLogApp({super.key, this.firebaseReady = true});

  @override
  Widget build(BuildContext context) {
    if (!firebaseReady) {
      return const _MessageApp(
        message:
            'Firebase isn\'t configured yet.\n\nRun `flutterfire configure` from '
            'mobile/ to connect this app to a Firebase project, then rebuild. '
            'See mobile/README.md for details.',
      );
    }
    return StreamBuilder<User?>(
      stream: AuthService.instance.authStateChanges,
      builder: (context, authSnapshot) {
        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return const _LoadingApp();
        }
        final user = authSnapshot.data;
        if (user == null) {
          return const MaterialApp(
            debugShowCheckedModeBanner: false,
            home: SignInScreen(),
          );
        }
        return FutureBuilder<GymLogStorage>(
          future: _prepareCloudStorage(user.uid),
          builder: (context, storageSnapshot) {
            if (storageSnapshot.hasError) {
              return const _MessageApp(
                message: 'Could not reach your cloud data. Check your connection and restart the app.',
              );
            }
            if (!storageSnapshot.hasData) {
              return const _LoadingApp();
            }
            return GymLogHome(
              storage: storageSnapshot.data!,
              account: AccountInfo(email: user.email, signOut: AuthService.instance.signOut),
            );
          },
        );
      },
    );
  }

  static Future<GymLogStorage> _prepareCloudStorage(String uid) async {
    final cloud = FirestoreStorageService(uid);
    final local = await LocalStorageService.create();
    await cloud.migrateFromLocalIfNeeded(local);
    return cloud;
  }
}

/// The actual app UI, parameterized on a storage backend so it can be
/// pumped directly in widget tests without going through Firebase/auth.
class GymLogHome extends StatelessWidget {
  final GymLogStorage storage;
  final AccountInfo account;

  const GymLogHome({super.key, required this.storage, this.account = const AccountInfo()});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AppState>(
      future: AppState.create(storage),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const _LoadingApp();
        }
        return MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: snapshot.data!),
            ChangeNotifierProvider(create: (_) => NavController()),
            Provider<AccountInfo>.value(value: account),
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

class _LoadingApp extends StatelessWidget {
  const _LoadingApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: _bgColor,
        body: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class _MessageApp extends StatelessWidget {
  final String message;
  const _MessageApp({required this.message});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: _bgColor,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
          ),
        ),
      ),
    );
  }
}
