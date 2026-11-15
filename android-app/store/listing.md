# RobinTHood: Play Console Copy & Store Assets

Paste-ready text for the Google Play Console, updated for **v0.8.12** highlighting RobinTHood's local file & Obsidian vault integration, autonomous web research, and keyless sovereignty.

---

## Store Listing Copy

**App Name (30 characters max)**
`RobinTHood: AI & Notes Agent`
*(Length: 29 / 30 characters)*

**Short Description (80 characters max)**
`Free AI agent: web search, vision & local Obsidian vault notes. No accounts.`
*(Length: 76 / 80 characters)*

**Full Description (4,000 characters max)**

RobinTHood is a free, sovereign AI agent for Android. There are no accounts to create, no phone numbers harvested, and no subscriptions to pay.

Unlike passive chat apps that lock your data in proprietary clouds, RobinTHood works directly with your phone: it can browse the live web autonomously, read photos, and read/write real Markdown notes directly inside your local Obsidian vault or documents folder.

### What RobinTHood Does:

• **Local Notes & Obsidian Vaults**: Point Robin at your local notes folder or Obsidian vault via Android's Storage Access Framework. It searches your notes to provide context, answers questions from your private thoughts, and writes new notes with tags and [[wikilinks]].
• **Autonomous Web Research**: When you ask about current news, prices, documentation, or events, Robin doesn't just return links—it autonomously reads multiple web pages, synthesizes the facts, and cites its sources.
• **Photo & Vision Analysis**: Attach a photo, diagram, receipt, or screenshot and get instant, accurate breakdowns.
• **Direct, Non-Preachy Answers**: Robin is instructed to give direct, intelligent answers without corporate moralizing, lecturing, or patronizing filler.
• **Multi-Model Freedom**: Switch freely between top open models (GPT-OSS 120B, Qwen, Cohere, and Kilo Auto). If an endpoint is busy, it cascades smoothly to keep you moving.
• **Power-User Sovereignty**: Connect your own home Ollama server (via LAN or Tailscale) or bring your own OpenRouter key.
• **Multi-Language Support**: Complete fluid responses in English, Spanish, French, German, Portuguese, Japanese, Chinese, and Hindi.

### Privacy & Data Transparency
• **Local Storage**: Your files and vaults remain stored locally on your device in the folders you authorize. Chats and notes are never stored on developer cloud servers. The only data stored by the developer is user-submitted issue reports sent via the in-app Report button (question, answer, chosen reason, optional note, and random install ID stored in Cloudflare D1 for developer review).
• **Prompt & Context Transmission**: When you chat or ask Robin to analyze a note, the prompt and relevant retrieved text excerpts are transmitted to your selected AI provider (e.g. OVHcloud, Kilo) to generate the answer.
• **Air-Gapped Mode**: For zero remote AI transmission, enable Air-Gapped mode with Home Ollama so queries execute entirely on your private local network with all cloud fallbacks strictly blocked.
• **Data Deletion**: Users may request deletion of submitted problem reports at any time by contacting aroundrobin@protonmail.com with the approximate date and wording.
• **Transparent Ads**: The free app is supported by standard non-intrusive banner ads.

---

## Visual Asset Specifications

### App Icon
- **File**: `store/icon-512.png` (512 × 512 px, 32-bit PNG)
- **Visual**: Minimalist golden feather & quill intertwined with Markdown syntax brackets (`[M↓]`) on a deep charcoal `#0b0f19` canvas.

### Feature Graphic
- **File**: `store/feature-graphic.png` (1024 × 500 px, PNG/JPEG, 16:9)
- **Headline**: "The Autonomous AI Agent for Your Notes"
- **Subhead**: "Live Web Research • Local Obsidian Vault • 100% Keyless"
- **Badge**: "No Account Required • Zero Subscriptions"

### Phone Screenshots (Storyboard Frames)
*Note: The included frames in `store/screenshot-*.png` (1080 × 1920) serve as high-fidelity visual storyboards and layout guides. Device captures from the running signed release candidate should be captured prior to final production track release.*
1. **Screen 1 — Autonomous Web Research**:
   - *Top Banner*: "AUTONOMOUS WEB RESEARCH WITH SOURCES"
   - *UI*: Chat view showing user prompt: *"Compare the latest camera specs of the S24 Ultra vs Pixel 9 Pro"*, showing Robin's multi-step progress badges (`🔎 searching`, `📄 reading 2 sources`) and clean cited answer.
2. **Screen 2 — Obsidian Vault & Local Markdown**:
   - *Top Banner*: "READS & WRITES YOUR OBSIDIAN VAULT"
   - *UI*: Robin answering from a personal note: *"Found in your [[Trip Plan 2026]] note..."* and saving an action item with `#todo` and `[[links]]` directly to the phone's storage.
3. **Screen 3 — Photo Vision & Document Reading**:
   - *Top Banner*: "PHOTO VISION & DOCUMENT ATTACHMENTS"
   - *UI*: Image attachment of a whiteboard diagram with Robin's structured Markdown breakdown.
4. **Screen 4 — Keyless Sovereignty & Model Picker**:
   - *Top Banner*: "ZERO SIGNUPS • CHOOSE YOUR ENGINE"
   - *UI*: Settings drawer showing the active model selector (GPT-OSS 120B, Qwen, Kilo Auto) and the one-tap Home Ollama tunnel switch.

---

## App Content Forms & Questionnaire Answers

**Privacy policy URL**: `https://robinthood-search.phone-liaison.workers.dev/privacy`  
(Served by the search worker from `search-worker/privacy.js`).

**Ads**: Yes, the app contains ads (Google Mobile Ads SDK).

**App access**: All functionality is available without special access (no login or credentials required).

**Target audience and content**: 18 and over (avoids Families policy restrictions; web search and open AI inference).

**Content rating (IARC questionnaire)**: Category "All other app types".
- Violence, sexuality, language, controlled substances, gambling: No.
- Users can interact or exchange content with each other: No.
- Shares the user's location with other users: No.
- Allows purchase of digital goods: **No** (digital purchases are not enabled in production build).
- Unrestricted internet access (web browser or search engine): **Yes** (autonomous web search and page reading).
- AI-generated content: Yes (chat-based, user reporting built-in).

**Data Safety Form Summary**:
- **Data Encrypted in Transit**: Yes (HTTPS for all remote models and search workers; optional home Ollama handles its own transport).
- **Deletion Request**: Yes. Users can request deletion of submitted problem reports by emailing aroundrobin@protonmail.com with the approximate date and wording (stored in Cloudflare D1 for quality reviews; no accounts or chat logs exist).

| Data type | Collected / shared | Purpose | Notes |
|---|---|---|---|
| Messages → Other in-app messages | Shared | App functionality | Prompts and retrieved note context are sent ephemerally to the selected AI service (OVHcloud, Kilo, or custom key). Not stored by developer. |
| Photos and videos → Photos | Shared | App functionality | Only photos the user attaches, sent to the AI service for vision processing. |
| Files and docs | Shared | App functionality | Only note text/files the user authorizes Robin to read as query context, sent ephemerally to the AI service. |
| App activity → User reports | Collected | Developer communications | When user taps Report: reply, question, reason, version, and random install ID stored in Cloudflare D1; deletable upon request. |
| Device or other IDs | Collected and shared | Advertising | Standard Google Mobile Ads SDK (advertising ID). |
| Location → Approximate | Collected and shared | Advertising | Google Mobile Ads SDK (inferred from IP). |
| App info and performance → Diagnostics | Collected and shared | Advertising, analytics | Google Mobile Ads SDK crash and diagnostic reports. |
