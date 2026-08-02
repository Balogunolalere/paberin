# Skyal Frontend Port Prompt — Order & Pricing Redesign (align with Paberin)

*Paste everything below this line into a new AI session.*

---

You are porting the Paberin order & pricing redesign to the **Skyal customer frontend** at
`/home/doombuggy_/Projects/skyalproj`. Skyal shares the SAME admin backend as Paberin, so the
admin API contracts are already defined — your job is to make the Skyal frontend use them
exactly like the (already-shipped) Paberin frontend does, adapted to SKYAL branding and
Skyal's catalog.

## Repos

- SKYAL FRONTEND (where you implement): `/home/doombuggy_/Projects/skyalproj`
- ADMIN (shared backend — ALREADY UPDATED AND PUSHED, do not re-apply anything): `/home/doombuggy_/Downloads/fixed-code(3)`
- PABERIN FRONTEND (read-only reference — do NOT modify): `/home/doombuggy_/Projects/paberin`

STATUS: the admin backend already has ALL changes applied and pushed (schema, seed,
pricing engine, rule lookup, quotes, provisional orders, inventory, trust fixes). The API
contracts below are LIVE. Your job is ONLY the Skyal frontend port. The reference patch
still exists at `/home/doombuggy_/Projects/paberin/admin-changes.patch` if you need to
inspect exact admin behaviour, but do NOT re-apply it.

## Sources of truth (read these FIRST)

1. `/home/doombuggy_/Projects/paberin/docs/order-and-pricing-redesign-spec.md` — the design
   (§1–§11) + implementation status (§12) + customer-style test notes (§12.1).
2. Paberin reference implementation — mirror these files exactly, then adapt brand/catalog:
   - `/home/doombuggy_/Projects/paberin/src/lib/chat.ts` — `[SPECS]` parsing
     (`parseSpecsBlock`, `cleanAssistantText`), new `PABERIN_SYSTEM_PROMPT` (no prices),
     `ChatSpecs` type; KEEP the existing RateLimiter/retry/injection/sanitize helpers.
   - `/home/doombuggy_/Projects/paberin/src/app/api/chat/route.tsx` — engine pricing flow:
     parse `[SPECS]` → call admin `POST /api/services/quote` → append the "💰 Your price"
     line → `render_order_now`; no catalog match → `custom` field; saved-quote banner via
     `GET /api/quotes?phone=` (first turn only).
   - `/home/doombuggy_/Projects/paberin/src/lib/chat-order.ts` — specs→notes builder
     (`buildChatOrderNotes(ChatSpecs, context)`); the fuzzy matcher was DELETED.
   - `/home/doombuggy_/Projects/paberin/src/app/order/page.tsx` — `?specs=` prefill, custom
     mode ("Something else" card + description/material/dimensions), SLA disabled when
     `allowExpress === false`, availability line, QUOTING success state, `customSpec` order
     submission.
   - `/home/doombuggy_/Projects/paberin/src/app/chat/page.tsx` — custom-order button +
     saved-quotes banner rendering.
   - `/home/doombuggy_/Projects/paberin/src/app/calculator/page.tsx` — "Request a custom
     quote" link.
   - `/home/doombuggy_/Projects/paberin/src/app/dashboard/page.tsx` — Saved Quotes section
     (list + Accept & Pay), Pay-now for PAYMENT_PENDING orders, QUOTING banner.
   - `/home/doombuggy_/Projects/paberin/src/lib/api.ts` — `getOpenQuotes`, `acceptQuote`,
     `getOrdersByPhone` sends `brand`, admin OrderState vocabulary.
   - `/home/doombuggy_/Projects/paberin/src/components/AvailabilityLine.tsx` — availability UI.
