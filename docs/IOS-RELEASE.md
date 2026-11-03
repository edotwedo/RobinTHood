# iOS release (TestFlight)

Same Expo app as Android; the iOS bundle is `com.edotwedo.robinthood` (`app.json`).
CI builds an unsigned simulator copy on every push (the `ios` job) so the port cannot rot.
Shipping to real phones is the `ios-release` job: manual, signs, and uploads to TestFlight.

The one thing money cannot avoid: an Apple Developer account, $99/yr. There is no free path
to testers on iOS — a plain Apple ID only builds to your own phone, for 7 days, and cannot
be shared.

## 1. Apple side (once)

- Enroll in the Apple Developer Program. Note your 10-character Team ID (Membership details).
- App Store Connect -> My Apps -> **+** -> New App:
  - Platform iOS, name `RobinTHood`, primary language English (U.S.).
  - Bundle ID `com.edotwedo.robinthood` (must match `app.json`).
  - SKU: anything stable, e.g. `robinthood-ios`.
- Users and Access -> Integrations -> App Store Connect API -> Team Keys:
  - Generate a key with the **App Manager** role. Download the `.p8` now (one chance).
  - Record the Key ID and the Issuer ID shown above the key list.

## 2. GitHub secrets (once)

Repo -> Settings -> Secrets and variables -> Actions:

| Secret | Value |
|---|---|
| `ASC_KEY_ID` | Key ID of the App Store Connect API key |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | Full contents of the `.p8`, including the BEGIN/END lines |
| `APPLE_TEAM_ID` | 10-character Team ID |

Ad ID secrets are optional until the AdMob account exists (see below).

## 3. Build and upload

Actions -> "Android APK" -> Run workflow (branch `master` or `claude/android-rebuild`).
The `ios-release` job runs the unit tests, prebuilds, archives with automatic signing, and
uploads to App Store Connect. Its build number is the CI run number, so uploads never
collide. Then watch App Store Connect -> TestFlight -> Builds (processing takes a few
minutes to an hour).

## 4. TestFlight

- Internal testers: App Store Connect -> Users and Access -> add them; they install at once.
- External testers: create a group, add testers, submit the build for Beta App Review
  (usually a day). External testing allows up to 10,000 testers — and, unlike Google Play's
  closed track, there is no 12-testers-for-14-days requirement.

## 5. Before you submit for App Review

- **App Privacy**: declare "User Content" (the message sent to the model provider) and, for
  ads, the device identifier the Google Mobile Ads SDK collects. Only non-personalized ads
  run (`AdBanner.js` sets `requestNonPersonalizedAdsOnly`) and there is no ATT prompt, so it
  is not "used to track you". Check Google's current iOS data-disclosure guidance before filing.
- **Age rating**: 17+, because Robin can open arbitrary pages found in search results
  (unrestricted web access).
- **Privacy policy URL**: the hosted page (the Android one is fine).
- **Review notes**: say it needs no account or API key, and point at the in-app Report action
  for AI-generated content (Guideline 1.2).
- `ITSAppUsesNonExemptEncryption` is already `false` in `app.json`, so there is no export
  compliance prompt.

## Ad IDs

Until real AdMob IDs are set, the app shows Google's test banner (never a live one). Create
the AdMob app and units, then add these secrets; `app.config.js` bakes them in at build time.

| Secret | AdMob value |
|---|---|
| `ROBIN_ADMOB_IOS_APP` | iOS app ID (`ca-app-pub-...~...`) |
| `ROBIN_ADMOB_IOS_BANNER` | iOS banner unit ID (`ca-app-pub-.../...`) |
| `ROBIN_ADMOB_ANDROID_APP` | Android app ID |
| `ROBIN_ADMOB_ANDROID_BANNER` | Android banner unit ID |

## Local builds

`ios.buildNumber` in `app.json` is used only for Xcode builds; CI overrides it with the run
number. No Mac is needed for CI — the job runs on GitHub's `macos-15` runner.
