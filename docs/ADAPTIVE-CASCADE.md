# Free-service switching (desktop 0.3.1 preview)

The first bounded live run returned 64 completed answers from 67 root requests.
Three root requests were cancelled by the test's first-refusal safety stop. There
were 73 individual provider attempts, including six fallback transitions. The
observed 429 was OVH `gpt-oss-120b`, with `Retry-After: 25`; it did not prove that
the whole cascade was exhausted. Evidence remains in Phil's local
`C:\Users\mrmar\robin-tapout\runs\20261026T050613Z-95b3f5\events.jsonl`.

## Changes

- Automatic requests rotate their starting route among the four established
  models and prefer a host with less in-flight work. At most two native provider
  requests run concurrently per application process.
- HTTP errors retain their status and Retry-After date/delta. Shared or unknown
  429s cool down the whole host. Explicit structured gateway messages identifying
  one model as temporarily rate-limited upstream cool down that model only.
  Auth/payment refusal cools down the host; a missing model disables that model.
  Timeouts and other failures temporarily cool down the attempted model.
- Kilo's documented 200-free-requests/hour/IP budget is tracked across all Kilo
  model names in this process. Cooldowns and counters are in memory; another app,
  another Robin process, or a restart is not covered by this local counter. The
  provider's actual quota remains authoritative. No IP/key/VPN rotation or limit
  reset is implemented.
- A response has 15 seconds to establish headers, up to 30 seconds without text
  progress, and at most 90 seconds overall. A healthy stream is no longer killed
  merely because its full answer lasts over 15 seconds. The workspace retains
  its existing three-minute overall request cancellation.
- Abrupt EOF, token-limit truncation, malformed frames and in-stream errors are
  failures. Their incomplete output cannot replace a saved document. Automatic
  fallback buffers attempts and publishes only a completed successful answer,
  preventing mixed fragments from different providers.
- When native routes are cooling down, an installed Mega Zword can try explicitly
  selected Groq, Cloudflare, Gemini API and NVIDIA Lightning routes with
  `--free-only`. The explicit target prevents its automatic router from retrying
  a cooling Kilo/OVH service. These optional routes require the user's own existing
  CLI/provider configuration. No keys are bundled or accounts created. A standalone
  copy without Mega Zword continues using the native keyless routes.
- If nothing answers, Robin retains the prompt and document and gives a retry
  time based on the earliest native cooldown. That time indicates native-route
  eligibility, not a guarantee a provider will answer.

## Additional-source investigation, 2026-10-26 UTC

The installed provider-directory tool returned OpenRouter as a candidate. No
service was provisioned. Current official docs and the live Kilo model catalogue
were then checked. Two tiny synthetic requests tested candidate Kilo models; the
probe stopped immediately at the first refusal. Raw observations:
[adaptive-source-probe.json](adaptive-source-probe.json).

| Candidate | Finding | Included automatically? |
|---|---|---|
| Kilo Nemotron 3.5 Lightning (`nvidia/nemotron-3.5-lightning:free`) | Live catalogue marked free, zero-priced. Keyless probe returned `READY` in 3.782 s. | Yes, fifth fallback route. Shares Kilo quota. |
| Kilo Laguna XS (`poolside/laguna-xs-2.1:free`) | Catalogue marked free, but first probe returned upstream 429. | No. Available only as a named diagnostic target, not a default fallback. |
| OpenRouter | API completion endpoints require a key. | No new native integration or account. Existing optional CLI route is separate. |
| Pollinations | Current official integration docs require an API key. | No anonymous endpoint added. |
| Puter | Developer-free uses the user's account/allowance; users pay for overage. | Not treated as unlimited, anonymous free inference. |

Adding model names behind Kilo does **not** add independent free quota. A third
independent keyless provider has not been verified here. An optional user-owned
free-provider account or an installed local model can diversify capacity without
embedding Phil's credentials in other people's apps.

Primary sources:

- [Kilo authentication and anonymous access](https://kilo.ai/docs/gateway/authentication)
- [Kilo shared free-model quota](https://kilo.ai/docs/gateway/usage-and-billing)
- [Live Kilo model catalogue](https://ai-gateway.kilo.ai/api/v1/models)
- [OpenRouter API authentication support](https://openrouter.ai/support/)
- [Pollinations integration documentation](https://pollinations.ai/docs)
- [Puter's user-pays pricing](https://developer.puter.com/pricing/)

## Validation

`dotnet run --project tests/RoutingChecks/RoutingChecks.csproj -c Release`
exercises cooldown scope/expiry, earliest retry, no calls during cooldown,
auth/missing-model distinctions, load distribution, two-call concurrency, shared
hourly budget/refill, cancellation, safe CLI target/argument construction, typed
HTTP/SSE errors, partial/truncated/malformed response rejection, and an actual
16.5-second loopback stream. These checks make no external provider calls.

The existing 28 workspace checks cover local-only gating, document persistence,
versions, errors, cancellation, onboarding and shortcut behavior. The bounded
test harness under `robin-tapout` was updated to compile the new routing policy;
its three offline safety/rotation fixtures pass separately.

No new load soak was run after the source probe's refusal. Optional independent
CLI routes were checked structurally, not called live in this change. A higher
end-to-end completion rate is not yet established. Public downloads remain
unchanged pending independent review.
