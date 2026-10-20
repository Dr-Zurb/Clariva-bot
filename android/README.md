# Halo Aid for Android

A window onto https://haloaid.com, plus a home-screen tile named **New idea**.

The tile opens `/dashboard/social/idea`. The line is typed on that page. Android does not allow a text box inside a home-screen tile.

Opening the app icon opens the site. Long-press the icon for the same New idea shortcut.

## Install on a phone

1. Build `app-release.apk` (see below) and send it to the phone.
2. Open the file and allow install from this source.
3. Touch and hold the home screen, pick Widgets, then Halo Aid, then New idea.
4. Remove the older Chrome “Halo Aid” icon if two icons are confusing. The widget belongs to this app.

The address bar disappears after `frontend/public/.well-known/assetlinks.json` is live on https://haloaid.com and the phone has checked it. Until then the page still opens, with Chrome’s bar.

## Build

Requires JDK 17 and an Android SDK with platform 35. `local.properties` points `sdk.dir` at the SDK. `keystore.properties` and `haloaid-upload.keystore` stay on this machine.

```sh
./gradlew assembleRelease
```

The file is `app/build/outputs/apk/release/app-release.apk`.
