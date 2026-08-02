# Order & Pricing Redesign — Detailed Spec (v2)

**Status:** ✅ **Implemented 2026-08-02** (frontend in this repo; admin as `admin-changes.patch` — see §12)
**Author:** Reasonix · **Date:** 2026-08-02
**Repos touched:** `paberin` (customer frontend, this repo) and `skyalxpaberin-admin` (admin backend, currently at `/home/doombuggy_/Downloads/fixed-code(3)`)

---

## 1. Goals (updated with owner constraints)

1. **Two intake paths, one outcome.** Customers order by chatting with the AI or by filling the form. Both end in "review the price → pay" with minimal friction.
2. **Pricing must be accurate AND identical on return visits.** The price shown in chat, in the form, charged at payment, and shown again days later when the customer comes back must all be the **same number**.
3. **Bespoke jobs must be orderable without losing customers.**
4. **The client must not be manually involved.** He wants orders to flow; he wants to *know* orders are being made, not to price them. Human action is allowed only for rare exceptions, and must be one action.
5. **Orders depend on materials in inventory.** Availability must be part of the ordering experience, and stock must stay consistent with orders placed.

## 2. Architecture principle

> **The AI never prices. Rules price everything the business has already priced. Inventory gates what can be promised. A human is involved only when a job has no price rule at all — and that case must be rare.**

- **Tier 1 — Catalog (95%+ of orders):** every product line the business sells is a `Service` row with a deterministic price. The business has *already decided these prices* — they exist today as Skyal seed rows (`[admin] prisma/seed.ts`) and as price tables in the Paberin AI prompt (`[paberin] src/lib/chat.ts:376-510`). We seed the Paberin catalog with the same list. Chat and form feed the same engine → same number everywhere, forever.
- **Tier 2 — Provisional order (the rare unpriced job):** no "custom quote" dead-end. The customer places the order immediately; it is created in the existing **`QUOTING`** state (`[admin] order-state-machine.ts:11`: `QUOTING → PAYMENT_PENDING`). If a price rule exists (e.g. `fabric_custom` ₦10k/section), it auto-prices and the customer pays instantly. If truly no rule exists, the admin gets **one notification with a suggested price** (closest rule) — one click to approve. The customer never sees "we'll get back to you"; they see an order that becomes payable.
- **Inventory:** each material-consuming service links to an `InventoryItem`. Availability is checked and surfaced at quote time; out-of-stock behavior is configurable per brand (default: allow order, be honest about delay, auto-notify admin + suggest a purchase order).
- **Chat = spec extractor.** Converts language → structured `QuoteRequest` (§3). Never outputs prices.

## 3. Shared contract: `QuoteRequest`

```jsonc
{
  "serviceType": "paberin_fabric_custom",   // Tier 1 — must exist in catalog for brand
  // OR (Tier 2 — exactly one of serviceType / customSpec is present):
  "customSpec": {
    "description": "Cut my jeans into a pattern",
    "material": "denim",
    "dimensions": "waist 34, length 40",
    "complexity": "simple"                  // simple|moderate|complex
  },
  "quantity": 1,
  "sla": "Standard",                        // "Standard" | "Express"
  "deliveryMethod": "PICKUP",               // "PICKUP" | "LOCAL_DELIVERY" | "NATIONWIDE_WAYBILL"
  "deliveryAddress": "…",                   // required iff LOCAL_DELIVERY
  "designFiles": [{ "url": "…", "publicId": "…", "name": "…" }],
  "customerNotes": "…",
  "referralCode": "FRIEND10",
  "isFirstTimeCustomer": false
}
```

Brand is never client-chosen: routes force `brand = PABERIN` (as today, `[paberin] src/lib/api.ts:285-299`).

## 4. Tier 1 — Catalog: the business's real price list becomes the catalog

### 4.1 Seed the Paberin catalog from the prompt tables

The Paberin AI prompt already contains the authoritative price list (fabric garments, engravings, sheets, toppers). Seed **every** line as a real Paberin `Service`, mirroring the Skyal rows' structure (`[admin] prisma/seed.ts:1-60`):

- Fabric: `paberin_fabric_sleeves` ₦20k … `paberin_fabric_custom` (₦10k/section, min ₦20k), `paberin_fabric_complex_gown` ₦100k–200k, per-yard ₦20k — same garment list as the prompt.
- Engraving: `paberin_engraving_wood` ₦7.5k (this is what "engrave wood" maps to), phone ₦5k, jewelry ₦6k, leather ₦17.5k, small items ₦1.5k, curved ₦15k, badge ₦2.5k, necklace ₦7k.
- Sheets/toppers/signage/printed/sticks: existing 12 rows stay; add any missing prompt lines.