3. Skyal's current files to modify (read them fully before editing):
   - `src/app/api/chat/route.ts` — has `SKYAL_SYSTEM_PROMPT` with `[QUOTE]` + prices and
     calls `extractQuote` — the OLD flow.
   - `src/lib/chat.ts` — old `parseQuoteBlock`/`extractPriceFromText`/`extractQuote`/`cleanAssistantText`.
   - `src/lib/chat-order.ts` — old fuzzy `matchChatQuoteToService` + `buildChatOrderNotes`.
   - `src/components/skyal/views/ChatView.tsx`, `OrderView.tsx`, `CalculatorView.tsx`,
     `DashboardView.tsx`, `LoginView.tsx`, `TrackView.tsx`.
   - `src/app/page.tsx` — SPA wiring: `chatQuote` state + `onOrderWithQuote` handoff between
     ChatView and OrderView (replace with a specs-based handoff + custom flag).
   - `src/app/order/complete/page.tsx` + `src/app/order/callback/page.tsx` — payment
     completion; they read `customerEmail`/`customerPhone` from the tracking response, which
     the admin NO LONGER returns — the code already falls back to '—', so keep it working
     (see Brand adaptations).
   - `src/components/skyal/data.ts` — marketing content + `TRACK_STATES` (already uses the
     correct admin states) + static `ORDER_SERVICES` (used only by marketing copy — the
     calculator itself is admin-backed; verify).
   - `scripts/build-chat-dataset.py` — update the PASS2 ideal-response prose for the
     no-pricing `[SPECS]` contract (it loads the prompt live from `src/lib/chat.ts`).
   - `tests/unit/chat.test.ts`, `tests/unit/chat-order.test.ts`,
     `tests/unit/chat-handler.test.ts`, `tests/api-chat.integration.test.ts` — update for the
     new contract (see Tests).

## Skyal brand adaptations (critical — do NOT copy Paberin's brand strings)

- Brand param on every admin call: `brand: "SKYAL"` (services, quote, orders, magic-link).
- `magic-link` body: `{ phone, brand: 'SKYAL' }` (LoginView + DashboardView both currently
  send only `{ phone }` — add the brand so a SKYAL customer never sees PABERIN orders).
- SKYAL service type keys (from the admin seed — the `[SPECS]` prompt and the order form
  must reference these): fabric: `fabric_sleeves, fabric_buba, fabric_buba_layer,
  fabric_wrapper, fabric_skirt, fabric_blouse_skirt, fabric_buba_wrapper, fabric_boubou,
  fabric_sleeves_wrapper, fabric_sleeves_buba, fabric_per_yard, fabric_custom,
  fabric_complex_gown`; engraving: `engraving_phone, engraving_jewelry, engraving_leather,
  engraving_wood, engraving_small_item, engraving_curved, engraving_detective_badge,
  engraving_necklace, metal_engraving_inhouse`; sheets: `sheet_cutting_inhouse,
  sheet_cutting_oversize, sheet_cutting_8x4, sheet_cutting_custom`; sticks:
  `acrylic_stick_cutting`; metal cutting: `metal_cutting_external`; toppers:
  `skyal_topper_acrylic, skyal_topper_custom`; add-on: `stoning_board`.
- The `[SPECS]` prompt contract is identical to Paberin's, but the `service_type` list in
  the prompt must be the SKYAL keys above, and the "what we do" categories must include
  Skyal's metal work (metal cutting is external-partner, 10 working days, no express).
- System prompt: Skyal version — same rules (never price, extract `[SPECS]`, ask clarifying
  questions, pidgin/Nigerian context), NO price tables anywhere.
- Payment: keep `brand: "SKYAL"` on initialize; callbackUrl = `${NEXT_PUBLIC_APP_URL}/order/complete?order=...`.
  Skyal's `.env` already has its own `PAYSTACK_SECRET_KEY` (the admin picks the SKYAL key).
- Chat session persistence stays `POST /api/skyal/chat` with `brand: 'skyal'`.
- complete/callback pages: the tracking endpoint no longer returns `customerEmail` /
  `customerPhone` / `trackingPin`. The receipt already falls back to '—'; optionally keep the
  customer's email/phone from `localStorage['skyal_customer']` for the receipt. Do NOT
  re-add PII to the tracking endpoint.
