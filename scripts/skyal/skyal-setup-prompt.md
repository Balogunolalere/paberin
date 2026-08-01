# Copy-paste prompt: apply the Paberin chat fixes to Skyal, build the Skyal dataset, test thoroughly

```
You are working on the Skyal Laser Services customer site at /home/doombuggy_/Projects/skyalproj
(Next.js SPA; chat API at src/app/api/chat/route.ts; chat UI at src/components/skyal/views/ChatView.tsx;
order form at src/components/skyal/views/OrderView.tsx; app shell at src/app/page.tsx).

The canonical reference for everything below is the PABERIN repo at /home/doombuggy_/Projects/paberin
(READ-ONLY reference — do not modify it): its src/lib/chat.ts, src/lib/chat-order.ts,
src/app/api/chat/route.tsx, src/app/chat/page.tsx, src/app/order/page.tsx, tests/unit/chat.test.ts,
tests/unit/chat-order.test.ts, tests/unit/chat-handler.test.ts, vitest.config.ts, and
scripts/build-chat-dataset.py. Read those files first and port the FIXES, not the code verbatim.

If your sandbox cannot write to /home/doombuggy_/Projects/skyalproj, stop and tell the user to add
allow_write = ["/home/doombuggy_/Projects/skyalproj"] under [sandbox] in ~/.reasonix/config.toml
(or open this session with skyalproj as the workspace root).

# 1. PORT THE CHAT FIXES

## 1a. New file: skyalproj/src/lib/chat.ts
Port Paberin's src/lib/chat.ts (same fixes, Skyal flavor):
- Types: ChatMessage, QuoteBreakdown (serviceLabel, serviceType, sla, leadTime, notes, basePrice,
  expressSurcharge, addOnsTotal, discount, deliveryFee, finalPriceNaira, quantity), ChatQuote, ChatResponse.
- parseEnvInt (strict /^\d+$/ validation, warn + fallback).
- RateLimiter class (per-key fixed window, pruning, reset()).
- retryWithBackoff(fn(remainingBudgetMs), {maxRetries, baseDelay, budgetMs, shouldRetry}) with
  per-attempt budget checks.
- generateSessionId() using crypto.randomUUID, prefix "skyal_".
- parseQuoteBlock: lenient JSON (strip ```json fences, trailing commas, string numbers), numeric
  cross-check (recompute total from components when >10% off, except when express is folded into
  unit_price), expose serviceType/sla/leadTime/notes in breakdown.
- extractPriceFromText: naira-context ONLY (₦/NGN/N prefix with no 'i' flag, or "naira"/"NGN"/"N"
  suffix, ₦20K shorthand) — phone numbers must never match.
- extractQuote, cleanAssistantText (strip [QUOTE] + fenced JSON leftovers).
- isInjectionAttempt: HARD patterns (^system:, ^[system], "ignore … instructions", "override your …")
  flagged at ANY length; SOFT patterns ("you are now ", "forget everything") only <200 chars.
- sanitizeHistory: only role user|assistant, non-empty, cap 50 turns / 4000 chars each.

## 1b. Rewrite skyalproj/src/app/api/chat/route.ts
Keep: SKYAL_SYSTEM_PROMPT const (update its [QUOTE] template to add "add_ons_total", "discount",
"original_price", and an instruction: never wrap the JSON in markdown code fences, no trailing commas),
the local 60s response cache, the dual input formats (message+history OR messages array), and the
response shape { reply, assistant_text, quote, render_order_now, sessionId, error?, cached? }.
Fix:
- Config via parseEnvInt: FETCH_TIMEOUT (20000), MAX_RETRIES (2), RETRY_BASE_DELAY (1000),
  TOTAL_TIMEOUT (45000), RATE_LIMIT_MAX (15), RATE_LIMIT_WINDOW (60000).
- Runtime: keep "nodejs" (it already is) and ADD `export const maxDuration = 60;` — without it,
  slow Agnes calls get killed by the platform as HTTP 504 (Edge functions cap at ~30s and cannot
  be raised; Node + maxDuration solves it. On Vercel Pro you can raise maxDuration to 300).
- Add a short in-memory response cache (TTL 60s, cap ~100) keyed on the Agnes messages, so a
  retry of the same question after a timeout returns instantly instead of 504-ing again.
- Prompt-injection scan on message AND sanitized history (isInjectionAttempt); reject 400.
- Rate limiting via the RateLimiter class keyed on the LAST x-forwarded-for entry (split(',').pop()).
- Replace the single AbortController call with retryWithBackoff: each attempt gets a FRESH
  AbortController + timeout = min(FETCH_TIMEOUT, remainingBudgetMs) (floor 500ms); retry only on
  transient errors (network TypeError, AbortError/TimeoutError, HTTP 408/429/5xx); map 401/403 and
  other 4xx to immediate throw. max_tokens 2048 → 4096.
