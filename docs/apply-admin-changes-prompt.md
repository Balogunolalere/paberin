# Admin Implementation Prompt — Order & Pricing Changes (incl. seeding)

*Paste everything below this line into a new AI session.*

---

You are implementing a set of changes to the Skyal/Paberin **admin backend** (Next.js App Router + Prisma 6 + Turso/libsql). The customer frontend already implements the new flow; the admin API must match its contracts exactly.

## Repos

- ADMIN (where you implement): `/home/doombuggy_/Downloads/fixed-code(3)`
- FRONTEND (read-only reference — do NOT modify): `/home/doombuggy_/Projects/paberin`

## Sources of truth (read these FIRST)

1. `/home/doombuggy_/Projects/paberin/admin-changes.patch` — the COMPLETE implementation as a unified diff (17 files, `--- a/...` / `+++ b/...` paths, applies from the admin repo root). This is the primary source: apply it verbatim. If any hunk fails, re-implement that file from the diff content.
2. `/home/doombuggy_/Projects/paberin/docs/order-and-pricing-redesign-spec.md` — the design spec (§1–§11) plus implementation status and customer-style test results (§12, §12.1).
3. Frontend contract files — your admin endpoints must match these exactly:
   - `/home/doombuggy_/Projects/paberin/src/lib/api.ts` — all endpoint calls + types: `getOpenQuotes` → `GET /api/quotes?phone=`, `acceptQuote` → `POST /api/quotes/:id/accept` with `{customerPhone}`, `createOrder` accepts `customSpec` or `serviceType`, `getOrdersByPhone` sends `{phone, brand:'PABERIN'}`, `formatOrderState` uses the admin OrderState enum (`QUOTING, PAYMENT_PENDING, PAYMENT_SUCCESS, IN_QUEUE, IN_PRODUCTION, READY, DISPATCHED, DELIVERED, ON_HOLD, CANCELLED, REFUNDED`).
   - `/home/doombuggy_/Projects/paberin/src/app/api/chat/route.tsx` — calls `POST /api/services/quote` with `{brand:'PABERIN', serviceType, quantity, sla, deliveryMethod, deliveryAddress, customerPhone}` and expects `{data:{quoteNaira, breakdown, availability?, quoteId?, quoteNumber?, quoteExpiresAt?}}`.
   - `/home/doombuggy_/Projects/paberin/src/app/order/page.tsx` — submits `customSpec` orders (provisional flow) and reads `order.state === 'QUOTING'`.
   - `/home/doombuggy_/Projects/paberin/src/app/dashboard/page.tsx` — Saved Quotes section (list + accept + pay) and Pay-now for `PAYMENT_PENDING` orders.
   - `/home/doombuggy_/Projects/paberin/src/lib/chat-order.ts` — specs→notes helper (contract for the `[SPECS]` block shape).

## What the patch changes (per-file summary — use to self-check)

- `prisma/schema.prisma` — `Service.materialStockItemId`/`materialQtyPerUnit` + `InventoryItem.services` relation; `Order.discountType` + `Order.needsReview`; new `Quote` model (price snapshots: quoteNumber, brand, customerPhone, requestJson, serviceType, totalAmount, discount, deliveryFee, status OPEN/ACCEPTED/EXPIRED, expiresAt, orderId).
- `prisma/seed.ts` — full PABERIN price list as real services (fabric garments, engravings incl. `paberin_engraving_wood`, sheets, `paberin_fabric_custom`, hidden `paberin_custom_job` + SKYAL `custom_job` with `active:false`); PABERIN inventory items; service→material links; new settings `first_time_discount_naira`, `quote_expiry_days`, `block_order_when_out_of_stock`.
- `src/lib/pricing-engine.ts` — `referralDiscountNaira`/`firstTimeDiscountNaira` inputs; discounts never stack (larger wins); `expressApplied` + `discountType` in the breakdown.
- `src/lib/resolve-discounts.ts` (new) — single discount resolver used by quote AND order routes; reads `first_time_discount_naira` setting; first-time only with no prior paid order; referral only when active + capacity; `referralApplied` flag.
- `src/lib/rule-lookup.ts` (new) — customSpec → nearest catalog service rule table (fabric_custom, engraving_wood/phone, topper_custom, signage, sticks, printed, sheet). IMPORTANT: no bare `/cut\b/` or `/sign\b/` patterns (design/re-cut must NOT match).
- `src/lib/inventory.ts` (new) — availability (on-hand − IN_QUEUE pending consumption), atomic CAS consumption at production start, restock on refund, blocked-production note + draft PurchaseOrder (requires poNumber).
- `src/lib/order-state-machine.ts` — `createOrderFromQuote` accepts `state` (QUOTING), `needsReview`, `discountType`, stores `stateHistory` from actual state; `transitionOrder` consumes material before IN_QUEUE→IN_PRODUCTION (blocks + restocks on CAS loss); `modifyOrderByCustomer` re-prices via `calculatePrice` and blocks modification of paid orders.
- `src/app/api/services/quote/route.ts` — discounts via resolveDiscounts; saves Quote snapshot when customerPhone present (expiry from `quote_expiry_days`); returns availability + quoteId.
- `src/app/api/orders/route.ts` — discounts; `sla` from `breakdown.expressApplied`; stores `discountType`; referral `usesCount` only when `referralApplied`; `customSpec` → rule lookup (priced + `needsReview:true`) or provisional QUOTING via hidden custom_job service; deliveryAddress stored RAW (no JSON.stringify); response includes `availability`. GET (tracking): response contains NO customerEmail/customerPhone/trackingPin.
- `src/app/api/orders/[orderNumber]/route.ts` — PATCH requires `customerPhone` and matches it with `phoneVariants` (403 otherwise).
- `src/app/api/magic-link/route.ts` — optional `brand` filter; lifetime spend excludes unpaid.
- `src/app/api/escalations/route.ts` — POST verifies phone matches the order (variant-matched).
- `src/app/api/quotes/route.ts` (new) — `GET ?phone=` lists OPEN quotes (variant-matched).
- `src/app/api/quotes/[id]/accept/route.ts` (new) — POST `{customerPhone}`: 403 wrong phone, 409 not OPEN, 410 expired → creates order from the SNAPSHOT (never recompute) → ACCEPTED.
- `src/app/api/admin/orders/[id]/route.ts` — new `action:'price'` (QUOTING → set totalAmount + serviceLabel → PAYMENT_PENDING, audit-logged); refund action restocks consumed material.
- `src/app/api/admin/notifications/recent/route.ts` — derived `needs_pricing` notifications for QUOTING orders.
- `src/app/admin/orders/page.tsx` — "Approve & Price…" dropdown item for QUOTING orders; `review` badge when `needsReview`.

