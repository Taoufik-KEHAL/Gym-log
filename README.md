# Gym Log

A simple, installable web app for tracking daily body weight, workouts, calorie intake, and protein. All data is stored locally on your device (`localStorage`) — nothing is sent to a server, and your logs persist across app restarts.

## Install on your phone (as an app icon, works offline)

1. Host the files (see below) or open `index.html` directly over HTTPS/localhost.
2. On the phone, open the site in your browser:
   - **iPhone (Safari):** tap Share → **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** / **Install app**.
3. Launch it from the home screen icon — it opens full-screen like a native app and keeps working without an internet connection (a service worker caches the app files).

## Running locally

Any static file server works, e.g.:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/` in your browser.

To deploy for real phone access, host these files on any static hosting (GitHub Pages, Netlify, Vercel, etc.) — it must be served over HTTPS (or localhost) for "Add to Home Screen" and offline support to work.

## Features

- **Today:** log body weight (kg), calories eaten, and protein (g) for any date.
- **Workout:** build a session — add exercises, then log sets (reps × weight).
- **History:** a combined day-by-day timeline of body stats and workouts.
- **Weight trend:** a simple chart of your weight over time.
- **Data:** export/import a JSON backup, or erase all data on the device.

## Data & storage

Everything is saved in the browser's `localStorage` on that specific device/browser. It is **not synced** between devices. Use the **Export JSON** button on the Data tab regularly to back up your logs (e.g. before clearing browser data or switching phones), and **Import JSON** to restore.