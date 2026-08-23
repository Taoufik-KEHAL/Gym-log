# Gym Log

A simple app for tracking daily body weight, workouts, calorie intake, and protein. All data is stored locally on your device — nothing is sent to a server, and your logs persist across app restarts.

There are two implementations in this repo:

- **`mobile/`** — a native Flutter/Dart rewrite (v2.0). This is the actively developed version going forward.
- **`www/`** — the original vanilla HTML/JS/CSS PWA, kept working for now. See below for how to run it.

## Flutter app (`mobile/`)

Requires the [Flutter SDK](https://docs.flutter.dev/get-started/install). Sign in with Google and your data syncs to Firestore, so it's available across every device you sign into — the export/import JSON is the same shape the original web app used in `localStorage`, so a backup from either app can still be imported into the other.

```
cd mobile
flutter pub get
flutter run              # launch on a connected device/emulator
flutter test              # unit + widget tests
flutter build apk --debug # APK output: mobile/build/app/outputs/flutter-apk/app-debug.apk
```

The app needs a Firebase project connected before sign-in/sync will work — see `mobile/README.md` for the one-time setup (`flutterfire configure`, enabling Google sign-in, deploying `mobile/firestore.rules`). Without that, it builds and runs fine but stops at a "Firebase isn't configured" screen.

`.github/workflows/build-flutter-android.yml` builds a debug APK and publishes it to the `flutter-android-latest` GitHub Release on every push to `main` that touches `mobile/`.

## Legacy web app (`www/`)

There are two ways to run the web app: as a website (Add to Home Screen), or as a real installed Android app.

## Option A — Install as a website (PWA)

Data lives in the browser's `localStorage` for that site, so clearing browsing data in Safari/Chrome wipes it.

1. Host `www/` (see below) or open `www/index.html` directly over HTTPS/localhost.
2. On the phone, open the site in your browser:
   - **iPhone (Safari):** tap Share → **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** / **Install app**.
3. Launch it from the home screen icon — it opens full-screen like a native app and keeps working without an internet connection (a service worker caches the app files).

### Running locally

```
python3 -m http.server 8080 --directory www
```

Then open `http://localhost:8080/` in your browser.

To deploy for real phone access, host `www/` on any static hosting (GitHub Pages, Netlify, Vercel, etc.) — it must be served over HTTPS (or localhost) for "Add to Home Screen" and offline support to work. This repo's `.github/workflows/deploy-pages.yml` publishes `www/` to GitHub Pages automatically on every push to `main`.

## Option B — Install as a native Android app (Capacitor)

This gives the app its own private on-device storage, completely separate from the browser — clearing Chrome's browsing data can't touch it. The native project lives in `android/` and is generated from `www/` via [Capacitor](https://capacitorjs.com).

Requires Android Studio (or the Android SDK + a JDK) on your machine — building an APK needs the Android SDK, which can't be fetched from a network-restricted sandbox.

```
npm install
npx cap sync android   # re-run any time www/ changes
npx cap open android    # opens the project in Android Studio
```

From Android Studio, connect your phone (with USB debugging enabled) or start an emulator, then hit **Run**. Or from the command line, with the Android SDK installed:

```
cd android
./gradlew assembleDebug
# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

Install the resulting APK on your phone (`adb install app-debug.apk`, or copy it over and open it — you'll need to allow installing from this source).

## Features

- **Today:** log body weight (kg), calories eaten, and protein (g) for any date.
- **Workout:** build a session — add exercises, then log sets (reps × weight).
- **History:** a combined day-by-day timeline of body stats and workouts.
- **Weight trend:** a simple chart of your weight over time.
- **Data:** export/import a JSON backup, or erase all data on the device.

## Data & storage

Everything is saved in the browser's `localStorage` on that specific device/browser. It is **not synced** between devices. Use the **Export JSON** button on the Data tab regularly to back up your logs (e.g. before clearing browser data or switching phones), and **Import JSON** to restore.