# RobinTHood Launch & Tester Recruitment Handoff

## Current Status & Live Infrastructure
- **Google Play Console (`com.edotwedo.robinthood`)**:
  - Closed testing track (`track001`) submitted with bundle `0.8.2 (21)`.
  - 13 declaration updates in Google review queue (~24–48h).
  - Target Audience: 18+ | Category: Tools | Rating: Teen / 12+.
- **Web & Landing Page**:
  - Codebase: `site/index.html` (committed to `claude/android-rebuild`).
  - Live deployment: `https://robinthood.pages.dev` (Cloudflare Pages project `robinthood`).
  - Domain: `robinthood.com` and `www.robinthood.com` configured on Cloudflare DNS with active SSL (HTTP 200).
- **Codebase & Binaries**:
  - Branch: `claude/android-rebuild` @ commit `3cf3c2d` (clean, all 49 Node.js tests passing).
  - AAB / APK: `~/Downloads/RobinTHood-play.aab`, `~/Downloads/RobinTHood.apk`.
  - Store Assets: `~/Downloads/icon-512.png`, `~/Downloads/feature-graphic.png`, screenshots 1–5.

## Immediate Priority: Tester Recruitment (Google 14-Day Rule)
To unlock Production access on Google Play for personal developer accounts:
- **Requirement**: Minimum **12 testers** opted-in and installed continuously for **14 consecutive days**.
- **Action 1**: Create a Google Group at `https://groups.google.com` (e.g., `robinthood-beta@googlegroups.com`). Adding this group to Play Console means anyone with a Google account can join without re-editing CSVs.
- **Action 2**: Add all collected Gmail addresses to `~/Downloads/testers.csv` and upload to Play Console.
- **Action 3**: Blast out the closed-test invite email / DM to friends, family, and online tester communities (`r/AndroidClosedTesting`).

## Next Technical Steps
1. Add DNS CNAME records for `robinthood.com` in Cloudflare dashboard to finalize SSL.
2. Setup iOS target / build workflow for App Store Connect.
3. Once Google approves track001, grab the live opt-in link and verify tester onboarding.
