# RobinTHood: Play Console copy and answers

Paste-ready text for the Play Console, plus suggested answers to its forms. The answers
describe what the code does as of 0.8.2. Check each one against the form's wording when you
fill it in, because Google rewords these forms now and then.

## Store listing

**App name** (30 max)
RobinTHood: Free AI Chat

**Short description** (80 max)
Free AI chat with web search and photo reading. No account, no subscription.

**Full description** (4000 max)

RobinTHood is a free AI assistant. There is no account to make and no subscription to buy.

Ask it anything. When the question needs current information, like news, prices, opening
hours or "what's on this weekend", Robin searches the web itself, reads the pages, and
tells you which sites it used.

What it can do
• Answer questions and help with writing, homework, ideas and code
• Search the web and read pages for current, checkable answers, with the sources listed
• Read a photo or screenshot you attach and tell you what's in it
• Read a text file you attach (notes, CSV, code) and work with it
• Save notes and files to a folder you choose on your phone
• Reply in English, Spanish, French, German, Portuguese, Japanese, Chinese or Hindi

How it's free
Robin has no AI of its own. It uses free AI services and moves between them when one is
busy. You can pick the model yourself. A * next to a model means that service may keep the
messages sent to it. Robin tells you before it switches to one of those, and offers to
mask things like emails, phone numbers and card numbers first.

Your chats stay on your phone. Each message goes to the AI service you're using so it can
answer. The free version shows ads.

Built-in safety
• After Robin reads web pages, it asks before it opens a link you haven't seen, or reads
  or saves your files, because a page can try to trick it.
• Every answer has a Report button. Reports go to the developer for review.

**App category:** Productivity
**Tags:** AI assistant, chat, search

**Contact email:** aroundrobin@protonmail.com
**Privacy policy URL:** https://robinthood-search.phone-liaison.workers.dev/privacy
(Served by the search worker from `search-worker/privacy.js`; the contact address comes from
`CONTACT_EMAIL` in `search-worker/wrangler.toml`. The old phil-projects link was a 404.)

**Graphics** (in this folder)
- App icon: `icon-512.png` (512×512)
- Feature graphic: `feature-graphic.png` (1024×500)
- Phone screenshots: `screenshots/` (at least 2; 2:1 or less)

## App content forms

**Privacy policy:** the URL above.

**Ads:** Yes, the app contains ads.

**App access:** All functionality is available without special access (no login).

**Target audience and content:** 18 and over. This keeps it out of the Families policy;
unfiltered web search and AI chat aren't suited to children.

**Content rating (IARC questionnaire):** category "All other app types".
- Violence, sexuality, language, controlled substances, gambling: No (the app doesn't contain any itself).
- Users can interact or exchange content with each other: No (there's no contact between users).
- Shares the user's location with other users: No.
- Allows purchase of digital goods: No.
- Unrestricted internet access (web browser or search engine): **Yes** (web search and page reading).
- AI-generated content: Yes. It's chat-based, and users can report replies in the app.
Expect a Teen or similar rating.

**Data safety**
- Is all user data encrypted in transit? Yes (HTTPS). The one exception is a Home Ollama
  server the user sets up themselves over http://, which is their own machine.
- Can users ask for their data to be deleted? Nothing is held on a server except reports,
  and there are no accounts. Answer "No" unless you add a way to delete reports.

| Data type | Collected / shared | Purpose | Notes |
|---|---|---|---|
| Messages → Other in-app messages | Shared | App functionality | Each message, and recent chat, goes to the AI service in use (OVHcloud, Kilo, or the user's own key). Not stored by the developer. Required. |
| Photos and videos → Photos | Shared | App functionality | Only photos the user attaches, sent to the AI service. Optional. |
| Files and docs | Shared | App functionality | Only files the user attaches or lets Robin read. Optional. |
| App activity → Other user-generated content | Collected | Developer communications | Reports: the reply, the question, the reason, an optional note, the app version and a random install ID. Stored by the developer. Optional. |
| Device or other IDs | Collected and shared | Advertising | By the Google Mobile Ads SDK (advertising ID). |
| Location → Approximate | Collected and shared | Advertising | By the Google Mobile Ads SDK (from IP). |
| App info and performance → Diagnostics | Collected and shared | Advertising, analytics | By the Google Mobile Ads SDK. |

Web searches: Robin's search worker sends the query to Brave, DuckDuckGo or Wikipedia, and
pages are fetched by the worker. The query text is the user's message, so it's covered by
the "Messages" row.

**Government app / financial features / health:** No.

**News app:** No.

## Closed test (14-day requirement)

1. Testing → Closed testing → Create track. Add testers as an email list or a Google Group.
   You need at least 12 who opt in and stay opted in for 14 days in a row. Aim for 15–20.
2. Upload `RobinTHood-play.aab` from the latest CI run (it's signed with the upload key now).
   On first upload, choose Play App Signing (Google holds the app key; you keep the upload key).
3. Share the opt-in link. Testers must open it, tap "Become a tester", then install from the
   Play Store. Sideloaded APKs don't count.
4. Ship an update or two during the 14 days, and keep notes of tester feedback. The
   production-access form asks what testing found and what you changed.
5. Day 1 of the test: deploy the reports worker (testers will be on the signed-report build).