## Steps

0. **If the admin repo is read-only** (cannot create/write files): copy the whole repo (KEEP `node_modules` so builds work; exclude `.next`, `.git`, `.env`, `patches`, `tsconfig.tsbuildinfo`, any `*.db`) into `/home/doombuggy_/Projects/paberin/admin-dev`, implement there, and at the end generate `/home/doombuggy_/Projects/paberin/admin-changes-2.patch` with `diff -ruN` against the original (same exclusions) and verify it with `git apply --check` against the original repo. Otherwise apply in place.
1. Apply the patch: `cd "/home/doombuggy_/Downloads/fixed-code(3)" && git apply /home/doombuggy_/Projects/paberin/admin-changes.patch` (or `patch -p1 < ...`). If a hunk fails, implement that file manually from the diff.
2. Regenerate Prisma, push the schema, seed (prisma is NOT on PATH — use npx):

   ```bash
   npx prisma generate
   npx prisma db push
   pnpm db:seed
   ```

   DATABASE_URL comes from the repo's `.env` — do not change it. NOTE: if `.env` points at the production Turso database, `db push` + `seed` alter production — that is intended for this deployment; the seed is idempotent (upserts). The seed now produces: 36 PABERIN services (incl. hidden `paberin_custom_job`), 5 PABERIN inventory items linked to services, admin user, and settings `first_time_discount_naira=0`, `quote_expiry_days=7`, `block_order_when_out_of_stock=false`.
3. Do NOT modify `src/lib/db.ts`. Do NOT commit or include `.env`, `dev.db`, or `.next`.
4. Verify: `npx tsc --noEmit` (0 errors), `npx vitest run` (all 40 tests pass), and `npx next build` succeeds. Fix any failures you introduced.
5. Cross-check the API contracts against the frontend files in §Sources (especially the quote response fields, the `/api/quotes/:id/accept` path, tracking WITHOUT PII, PATCH ownership).
6. Report: what was applied (or the patch path if you worked in a copy), the verification results, and any deviations.

## Invariants that must hold (test your implementation against these)

- The AI never prices: chat pricing comes only from `POST /api/services/quote`.
- `customSpec` orders: rule lookup first (jeans→`paberin_fabric_custom` ₦20k, wood→`paberin_engraving_wood` ₦7.5k, "custom design"/"re-cut…" → QUOTING); no rule → order in state `QUOTING` with `needsReview:true` on the hidden `custom_job` service, total 0; admin `PATCH /api/admin/orders/:id {action:'price', totalAmount}` → `PAYMENT_PENDING`.
- Discounts: referral + first-time never stack (larger wins); referral `usesCount` increments only when the discount was actually applied.
- Order stores `sla` from `breakdown.expressApplied` and `discountType`.
- Inventory: availability present in quote/order responses; material consumed atomically at `IN_QUEUE → IN_PRODUCTION` (blocked transition + order admin note + draft PO when insufficient); refund of a produced order restocks.
- Quotes: `POST /api/services/quote` with `customerPhone` saves an OPEN snapshot; accept uses the snapshot price; `GET /api/quotes?phone=` variant-matches the phone.
- Trust: tracking endpoint returns no email/phone/trackingPin; magic-link honors `brand`; escalations and order PATCH verify phone ownership; admin feed shows `needs_pricing`.