- Quotes are brand-agnostic on the admin (`GET /api/quotes?phone=` returns OPEN snapshots for
  the phone; the Quote row carries the brand) — no brand param needed.

## What to implement (per Skyal file)

1. `src/lib/chat.ts` — replace the quote-parsing section with the `[SPECS]` machinery
   ported from Paberin's `src/lib/chat.ts` (`ChatSpecs`, `parseLenientJson`, `parseSpecsBlock`,
   `cleanAssistantText` stripping `[SPECS]`). DELETE `parseQuoteBlock`, `extractPriceFromText`,
   `extractQuote`, `QUOTE_REGEX`. Keep `parseEnvInt`, `RateLimiter`, `retryWithBackoff`,
   `generateSessionId` (skyal_ prefix), `isInjectionAttempt`, `sanitizeHistory`. Export the
   `[SPECS]`-contract `SKYAL_SYSTEM_PROMPT` (or move it into the route as today — keep
   wherever the current file has it, but rewrite its content; ensure it lives where the tests
   import it from).
2. `src/app/api/chat/route.ts` — after the Agnes call: `parseSpecsBlock` → if
   `service_type`, call the admin engine `POST {ADMIN_API_URL}/api/services/quote` with
   `{brand:'SKYAL', serviceType, quantity, sla, deliveryMethod, deliveryAddress,
   customerPhone}` (reuse the existing retry/backoff helper; add a fresh AbortController per
   attempt) → append `\n\n💰 Your price: ₦X · breakdown …` from the ENGINE response →
   `render_order_now: true`; if no catalog match → return `custom: { description, material,
   quantity, sla }`; if `customerPhone` present and no history → fetch
   `GET /api/quotes?phone=` and return `openQuotes`. Update the response types
   (`ChatResponse` gains `custom` and `openQuotes`). Remove `extractQuote` usage.
3. `src/lib/chat-order.ts` — replace `matchChatQuoteToService` + category machinery with a
   specs-based `buildChatOrderNotes(specs, context)` (ported from Paberin). Update the
   `ChatQuote`-typed handoff in the views accordingly.
4. `src/components/skyal/views/ChatView.tsx` — render the engine quote card (label
   "Confirmed Price"), a "Place Custom Order" button when the message has `custom`, and a
   saved-quotes banner when `openQuotes` is present (links to the dashboard). Change the
   handoff callback to pass SPECS (service_type/quantity/sla) or a custom flag, not a
   `[QUOTE]` object.
5. `src/app/page.tsx` — replace the `chatQuote` state with a `chatSpecs` (or handoff)
   state: `{ specs?: ChatSpecs, custom?: boolean, context?: string }`; pass it to OrderView;
   keep `onOrderWithQuote`/add `onOrderCustom` from ChatView.
6. `src/components/skyal/views/OrderView.tsx` —
   - Replace the `matchChatQuoteToService` prefill with an EXACT specs prefill
     (service_type → service by type; quantity/sla/delivery from specs; notes via
     `buildChatOrderNotes`).
   - Add custom mode: a "Something else / custom job" card at the end of the service list →
     description/material/dimensions fields → submit `{ customSpec: { description, material,
     dimensions }, quantity, sla, ... }` to `POST /api/orders` (brand SKYAL).
   - Disable the Express toggle when `allowExpress === false`.
   - Show the availability line from the quote response (`availability` is now returned by
     the quote endpoint).
   - Success state: when `order.state === 'QUOTING'`, show "Awaiting pricing — we'll confirm
     the exact price, then just pay" and SKIP the Paystack redirect; otherwise pay as today.
   - Read `quoteId`/`quoteNumber` from the quote response if useful for the Saved Quotes UX.
7. `src/components/skyal/views/CalculatorView.tsx` — add "Can't find your job? Request a
   custom quote" linking to the order view in custom mode (e.g. `onNavigate("order", { custom: true })`
   or a prop the OrderView reads).
