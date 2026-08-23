# gymlog

Track daily body weight, workouts, calorie intake, and protein — synced across your devices via Firebase.

## Getting Started

```
flutter pub get
flutter run
flutter test
```

## Firebase setup

The app signs in with Google and stores your data in Firestore. The project (`gym-log-4e139`) is already created and wired up for **Android** — `lib/firebase_options.dart` and `android/app/google-services.json` hold its real config, committed to the repo (these files identify the app to Firebase; they aren't secrets — real access control lives in Firestore's security rules and Firebase Auth).

Still to do, in the Firebase console at [console.firebase.google.com/project/gym-log-4e139](https://console.firebase.google.com/project/gym-log-4e139):

1. **Authentication** → Sign-in method → enable **Google**.
2. **Firestore Database** → create the database if it doesn't exist yet (production mode — `firestore.rules` in this repo locks it down).
3. **Android Google Sign-In** needs your signing certificate's SHA-1 registered on the Firebase Android app:
   ```
   cd android && ./gradlew signingReport
   ```
   Add the SHA-1 (and SHA-256) under Project settings → your Android app in the Firebase console. Do this again with your release keystore once you have one.
4. Deploy the Firestore security rules:
   ```
   firebase deploy --only firestore:rules
   ```
5. `flutter run` — you should land on the Google sign-in screen, and your first sign-in copies over anything already logged locally on that device.

**Other platforms (iOS, macOS, Windows, web)** aren't configured yet — only Android's `google-services.json`/`firebase_options.dart` entry exists. Re-run `flutterfire configure` from `mobile/` and pick the platform(s) you want to add; it'll extend `firebase_options.dart` and drop in the matching platform config file without touching the Android entry.

## Building

```
flutter build apk --debug # APK output: mobile/build/app/outputs/flutter-apk/app-debug.apk
```

`.github/workflows/build-flutter-android.yml` builds a debug APK and publishes it to the `flutter-android-latest` GitHub Release on every push to `main` that touches `mobile/`. That workflow doesn't deploy real Firebase credentials, so a build straight off this repo will compile fine but show the "Firebase isn't configured" screen at runtime until you complete the setup above.
