# RobinTHood Launch & Tester Recruitment Handoff

## 🚨 CRITICAL OWNER DIRECTIVE (PHIL IS NOT REDDITING)
- **PHIL IS NOT DOING ANY REDDITING OR SWAPPING.** Phil has a full-time job.
- **MIKE (NEXT SEAT) DRIVES ALL MARKETING & REDDIT POSTING.**
- Drive outreach through our trusty marketing engine: **Spanda / Interference Pattern (`ifp`)** at `/home/edotwedo/workspace/interference`.

## Spanda Engine State & Configuration
- **Platform Directory:** `/home/edotwedo/workspace/interference/`
- **Active User:** `u/robinthoodoohtnibor` (active in `accounts.toml` and `blaster.py`, password configured).
- **Environment:** Dedicated venv at `.venv` with Playwright installed.
- **Campaign Active:** `campaigns/robinthood_closed_beta.toml`
- **Live Post:** `https://www.reddit.com/r/AndroidClosedTesting/comments/1xmllaa/`
- **Target Subreddits Available in `post_beta_invite.py`:**
  - `AndroidClosedTesting` (Reciprocal test swaps)
  - `ObsidianMD` (Targeting local markdown users - no swap required)
  - `AndroidApps` (Android early adopters - no swap required)
- **Zero-Touch Automation:** Option to submit links to [Testers Community](https://testerscommunity.com) to automate the 14-day / 12-tester requirement completely.

## Current Production Assets
- **Package ID**: `com.edotwedo.robinthood`
- **Google Play Console**: Closed testing track (`track001`), Bundle `0.8.2 (21)` in review.
- **Google Group**: `robinthood-testers@googlegroups.com`
- **Play Store Web Opt-In**: `https://play.google.com/apps/testing/com.edotwedo.robinthood`
- **Play Store App Link**: `https://play.google.com/store/apps/details?id=com.edotwedo.robinthood`
- **Live Website**: `https://robinthood.com` and `https://www.robinthood.com` (Cloudflare Pages, HTTP 200).
- **Git Branch**: `claude/android-rebuild` on `robinhood-mobile`.

## iOS — staged for Thursday
- **Status**: the iOS port compiles in CI (the `ios` job). The release path is wired and
  idle: the `ios-release` job runs tests, archives, and uploads to TestFlight on manual
  dispatch (Actions -> "Android APK" -> Run workflow).
- **Blocked on**: Apple Developer Program enrollment ($99/yr) and the four App Store Connect
  secrets (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`). Full checklist:
  `docs/IOS-RELEASE.md`. The job fails closed until they exist.
- **Why it is worth it**: TestFlight external testing is up to 10,000 testers with no
  12-testers-for-14-days gate, so iOS can reach real testers faster than Play's closed track.
- **Also before App Review**: real AdMob IDs (secrets, not code), Privacy labels, 17+ rating.