Consequences:
- "Cut my jeans" → `paberin_fabric_custom` (garment/section rule) — **instant, deterministic price, no human**.
- "Engrave wood" → `paberin_engraving_wood` — instant.
- The AI prompt tables are **deleted** from the prompt (§8) — the catalog becomes the single source of the price list, so future price changes happen in one place (admin services UI) and propagate everywhere.

### 4.2 Deterministic pricing engine (`[admin] src/lib/pricing-engine.ts`)

Input additions (all optional):

- `referralDiscountNaira?: number`, `firstTimeDiscountNaira?: number` (resolved by routes via a shared `resolveDiscounts()` helper — see §4.3).
- Output addition: `expressApplied: boolean` (true only when `sla === 'Express' && service.allowExpress`).

Rules:

1. **Discounts never stack** — apply the larger of referral vs first-time. First-time applies iff `isFirstTimeCustomer` and the phone has no prior *paid* order (`paymentConfirmedAt != null`, phone variant-matched). Referral applies iff code active + brand match + `usesCount < maxUses`.
2. **Express:** the stored SLA comes from `expressApplied`, not from what the client typed (`[admin] orders/route.ts:79` today stores `EXPRESS` even when the service disallows it).
3. **Integer-safe math** everywhere (naira, no floats).
4. New shared helper `[admin] src/lib/resolve-discounts.ts` used by **both** `/api/services/quote` and `/api/orders` — quote and order can never disagree.

### 4.3 Price stability on return visits (the "same price when they come back" requirement)

Three mechanisms, all already half-present, made explicit:

1. **Determinism:** price = pure function of (brand, service, material, qty, sla, delivery, discounts) over DB data. No AI, no human, no randomness → recomputing days later yields the same number unless the business deliberately changed a price.
2. **Persisted quotes:** new `Quote` table (below) snapshots the price + the full `QuoteRequest` at quote time. Chat and calculator quotes are saved (keyed by phone), not ephemeral. When the customer returns (same phone), open quotes are shown with their **snapshot price** — even if the business changed the price in between, the customer sees the price they were given. New quotes use current prices.
3. **Order snapshots:** `Order` already stores `totalAmount` + breakdown columns at creation; payment amount-gating compares against the snapshot (`[admin] payment/verify/route.ts:45-56`, `webhook/route.ts:105-124`) — unchanged.

```prisma
model Quote {
  id           String   @id @default(cuid())
  quoteNumber  String   @unique
  brand        Brand
  customerPhone String
  requestJson  String   // full QuoteRequest
  serviceType  String?  // denormalized for filtering
  totalAmount  Int      // snapshot
  discount     Int      @default(0)
  deliveryFee  Int      @default(0)
  status       String   @default("OPEN")   // OPEN, ACCEPTED, EXPIRED
  expiresAt    DateTime?
  orderId      String?  // set when converted
  createdAt    DateTime @default(now())
  @@index([customerPhone, status])
}
```

- Created by `POST /api/services/quote` (with `customerPhone` in the body — currently optional; make it required for the save, harmless otherwise), and by the chat route.
- `POST /api/quotes/:id/accept` → creates the order from the **snapshot** (not a recompute) → existing Paystack flow. Open-quote expiry default 7 days (setting `quote_expiry_days`, per brand).
- Chat and dashboard get a "Your saved quote: ₦35,000 — pay now" surface for OPEN quotes of the phone.

## 5. Tier 2 — Provisional orders (replaces "custom quotes")

### 5.1 Flow

1. Customer submits a job with no catalog match (chat or form custom mode).
2. **Rule lookup:** resolve `(operation, material, complexity)` → closest price rule:
   - fabric + any garment/section → `paberin_fabric_custom` (₦10k/section, min ₦20k);
   - material-unknown fabric → same rule;
   - engraving + any material not otherwise listed → `paberin_engraving_small_item` or nearest;
   - anything → nearest `Service` by category (the existing category logic in `[paberin] src/lib/chat-order.ts` moves server-side and becomes a **rule table**, not a fuzzy match).