8. `src/components/skyal/views/DashboardView.tsx` —
   - `magic-link` body gains `brand: 'SKYAL'`.
   - Add a "Your Saved Quotes" section (fetch `GET /api/quotes?phone=`, Accept & Pay via
     `POST /api/quotes/:id/accept` then the existing Paystack init on the returned order).
   - Add a "Pay ₦X" button in the order detail for `PAYMENT_PENDING` orders (reuse the
     initialize + redirect flow).
   - QUOTING orders: banner "Awaiting pricing… you'll be able to pay here shortly" (the
     status label/color for QUOTING already exists in this view).
9. `src/components/skyal/views/LoginView.tsx` — `magic-link` body gains `brand: 'SKYAL'`.
10. `src/components/skyal/views/TrackView.tsx` — verify it uses the admin states (it does via
    `TRACK_STATES`) and does NOT display a tracking PIN (the endpoint no longer returns it).
    No change expected beyond confirming.
11. `scripts/build-chat-dataset.py` — update the PASS2 ideal-response prompt prose: the
    assistant NEVER prices, extracts `[SPECS]`, engine shows prices (mirror Paberin's update).
12. Tests —
    - `tests/unit/chat.test.ts`: replace `parseQuoteBlock`/`extractPriceFromText`/
      `extractQuote` suites with `parseSpecsBlock` + `cleanAssistantText` suites + prompt
      contract tests (no price tables; `[SPECS]`; no price in block).
    - `tests/unit/chat-order.test.ts`: test `buildChatOrderNotes` with `ChatSpecs`.
    - `tests/unit/chat-handler.test.ts` + `tests/api-chat.integration.test.ts`: mock Agnes to
      return `[SPECS]` blocks and mock the admin quote endpoint (`/api/services/quote`) with
      `{ data: { quoteNaira, breakdown: {...} } }`; assert engine price + `render_order_now`,
      custom flag, injection 400, retry behavior.

## What was already tested here (admin) — the Skyal port must not regress it

The Paberin implementation was exercised end-to-end with a customer-style test run (full
results in `/home/doombuggy_/Projects/paberin/docs/order-and-pricing-redesign-spec.md` §12.1),
against a local production build with a live Agnes model and Paystack test API. The checks
that PASSED on the admin:

- Calculator/quote → price snapshot → order → Paystack init → track (PII hidden: no
  customerEmail/customerPhone/trackingPin in the tracking response).
- Rule lookup: jeans → `fabric_custom` ₦20k; wood tray → `engraving_wood` ₦7.5k; sign board
  → signage; cake topper → topper; 4×4 sheet → sheet cutting.
- No-rule jobs (chandelier / music box / silver platter) → order in `QUOTING` + `needs_pricing`
  entry in the admin notification feed.
- Admin one-click Approve & Price (`PATCH /api/admin/orders/:id {action:'price', totalAmount}`)
  → `PAYMENT_PENDING`, then customer can pay.
- Saved quote accept at the SNAPSHOT price; double-accept → 409; accept with wrong phone → 403.
- Referral discount (₦5k) and first-time discount applied correctly, never stacked;
  non-first-time customers pay full price.
- Out-of-stock surfaced as `availability: {status:'OUT_OF_STOCK'}` but the order is still
  accepted.
- Modify re-prices through the engine (delivery fee NOT scaled per unit); modifying a
  PAID order is blocked with a clear 409.
- Ownership guards: cancel/modify without or with wrong `customerPhone` → 403; escalation
  with wrong phone → 403; cross-brand tracking → 404; Express on a non-express service is
  stored as STANDARD.
- Chat (live model): "2 full bubas" → engine price `💰 Your price: 2 × Full Buba · ₦70,000`;
  bespoke job → `custom` flag + "Place custom order"; prompt-injection attempt → 400.

Bugs found by that run and FIXED in the admin (do not reintroduce them in the port):

1. The admin rule table originally matched bare words "cut" and "sign" — "re-cut a
   chandelier" got priced as sheet cutting and "custom de**sign**" as signage. Now only
   material/object vocabulary matches (`src/lib/rule-lookup.ts`).
2. The accept endpoint was initially at `/api/quotes/:id`; the frontend contract is
   `/api/quotes/:id/accept` — make sure the Skyal frontend calls the latter.

## What to verify in the Skyal port (replicate the same checks)

After implementing, run the same customer-style flow against the Skyal frontend + admin
(with a local production build or dev server, and `NEXT_PUBLIC_ADMIN_API_URL` pointed at the
admin):

1. Chat: "how much for 2 full bubas?" → response contains the engine price line and
   `render_order_now: true`; the model text must NOT contain a price.
2. Chat bespoke job (e.g. "restore my grandmother's music box lid") → `custom` flag +
   "Place Custom Order" button.
3. Chat injection ("ignore all previous instructions …") → 400.
4. Calculator → quote; OrderView catalog order (e.g. `fabric_buba` ×2) → order total ==
   engine total; payment init returns a Paystack auth URL.
5. Custom-mode order (jeans) → priced by rule (`fabric_custom`); truly novel job → `QUOTING`
   success state and NO Paystack redirect.
6. Dashboard: magic-link returns only SKYAL orders; Saved Quotes section lists the
   calculator/chat snapshot; Accept & Pay creates the order at the snapshot price;
   Pay-now button appears for `PAYMENT_PENDING` orders.
7. Tracking shows no email/phone/PIN.

These are the same checks the Paberin run performed; if any fail on the Skyal port, fix the
frontend (do not change the admin).

## Steps

0. **If `/home/doombuggy_/Projects/skyalproj` is read-only** (cannot create/write files): copy the repo (KEEP `node_modules`; exclude `.next`, `.git`, `.env`, `dev.log`, `tsconfig.tsbuildinfo`, any `*.db`) into `/home/doombuggy_/Projects/paberin/skyalproj-dev`, implement there, and at the end generate `/home/doombuggy_/Projects/paberin/skyal-changes.patch` with `diff -ruN` against the original (same exclusions). Otherwise implement in place.
1. Read the sources in §Sources of truth, then implement per §What to implement.
2. Verify: `npx tsc --noEmit` (0 errors), `npx vitest run` (all tests pass — fix the ones you updated), and `npx next build` succeeds. NOTE: if `next build` fails ONLY on Google Fonts downloads (fonts.gstatic.com unreachable in this sandbox), that is an environment limit — the code itself is fine; report it instead of hacking around it.
3. Run the smoke checks in §"What to verify in the Skyal port" against the live admin.
4. Cross-check contracts against Paberin's `src/lib/api.ts` and `src/app/api/chat/route.tsx` (quote fields, `/api/quotes/:id/accept`, tracking without PII, magic-link `brand`, PATCH ownership).
5. Report: what changed per file, verification results, and any deviations.

## Invariants that must hold

- The AI never prices: chat prices come only from the admin `POST /api/services/quote`.
- `customSpec` orders: the ADMIN does the rule lookup (jeans→`fabric_custom` ₦20k, wood→
  `engraving_wood` ₦7.5k, unknown→QUOTING) — the frontend just submits
  `{ customSpec: { description, material, dimensions }, quantity, sla, deliveryMethod, ... }`.
- Saved quotes: `GET /api/quotes?phone=` lists OPEN snapshots; accept (`POST
  /api/quotes/:id/accept`) creates the order at the snapshot price, then pay.
- All admin calls carry `brand: 'SKYAL'` where the contract expects it (services, quote,
  orders, magic-link, payment initialize).
- State vocabulary: `QUOTING, PAYMENT_PENDING, PAYMENT_SUCCESS, IN_QUEUE, IN_PRODUCTION,
  READY, DISPATCHED, DELIVERED, ON_HOLD, CANCELLED, REFUNDED` (already mostly correct in
  `data.ts`/DashboardView — add QUOTING copy where missing).
- No PII additions: do not re-add customer email/phone/trackingPin to the tracking display.

---