- Sanitize history with sanitizeHistory; validate incoming sessionId (string, ≤128 chars).
- Use generateSessionId() from the lib.
- Error mapping: timeout → "Taking longer than usual. Please try again." (504); auth/server →
  "Couldn't process that…" (500); keep AggregateError AbortError handling.
- Use extractQuote + cleanAssistantText from the lib (replaces local parseQuote/cleanText).
- Quote in the response must include breakdown.serviceType/sla/leadTime/notes (already provided by
  parseQuoteBlock).
- Keep the fire-and-forget saveToAdmin (AbortController + 5s timeout instead of AbortSignal.timeout
  if you prefer; it's fine either way).

## 1c. New file: skyalproj/src/lib/chat-order.ts
Port Paberin's src/lib/chat-order.ts: matchChatQuoteToService (exact serviceType → exact label →
category keyword detection → fuzzy token overlap; per-category refinement: fabric/garment keywords →
fabric service, topper → custom/mirror/wood/acrylic topper, engraving → engraving, sticks → stick
cutting, sheet/signage → sheet or signage, tags/labels/cards → printed tag/card) + buildChatOrderNotes
(customer request + summary + SLA + lead time + notes). Use the types from src/lib/chat.ts.

## 1d. ChatView (src/components/skyal/views/ChatView.tsx)
- Add a client-side timeout to the fetch (AbortSignal.timeout(90_000)) and map timeout errors to a
  friendly message ("The assistant is taking too long…").
- Track the last customer query and pass it along with the quote to onOrderWithQuote as
  { price, summary, breakdown, context: lastUserQuery }.
- History already excludes error messages — keep that.

## 1e. App shell (src/app/page.tsx)
Extend the chatQuote state type with context?: string and thread it through navigateToOrderWithQuote.

## 1f. OrderView (src/components/skyal/views/OrderView.tsx)
Replace the inline prefill effect with matchChatQuoteToService + buildChatOrderNotes:
- ALWAYS select a service when a match/fallback exists (setServiceType) and jump to step 1 (details),
  even when the AI item has no exact template ("Full Buba" → Fabric Laser Cutting etc.).
- Prefill qty, sla (breakdown.sla === 'Express'), delivery ('lagos' when deliveryFee > 0), notes
  (customer request context + AI summary + SLA + lead time + notes).
- Show a small notice when the AI label was mapped to a different catalog service
  ('From your chat: "X" — mapped to "Y" (closest available service). You can change it below.')
  and clear it when the user picks a service manually.

# 2. TESTS (all must pass)
- vitest.config.ts: add the '@' alias -> ./src (it is currently missing; tests use '@/…' imports).
- Port Paberin's tests, adapted to Skyal:
  - tests/unit/chat.test.ts — parseQuoteBlock (fences, trailing commas, string numbers, recompute,
    express-folded, new breakdown fields), extractPriceFromText (naira-context, phone numbers never
    match, ₦20K), cleanAssistantText, generateSessionId format ^skyal_, isInjectionAttempt (padded
    bypass caught), sanitizeHistory, RateLimiter, retryWithBackoff, parseEnvInt.
  - tests/unit/chat-order.test.ts — fixture the REAL SKYAL catalog (fetch it once from
    https://skyalxpaberin-admin.vercel.app/api/services?brand=SKYAL — 31 services: fabric_sleeves,
    fabric_buba, fabric_wrapper, engraving_phone, acrylic_stick_cutting, skyal_topper_acrylic,
    skyal_topper_custom, sheet_cutting_inhouse, sheet_cutting_8x4, metal_cutting_external, …) and
    test exact-type matches (fabric_buba → fabric_buba), category fallbacks, no-match → null, notes.
  - tests/unit/chat-handler.test.ts — fetch-mocked POST handler: 400s (empty, injection via history),
    happy path with [QUOTE] (assert quote.breakdown.serviceType/sla), retry on 5xx/429, no retry on
    401, timeout retry then give up. Existing tests/api-chat.integration.test.ts must keep passing.
- Run: vitest run, tsc --noEmit, next lint, next build. Fix everything until green.

# 3. BUILD THE SKYAL DATASET (use the Paberin repo's tooling, READ-ONLY except its scripts/data dir
#    and tests/datasets — those are gitignored, writes there are fine)
- The 63 per-chat WhatsApp zips are already extracted at:
  /home/doombuggy_/Projects/paberin/scripts/data/skyal_zips/Skyal Laser WhatsApp Chat History /
  (from "/home/doombuggy_/Downloads/Skyal Laser WhatsApp Chat History -20260731T020121Z-1-001.zip").
  If missing, re-extract that zip.
