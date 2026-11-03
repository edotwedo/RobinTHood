// RobinTHood privacy policy, served at GET /privacy. Keep it in step with what the app
// does (privacy.js, report.js, AdBanner.js, store/listing.md Data safety).
export const POLICY_UPDATED = '2026-11-02';

export function privacyPage(contactEmail) {
  const contact = contactEmail
    ? `<a href="mailto:${contactEmail}">${contactEmail}</a>`
    : '<a href="https://github.com/edotwedo/RobinTHood/issues">github.com/edotwedo/RobinTHood/issues</a>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RobinTHood privacy policy</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; background: #0b0f19; color: #f3f4f6; }
  h1, h2 { line-height: 1.25; } h2 { margin-top: 32px; font-size: 1.15rem; }
  a { color: #60a5fa; } td, th { border: 1px solid #374151; padding: 6px 8px; vertical-align: top; text-align: left; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; } .muted { color: #9ca3af; }
</style></head><body>
<h1>RobinTHood privacy policy</h1>
<p class="muted">Last updated ${POLICY_UPDATED}. Applies to the RobinTHood app for Android (com.edotwedo.robinthood).</p>

<p>RobinTHood is a free AI chat app. There are no accounts. This page explains what leaves your
phone, where it goes and why. Questions: ${contact}.</p>

<h2>What stays on your phone</h2>
<p>Your chat history, settings, any keys you enter (such as an OpenRouter key) and a random
install ID are stored only on your phone. They are not backed up to Google by the app. Starting a
new chat or uninstalling the app deletes them.</p>

<h2>What goes to AI services</h2>
<p>RobinTHood orchestrates multiple AI models. To answer, it sends your message and the recent chat that goes
with it to the AI service in use, along with any photo or file you attach and any file you allow
Robin to read. Depending on the model, that is:</p>
<ul>
  <li><b>OVHcloud AI Endpoints</b> (France). OVHcloud states it does not store prompts or use them for training.</li>
  <li><b>Kilo AI gateway</b> free models (marked * in the app). Some of their partner providers may log or train on prompts.</li>
  <li><b>OpenRouter</b>, only if you enter your own key. Its handling depends on the model you choose.</li>
  <li><b>Your own Ollama server</b>, only if you set one up. It goes to your computer and nowhere else.</li>
</ul>
<p>Robin tells you before it switches from a model with no * to one marked *, and offers to mask
emails, phone numbers, card numbers and similar details first. We do not store your messages.</p>

<h2>Web search and page reading</h2>
<p>When Web is on, Robin's search service (run by us on Cloudflare) sends your search to Brave Search,
DuckDuckGo or Wikipedia and fetches the pages Robin reads. Search results and page text are cached for
up to an hour to save data. These requests carry a random install ID used only for rate limiting. If
our service is unavailable, the app may search DuckDuckGo or Wikipedia directly from your phone.</p>

<h2>Reports</h2>
<p>If you tap Report on an answer, we receive the answer, your question, the reason you chose, your
optional note, the app version and your random install ID. We use reports only to review problem
answers and improve the app. We keep them only as long as we need them for that. To have a report deleted, contact us
with the approximate date and wording.</p>

<h2>Ads</h2>
<p>The free version shows ads from Google AdMob. We request non-personalized ads. Google's ads SDK
collects device information such as the advertising ID, approximate location from your IP address,
and diagnostics, under <a href="https://policies.google.com/privacy">Google's privacy policy</a>. Where
the law requires it (for example in the EEA and UK), you are asked for consent first, and you can change
your choice in Settings, Ad privacy choices.</p>

<h2>What we don't do</h2>
<ul>
  <li>No accounts, no analytics of our own, no selling of data.</li>
  <li>We don't use your messages for advertising.</li>
</ul>

<h2>Security</h2>
<p>Everything RobinTHood sends travels over HTTPS, except to a Home Ollama server you configure
yourself with an http:// address.</p>

<h2>Children</h2>
<p>RobinTHood is meant for people 18 and over and is not directed at children.</p>

<h2>Changes</h2>
<p>We will update this page when the app's data handling changes, and change the date at the top.</p>
</body></html>`;
}
