# SomaSense: Google Play upload notes

## What's in this package

| Item | Where | Notes |
|---|---|---|
| App bundle | `app/build/outputs/bundle/release/app-release.aab` | Built by `./gradlew :app:bundleRelease`, signed with your upload key |
| App ID | `com.ncubeeight.somasense` | Permanent once uploaded |
| Version | 1.0 (versionCode 1) | Raise `versionCode` in `app/build.gradle.kts` for every later upload |
| Store icon | `play/icon-512.png` | 512 × 512 PNG, made from the launcher logo |

Debug builds still install as `com.symptomtracker.draft`, so the copy on the Pixel keeps its entries. The Play version is a separate app with its own empty log.

## Signing

The upload key is yours. It lives at `~/Keys/somasense-upload.jks`, and its passwords go in `keystore.properties` (gitignored). In the Play Console, accept **Play App Signing**: Google keeps the key that signs what users install, and you keep the upload key. Back up the `.jks` file and its password somewhere safe. If you lose it, Google can reset it, but that takes a support request.

## Release a build

```
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew --no-daemon :app:bundleRelease
```

Upload the `.aab` under **Test and release → Testing → Internal testing** first. Install it from the Play link on the Pixel, check it, then promote it to production.

## App content answers

- **Privacy policy:** https://ncubeeight.github.io/SomaSense/privacy/
- **App access:** all features are available without signing in.
- **Ads:** no ads.
- **Data safety:**
  - Does the app collect or share user data? **No.** The app has no internet permission, so nothing it stores leaves the phone.
  - A PDF or image leaves the phone only when the person picks an app from the Android share sheet. Google treats that as a user-initiated transfer, not as collection or sharing.
  - Data is encrypted in transit: not applicable, since nothing is sent.
  - People can ask for their data to be deleted: the app's **Settings → Delete stored on-device data** does this, and uninstalling also removes it.
- **Health apps declaration:** choose the symptom tracking or health management category. The app records symptoms the person enters. It does not diagnose, treat or give medical advice, and it is not a medical device.
- **Target audience:** 18 and over. This keeps the app out of the Families program requirements.
- **Content rating:** fill in the questionnaire honestly. It has no violence, user-to-user chat, purchases or location sharing, so expect an Everyone or PEGI 3 rating.
- **Government app / financial features / news:** no.

## Store listing

- **App name:** SomaSense
- **Short description** (80 characters or fewer). A suggestion: "Mark where it hurts on a 3D body, track symptoms privately, share a PDF report."
- **Full description:** your own words. Say that everything stays on the phone.
- **Category:** Medical, or Health & Fitness.
- **Contact email:** required. Use the address you want shown publicly.
- **Phone screenshots:** 2 to 8. Pixel 10 Pro screenshots are 1080 × 2410, and Play limits the long side to twice the short side. Crop each to 1080 × 2160 first, for example:
  ```
  sips --cropToHeightWidth 2160 1080 shot.png --out shot-play.png
  ```
  Use sample data, not your real entries.
- **Feature graphic:** `play/feature-graphic.jpg`, 1024 × 500 JPEG with no transparency. It reuses the splash art: the emblem, wordmark and tagline, side by side.

## Before production

If the developer account is a personal account created after November 2023, Google requires a closed test with at least 12 testers for 14 days before production access. Organization accounts, such as one for ncubeeight LLC, are exempt.
