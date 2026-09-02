# Release signing (Play Store)

The debug build (what `build-android.yml` publishes to the `android-latest` GitHub
Release) is signed with Android's shared debug key, which the Play Store will not
accept. A real release build needs its own signing key, generated once and kept private.

## 1. Generate a keystore (once, on your own machine -- not in a shared/cloud sandbox)

```
keytool -genkeypair -v -keystore ~/gymlog-release.jks \
  -alias gymlog -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password, a key password, and some identity fields
(name/org/etc -- these show up in the certificate, not the app). Keep the resulting
`.jks` file and both passwords somewhere durable and private (a password manager, not
this repo, not chat). **If you lose this file, see the note on Play App Signing below --
losing it is recoverable, but only if you enrolled.**

## 2. Create `android/key.properties`

This file is git-ignored (see `android/.gitignore`) -- it must never be committed.

```properties
storeFile=/absolute/path/to/gymlog-release.jks
storePassword=<the keystore password>
keyAlias=gymlog
keyPassword=<the key password>
```

`android/app/build.gradle` picks this up automatically when it exists and wires it into
the `release` build type's `signingConfig`. No `key.properties` (e.g. in CI, or before
you've done this) just means release builds have no signing config, same as before this
setup existed.

## 3. Build the release bundle

Play Store submissions want an `.aab` (Android App Bundle), not an `.apk`:

```
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

## 4. Enroll in Play App Signing (strongly recommended)

On your **first** upload to Play Console, it will offer to let Google manage your app's
real distribution signing key ("Play App Signing"). Accept it. What you generated above
becomes your **upload key** -- you sign the bundle you upload with it, Google verifies
it and re-signs with the key it holds. The practical benefit: if you ever lose the
upload key or it leaks, Google Play support can help you reset it. Without Play App
Signing, losing your one signing key means you can never publish an update to this app
again under the same listing.

## 5. Version bump reminder

Play Store rejects a re-upload with a `versionCode` it's already seen. Bump
`versionCode` (and usually `versionName`) in `android/app/build.gradle` before each
release build -- the existing debug-build workflow does not do this for you.
