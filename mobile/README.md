# gymlog

Track daily body weight, workouts, calorie intake, and protein — synced across your devices via Firebase.

## Getting Started

```
flutter pub get
flutter run
flutter test
```

## Firebase setup (required)

The app signs in with Google and stores your data in Firestore, so it needs a real Firebase project before it'll do anything beyond show a "Firebase isn't configured" screen. `lib/firebase_options.dart` ships with placeholder values on purpose — nobody should be able to write to a project they didn't create.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. In the project, enable:
   - **Authentication** → Sign-in method → **Google**.
   - **Firestore Database** (production mode is fine — the rules below lock it down).
3. From `mobile/`, install the FlutterFire CLI once and run it:
   ```
   dart pub global activate flutterfire_cli
   flutterfire configure
   ```
   Pick your project and the platforms you build for (Android/iOS at minimum). This registers the app with Firebase, downloads `google-services.json` / `GoogleService-Info.plist` into the platform folders, and overwrites `lib/firebase_options.dart` with your project's real values.
4. **Android only** — Google Sign-In needs your debug (and release) signing certificate's SHA-1 registered on the Firebase Android app:
   ```
   cd android && ./gradlew signingReport
   ```
   Add the SHA-1 (and SHA-256) under Project settings → your Android app in the Firebase console.
5. Deploy the Firestore security rules in `firestore.rules` (restricts every user to their own data):
   ```
   firebase deploy --only firestore:rules
   ```
6. `flutter run` — you should land on the Google sign-in screen, and your first sign-in copies over anything already logged locally on that device.

## Building

```
flutter build apk --debug # APK output: mobile/build/app/outputs/flutter-apk/app-debug.apk
```

`.github/workflows/build-flutter-android.yml` builds a debug APK and publishes it to the `flutter-android-latest` GitHub Release on every push to `main` that touches `mobile/`. That workflow doesn't deploy real Firebase credentials, so a build straight off this repo will compile fine but show the "Firebase isn't configured" screen at runtime until you complete the setup above.