- Parameterize /home/doombuggy_/Projects/paberin/scripts/build-chat-dataset.py with BRAND=skyal:
  - BRAND env: 'paberin' (default) | 'skyal'. For skyal: zips dir default = the extracted folder
    above; chats dir = scripts/data/chats_skyal; checkpoints = skyal_pass1.jsonl / skyal_pass2.jsonl;
    outputs = tests/datasets/skyal_chat_eval_dataset.json + skyal_chat_analyses.json.
  - PASS1 system prompt: Skyal version (Skyal Laser Services, Ogba Ikeja Lagos; fabric cutting incl.
    buba/wrapper/sleeves/boubou, engraving incl. phone/jewelry/leather/wood/badges/necklace, sheet
    cutting incl. 4×4/8×4/custom, acrylic sticks, cake toppers & signage, metal cutting via external
    partner; same [SHOP]/[CUST] transcript tags, same JSON schema).
  - PASS2: extract SKYAL_SYSTEM_PROMPT from skyalproj/src/app/api/chat/route.ts (regex the template
    literal) instead of PABERIN_SYSTEM_PROMPT.
  - Keep all reliability mechanics: perturbed retries (server caches empty responses per exact
    prompt), truncation salvage parser, SEGMENT_CHARS ~6000, CONCURRENCY ~6-14, 429 backoff,
    checkpoint resume, MAX_ATTEMPTS.
- Run: BRAND=skyal python3 scripts/build-chat-dataset.py (PASS 1 first; PASS 2 + finalize after).
  Monitor via tests/datasets/checkpoints/skyal_pass1.jsonl. This takes many hours — run in background,
  resumable.
- Sanity-check the final dataset (intent/expected_behavior distributions, media markers cleaned,
  sample inquiries verbatim).

# 4. LIVE VERIFICATION (thorough)
- Start the Skyal dev server (next dev -p 3000) in skyalproj. If node's global fetch cannot reach
  external hosts in this sandbox (undici issue), preload the dev patch:
  NODE_OPTIONS="--require /home/doombuggy_/Projects/paberin/scripts/dev-fetch-patch.cjs" (dev-only).
- Chat: POST /api/chat with "I need 3 full bubas for my wedding, express, delivery to Lekki" and
  assert the quote has breakdown.serviceType ('fabric_buba'), sla 'Express', quantity 3, leadTime,
  deliveryFee. Also test a vague query (no quote), an injection attempt via history (400), and a
  phone-number-only message (no garbage quote).
- Handoff: simulate the OrderView prefill with the real SKYAL catalog (fetch
  /api/services?brand=SKYAL from the admin) using matchChatQuoteToService + buildChatOrderNotes:
  assert service mapped, qty/sla/delivery/notes prefilled.
- Report the results.

# 5. DELIVERABLES
Summary of: files changed, test counts (vitest/tsc/lint/build), dataset stats (segments ok,
inquiries, intent distribution), live-verification results, and any failures with reasons.
```

## Quick reference facts (for the prompt's agent)

- **SKYAL catalog (admin, 31 services):** `fabric_*` (sleeves, buba, wrapper, skirt, boubou,
  blouse+skirt, buba+wrapper, per yard, custom, complex gown), `engraving_*` (phone, jewelry, leather,
  wood, small item, curved, detective badge, necklace), `sheet_cutting_inhouse/oversize/8x4/custom`,
  `acrylic_stick_cutting`, `metal_engraving_inhouse`, `metal_cutting_external`,
  `skyal_topper_acrylic`, `skyal_topper_custom`, `stoning_board`.
- The AI prompt's `service_type` keys align with catalog types (e.g. `fabric_buba`), so exact-type
  matching handles most Skyal quotes; category fallback covers the rest.
- Skyal chat response shape: `{ reply, assistant_text, quote, render_order_now, sessionId, error?,
  cached? }` — keep it; ChatView reads `assistant_text || reply`.
- Existing skyalproj tests: `tests/setup.ts` (mocks next/server + env), `tests/api-chat.integration.test.ts`.
- Pipeline reliability lessons (Agnes API): identical retries hit a server-side empty-response cache —
  ALWAYS perturb the prompt on retry; outputs truncate at ~6K tokens (finish_reason=length, sometimes
  empty content) — keep segments ≤ ~6000 chars and salvage complete JSON objects from truncated output;
  429s need jittered backoff (5s/10s/20s).
