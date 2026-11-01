# RobinTHood for Android

Expo (SDK 54) app. Free keyless AI chat with a model picker.

Rebuilt Oct 31, 2026 from the installed v0.2.1 APK, because the original Android source only ever lived on Phil's old Windows PC.

## What changed from v0.2.1

- The full conversation is sent with every message. v0.2.1 sent only the latest message, so it forgot everything.
- A real model picker. Tap the model name under the title. The default is GPT-OSS 120B. "Kilo Auto" lets Kilo choose the model, so it comes last in the Auto order.
- The text box stays above the keyboard.
- The header sits below the Android status bar.
- Chats and settings are saved on the phone. **New** starts a fresh chat.
- The system prompt tells the model to answer directly and skip unrequested lectures.
- **0.5.0: web search.** With 🌐 Web on (the default), each message is searched on DuckDuckGo, with Wikipedia as backup. The top results, plus text from the top two pages, go to the model, and the sources show as tappable links under the answer. No key or account needed. The model is also told today's date.

The Pro / Google Play purchase from v0.2.1 is not included; it was never live in the Play Store.

- **0.6.0: background music.** An original chiptune loop (`assets/theme.m4a`, made by `music/compose.py`) plays while the app is open and stops when you leave it. The ♪ button turns it on or off; Settings has Quiet/Normal/Loud. It mixes with other audio.
- **0.7.0: Robin acts for itself.** It decides when to search the web and which pages to open, then keeps going until it can answer; you see each step (🔎 search, 📄 reading). It can also list, read and write files (Markdown by default) in a folder you pick on the phone, which you can see in your Files app. Plain-text actions (`SEARCH:`, `OPEN:`, `LIST FILES`, `READ:`, `WRITE:`) work with any model; the loop is in `agent.js`, and the folder access is in `files.js`.
- The Play bundle (`.aab`) is built too. Privacy policy: https://edotwedo.github.io/RobinTHood/privacy-android.html

## Build

GitHub Actions (`.github/workflows/android-apk.yml`) builds a release APK on every push that touches `android-app/`. It publishes the APK to the `android-latest` prerelease:

https://github.com/edotwedo/robinthood/releases/download/android-latest/RobinTHood.apk

The APK is signed with the standard React Native debug key. That means builds install over each other, but not over v0.2.1: uninstall v0.2.1 once first.

## Code

- `App.js`: screens (chat, model picker, settings).
- `engines.js`: model list, cascade, streaming, and history building.
- `web.js`: keyless web search and page-text extraction.
