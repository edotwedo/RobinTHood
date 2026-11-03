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