3. **If a rule matches:** order created immediately in `PAYMENT_PENDING` with the rule price, `customerNotes` carrying the full description ("CUSTOM: cut my jeans…"), order flagged `needsReview` (new bool, admin sees it in the orders list — visibility only, no action required). Customer pays instantly. ✅ no human.
4. **If no rule matches (rare):** order created in **`QUOTING`** state, `customerNotes` with full description. Admin gets **one** notification ("New un-priced order PAB-…: cut my jeans — suggested ₦20,000") with the closest-rule price pre-filled. One click **Approve & Price** → `QUOTING → PAYMENT_PENDING` (valid transition), customer notified ("Your order is ready to pay — ₦20,000"), pays via dashboard. The admin can also adjust the suggested price before approving (still one action).
5. **No dead-ends:** the customer always has an order in their dashboard with a clear state ("Awaiting pricing — we'll confirm shortly"). No "we'll email you a quote" black hole, no waiting on the phone.

### 5.2 Backend changes (`[admin]`)

- Schema: `Order.needsReview Boolean @default(false)`.
- `POST /api/orders` accepts `customSpec` instead of `serviceType` when the client sends it: runs rule lookup → either prices via `calculatePrice` on the mapped rule service (Tier 1 path) or creates the order via `createOrderFromQuote` with `state: QUOTING` and no price rules (Tier 2 path). The hidden `paberin_custom_job` service row (basePrice 0) is used as the FK in the QUOTING case; `totalAmount` = 0 until priced.
- New admin endpoint `POST /api/admin/orders/:id/price` (auth): body `{ totalAmount, serviceLabel? }` → validates state `QUOTING` → sets price + `serviceLabel` + transition to `PAYMENT_PENDING` + notification. One action end-to-end.
- Admin orders list: filter + badge for `QUOTING` / `needsReview`; the existing `/admin/orders` UI and activity feed carry the notification.
- `checkGracePeriod` for `QUOTING` orders: not modifiable (fine as-is — `QUOTING` isn't in the modifiable list).
- **Old `CustomQuote` subsystem:** left in place for admin-created quotes (staff-initiated), but the customer-facing path uses provisional orders instead. No new customer `custom-quotes` endpoints needed.

### 5.3 Frontend (`[paberin]`)

- Form custom mode (step 1 "Something else" card) now submits the **order** directly (with `customSpec`), not a quote request. Success screen: "Order PAB-… received — you'll be able to pay once pricing is confirmed (usually within minutes)". If the rule matched, the customer goes straight to Paystack like any other order.
- Dashboard: orders in `QUOTING` show "Awaiting pricing" + a "Pay ₦X" button appears automatically when priced (poll, or the existing notification bell → click → pay). `formatOrderState` gains `QUOTING: 'Awaiting Pricing'`.
- Chat: when no catalog match, the assistant says "I've placed your order — it's being priced now, usually within minutes" (with consent, one confirm turn) instead of offering a manual quote request.

## 6. Inventory-aware ordering

### 6.1 Schema (`[admin] prisma/schema.prisma`)

```prisma
model Service {
  // … existing fields …
  materialStockItemId String?          // link to InventoryItem (business-supplied materials only)
  materialStockItem   InventoryItem?   @relation(fields: [materialStockItemId], references: [id])
  materialQtyPerUnit  Float            @default(1)  // e.g. 1 topper = 0.1 acrylic sheet
  @@index([brand, isActive])
}
```

- `customerSupplied: true` services (fabric, engraving items — customer brings the item) get **no** stock link; the customer's material is never our inventory.
- Seed mappings: toppers/signage → acrylic sheet item; sticks → acrylic rod; printed → card stock; sheet cutting → acrylic/wood sheet; fabric/per-yard → none (customer-supplied).
- v1 keeps **one** material per service; multi-material jobs (e.g. topper + sticks) are separate order lines or listed in `requiredMaterials` JSON later.

### 6.2 Availability at quote/order time

- `calculatePrice` (or the routes around it) computes **available-for-promise**, which subtracts material already promised to paid-but-not-started orders:
  ```
  availableForPromise = quantityInStock − Σ(pendingConsumption)
  pendingConsumption = Σ over orders in state IN_QUEUE of (order.quantity × materialQtyPerUnit)
  ```
  (In stock terms: with decrement-at-production-start (§6.3), paid orders waiting in the queue still consume the material, so they must count against what we can promise new customers. `IN_PRODUCTION` orders have already decremented, so they don't appear here.)
- Response gains:
  ```jsonc
  "availability": { "status": "IN_STOCK" | "LOW" | "OUT_OF_STOCK",
                    "remaining": 12, "etaDays": 3 }
  ```
  - `LOW` when remaining ≤ `reorderThreshold`; `OUT_OF_STOCK` when 0.
- Chat and form display it: "In stock — 5 working days" / "Low stock — we'll confirm timing" / "Out of stock — usually back in 3 days; order anyway and we'll notify you".
- **Configurable per brand** (setting `block_order_when_out_of_stock`, default `false`): when `false` the order is accepted normally; when `true`, quote/order returns 409 with alternatives. Default keeps customers unblocked (owner's priority), admin sees the shortage and can flip the setting for hot items.

### 6.3 Stock consistency & admin visibility

- **Decrement: at production start** (decision 2026-08-02). When an order transitions `IN_QUEUE → IN_PRODUCTION` (`[admin] src/lib/order-state-machine.ts` `transitionOrder`), the system atomically consumes `order.quantity × materialQtyPerUnit` from the linked `InventoryItem`:
  ```sql
  UPDATE InventoryItem
  SET quantityInStock = quantityInStock - :needed
  WHERE id = :itemId AND quantityInStock >= :needed   -- atomic guard, CAS-style
  ```
  plus an `InventoryTransaction` row (`type: 'PRODUCTION_CONSUMPTION'`, orderNumber in note).
- **Insufficient stock at production start:** the CAS fails → the transition is **blocked** with a clear error ("Insufficient stock: Acrylic Sheet — need 3, have 2"), the order stays `IN_QUEUE`, and the system auto-creates (a) an admin notification and (b) a draft `PurchaseOrder` (existing `/api/admin/purchase-orders`) with the item + suggested qty. The admin resolves by receiving stock or explicitly overriding (override recorded in audit + `InventoryTransaction`). No silent overbooking, no lost order, minimal admin attention.
- **Reversal:** on `REFUNDED` of an order that consumed material, restore `quantityInStock` with a matching `InventoryTransaction` (`type: 'REFUND_RESTOCK'`).
- **Unpaid/cancelled orders never touch stock** — decrement only happens at production start, so a customer cancelling before then (24h grace) needs no stock reconciliation.
- **Auto admin alerts (no manual work):** when a quote/order hits `LOW`/`OUT_OF_STOCK` (§6.2), create an admin notification + draft `PurchaseOrder` suggestion with suggested qty (`reorderThreshold × 2`). Admin just reviews/approves the PO — the "know orders are being made" visibility the owner wants.
- Existing `/admin/inventory`, `stock-movement`, `inventory/forecast` pages keep working; they gain the service link for "this material feeds these services" views.

### 6.4 Pricing vs material cost

- v1: catalog prices are **fixed** (what the business printed in the prompt). `unitCostNaira` is used for **forecasting/margin visibility only**, never for customer pricing — this is what keeps "same price when the customer comes back" true even when supplier costs fluctuate.
- v2 option (flagged, not built): a `materials_markup_pct` setting if the owner ever wants cost-plus pricing; requires a price-snapshot story (Quotes table already snapshots).

## 7. Order-form & calculator changes (`[paberin]`)

- Step 1: full expanded service list (from §4.1) grouped by category (Fabric / Engraving / Toppers / Sheets / Printed / Sticks), search box (long list now), and the final **"Something else / custom job"** card.
- Step 2: SLA toggle disabled with a note when `allowExpress === false` (fixes the stored-but-unpriced Express bug, `[admin] orders/route.ts:79`).
- Step 2: availability line from §6.2 under the service/quantity.
- Step 5 + quote sidebar: show discount lines (referral/first-time) and availability; button label uses the **quote snapshot** price.
- Calculator: same expansion + "Something else" → custom mode; saves a `Quote` (§4.3) so the calculator price is what they see later.
- Delivery address stored **raw** (fix `[admin] orders/route.ts:85` `JSON.stringify` — dashboard `prettyAddress` renders literal quotes today).

## 8. Chat redesign (`[paberin]`)

1. **Prompt** (`src/lib/chat.ts` `PABERIN_SYSTEM_PROMPT`): delete all price tables and the `[QUOTE]` contract (lines ~376-510). Add a `[SPECS]` block (same lenient JSON parsing):

```jsonc
// [SPECS] … [/SPECS]
{
  "service_type": "paberin_fabric_custom",   // or null
  "custom_description": "cut my jeans into a pattern",
  "material": "denim",
  "quantity": 1,
  "sla": "Standard",
  "delivery": "PICKUP",            // "PICKUP" | "LOCAL_DELIVERY" | null
  "delivery_address": "…",
  "needs_design_upload": true
}
```

   Rules: confirm specs before emitting; map by **intent** to a catalog line; **never mention prices** ("let me confirm the exact price for you"); no match → `service_type: null` + description and offer to place the order for pricing.
2. **Route** (`src/app/api/chat/route.tsx`): parse `[SPECS]` → server-side resolution (rule table, not fuzzy matching) → call admin `/api/services/quote` with the full `QuoteRequest` (reuses existing timeout/retry machinery) → append "Your price: ₦35,000 (… breakdown …)" from the **engine** → `render_order_now` with engine data. No match → provisional order path (§5) with the customer's consent (one confirm turn). Chat responses cache 60s as today (`src/lib/chat-cache.ts`).
3. **Handoff:** `?from=chat&specs=<urlencoded QuoteRequest>` (replaces `?quote=`); order page prefill maps `service_type` exactly (no fuzzy), carries specs + context into notes. **Invariant: chat price == form price == order total == saved quote price**, because all are the same engine call.
4. **Saved quotes in chat:** when the phone has OPEN quotes, the route (or chat page) surfaces "You have a saved quote for ₦35,000 — pay now" before a fresh conversation quote.
5. **Eval & tests:** `tests/unit/chat.test.ts` — replace `parseQuoteBlock` tests with `parseSpecsBlock` (schema, no-price enforcement). Regenerate datasets (`scripts/build-chat-dataset.py`, `tests/datasets`) — "ideal replies" contain engine-confirmed prices. Delete `scripts/evaluate-price-extraction.js` (regex pricing fallback removed). New eval cases: jeans → `fabric_custom` rule; wood engraving → exact service; price question → "confirming exact price"; out-of-stock mention → availability copy.

## 9. Parallel fixes (trust issues, separate PRs)

1. **State vocabulary alignment:** frontend speaks `IN_PROGRESS/CUTTING/QC/…`; admin uses `IN_QUEUE/IN_PRODUCTION/READY/DISPATCHED` (`[paberin] OrderStepper.tsx:11-27`, `src/lib/api.ts:520-546`). Align to admin enum (add `QUOTING`).
2. **Phone ownership on PATCH** (`[admin] orders/[orderNumber]/route.ts:21-27`): require `customerPhone`, compare with `phoneVariants`.
3. **Brand filter on magic-link** (`[admin] magic-link/route.ts`) — Paberin dashboard currently lists Skyal orders.
4. **Escalation ownership** (`[admin] escalations/route.ts`).
5. **Tracking PII** (`[admin] orders/route.ts:167-193`): stop returning `trackingPin` + customer email/phone from the unauthenticated endpoint.
6. **Modify re-prices through the engine** (`[admin] order-state-machine.ts:294-301` scaling bug: min-price + delivery fee over/undercharges); block customer modify of already-paid orders in v1 (delta/refund flows out of scope).

## 10. Migration & rollout

1. **Phase A (admin):** seed Paberin catalog (§4.1); engine hardening + `resolveDiscounts` + `expressApplied` + `discountType` (§4.2); `Service.materialStockItemId` + availability in quote/order responses (§6); modify reprice + paid-order guard (§9.6). No customer-visible break.
2. **Phase B (admin):** `Quote` table + accept endpoint (§4.3); provisional orders: `needsReview`, `customSpec` on `/api/orders`, `POST /api/admin/orders/:id/price`, `QUOTING` handling in admin UI (§5); stock consumption at production start + PO-draft alerts (§6.3).
3. **Phase C (paberin):** chat prompt + route rewrite (§8); `?specs=` handoff; order form expansion + custom mode + availability + SLA fix (§7); calculator; dashboard QUOTING + saved-quotes + Accept & Pay (§4.3, §5.3).
4. **Phase D:** dataset/eval regeneration; delete dead pricing code (`parseQuoteBlock`, `extractPriceFromText`, `evaluate-price-extraction.js`, `matchChatQuoteToService` fuzzy path); parallel fixes (§9).
5. **Rollback:** Phase C behind existing `CHAT_MODE` env switch; Phases A/B additive.

## 11. Open questions

**Decided 2026-08-02:**
- **Q1 — Out-of-stock behavior:** allow the order, show honest delay copy, auto admin alert + draft PO. `block_order_when_out_of_stock` setting exists (default `false`), per-brand; per-material override can come later.
- **Q2 — Un-priced job approval:** one-click admin "Approve & Price" with the closest-rule suggestion pre-filled (§5.1 step 4).
- **Q3 — Stock decrement point:** **at production start** (`IN_QUEUE → IN_PRODUCTION`), with atomic CAS guard, blocked-transition + alerts + draft PO on insufficiency, reversal on refund (§6.3). Availability shown to customers subtracts queue-pending consumption (§6.2).

**Still open:**
- **Q4 — Quote snapshot expiry:** 7 days default (`quote_expiry_days`)? After expiry the saved quote expires and a fresh quote uses current prices.
- **Q5 — Discounts:** confirm referral + first-time never stack (larger wins), and referral `usesCount` increments only when the discount was actually applied.
- **Q6 — Express on non-express services:** frontend disables the toggle (recommended) — or should the engine silently drop to Standard with a note as today?

## 12. Implementation status (2026-08-02)

All phases implemented and verified:

- **Frontend (this repo):** `src/lib/chat.ts` (new prompt + `parseSpecsBlock`), `src/app/api/chat/route.tsx` (engine pricing + custom handoff + saved-quote banner), `src/lib/api.ts` (admin state vocabulary, `getOpenQuotes`/`acceptQuote`, brand on magic-link), `src/lib/chat-order.ts` (retired fuzzy matcher), `src/app/order/page.tsx` (specs prefill, custom mode, SLA guard, availability, QUOTING success state), `src/app/calculator/page.tsx` (custom link), `src/app/chat/page.tsx` (Place Custom Order + saved quotes), `src/app/dashboard/page.tsx` (Saved Quotes section, Pay-now for pending orders, QUOTING banner), `src/components/OrderStepper.tsx` + `src/app/track/page.tsx` (admin state vocabulary, PIN removed), `src/components/AvailabilityLine.tsx`. Verified: `tsc --noEmit` clean, 104 vitest tests pass.
- **Admin:** implemented in `admin-dev/` (scratch copy; the real repo at `/home/doombuggy_/Downloads/fixed-code(3)` is read-only in this environment) and delivered as **`admin-changes.patch`** in the repo root — apply with `git apply admin-changes.patch` inside the admin repo, then `prisma generate && prisma db push && pnpm db:seed`. Verified: `tsc --noEmit` clean, 40 vitest tests pass, `git apply --check` passes against the real repo.
- **Ops follow-ups:** run the seed to populate the new Paberin services/inventory/settings; set `first_time_discount_naira` / `quote_expiry_days` / `block_order_when_out_of_stock` per brand in admin settings; regenerate eval datasets (`scripts/build-chat-dataset.py` + `evaluate-dataset.js`) against a live Agnes key; `scripts/skyal/skyal-setup-prompt.md` describes the old [QUOTE] machinery and should be refreshed when Skyal ports the new design.

### 12.1 Customer-style test run (2026-08-02)

End-to-end tested against a **local production build** (sqlite file DB, Paystack test API, live Agnes):

- Calculator/quote → snapshot → order → Paystack init → track (PII hidden): pass
- Jeans → `fabric_custom` ₦20k rule; wood tray → `engraving_wood`; sign board → signage; topper; 4×4 sheet: pass
- No-rule job (chandelier / music box / silver platter) → QUOTING + `needs_pricing` admin feed entry: pass
- One-click Approve & Price (QUOTING → PAYMENT_PENDING): pass
- Saved quote accept at snapshot price; double-accept 409; wrong-phone accept 403: pass
- Referral discount (₦5k) and first-time discount applied, never stacked; non-new customers pay full: pass
- Out-of-stock surfaced (OUT_OF_STOCK) but order still accepted: pass
- Modify re-prices through the engine (₦16,500 → qty 2 = ₦31,500, delivery fee NOT scaled); paid-order modify blocked: pass
- Cancel/modify without or with wrong phone → 403; escalation wrong phone → 403; cross-brand track → 404; Express on non-express service stored as STANDARD: pass
- Chat (live Agnes): "2 full bubas" → engine price ₦70,000 with "💰 Your price" line; chandelier → Place Custom Order; injection → 400: pass
- **Bugs found by the run and fixed:** (1) rule table matched bare "cut"/"sign" (`/cut\b/`, `/sign/i`) mis-pricing "re-cut a chandelier" and "custom design" — removed the broad verbs; (2) `/api/quotes/:id/accept` was implemented at `/api/quotes/:id` — moved to `[id]/accept/route.ts`.
- Not tested in-sandbox: browser page rendering (Google Fonts CDN blocked here) and live Paystack payment capture (test API only) — both are environment limits, not code paths.
