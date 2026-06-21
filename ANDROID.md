# King of Open Play for Android

The Android application uses Capacitor to package the existing offline-first
HTML, CSS, and JavaScript application inside a native Android WebView.

## Download

The current public beta APK is:

`downloads/King-of-Open-Play-Android-v1.0.0-beta.1.apk`

SHA-256:
`F0274445589EFF334C0C422518DB45B7BEA4ABDA2C3BBC85D9B3DA3365389F7F`

The APK supports Android 7.0 and newer. Because it is downloaded outside Google
Play, Android may ask the user to allow installation from their browser or file
manager.

## Build requirements

- Node.js 22 or newer
- pnpm
- JDK 21
- Android SDK platform 36 and build tools 36

## Build an APK

```powershell
pnpm install
pnpm run build:android-web
pnpm exec cap sync android
cd android
.\gradlew.bat assembleDebug
```

The generated APK is located at:

`android/app/build/outputs/apk/debug/app-debug.apk`

## Application identity

- App name: King of Open Play
- Package ID: `com.developerking.kingofopenplay`
- Version name: `1.0`
- Version code: `1`
- Minimum Android version: Android 7.0 / API 24
- Target SDK: Android 16 / API 36

## Publishing note

The beta download is signed with an Android debug certificate and is suitable
for direct testing and community beta distribution. A Google Play release
should use a permanent private release key and an Android App Bundle (`.aab`) so
future updates can retain the same signing identity.
