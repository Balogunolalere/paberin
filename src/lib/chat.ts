/**
 * Paberin Chat — shared pure logic for the /api/chat route.
 *
 * Extracted from the route handler so the exact same code that runs in
 * production is what the unit tests exercise (previously the tests kept a
 * private copy that could drift from the implementation).
 */

import type { ChatMessage, ChatResponse } from '@/lib/api';

/* ───────────────────────────── Env helpers ───────────────────────────── */

/**
 * Parse a positive-integer env var with a validated fallback.
 * Garbage values (NaN, <= 0, empty) fall back to `fallback` instead of
 * silently producing `NaN` timeouts/delays at runtime.
 */
export function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(`[Paberin Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  const n = Number.parseInt(trimmed, 10);
  if (n <= 0) {
    console.warn(`[Paberin Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  return n;
}

/* ───────────────────────────── Rate limiter ───────────────────────────── */

/**
 * In-memory fixed-window rate limiter, keyed per client so one abusive IP
 * can't exhaust the shared quota. Note the fixed-window caveat: a burst
 * straddling a window boundary can pass up to 2×max. For multi-instance
 * deployments (Vercel edge, multiple isolates) replace with a Redis-based
 * limiter — this is a blunt instrument, not a hard security boundary.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 100,
    private readonly windowMs = 60_000
  ) {}

  acquire(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.max) return false;
    bucket.count++;
    // Opportunistically prune expired buckets so the map can't grow unbounded.
    if (this.buckets.size > 1000) {
      this.buckets.forEach((bucket, key) => {
        if (now >= bucket.resetAt) this.buckets.delete(key);
      });
    }
    return true;
  }

  /** Reset one key (or everything when no key given) — used by tests. */
  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}

/* ───────────────────────────── Retry helper ───────────────────────────── */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  /** Hard cap on total wall-clock time across all attempts. */
  budgetMs?: number;
  /** Return false to abort retrying for a given error. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retry an async operation with exponential backoff + jitter.
 *
 * Hard cap on total wall-clock time (budgetMs):
 *  - no attempt is started once the budget is exhausted, and
 *  - `fn` receives the remaining budget so callers can shrink per-attempt
 *    timeouts (e.g. an LLM fetch) — without this, a single attempt could
 *    burn the full per-attempt timeout past the budget.
 *
 * The caller is responsible for creating a FRESH abort controller per
 * attempt (see the route handler) — a controller aborted by a timeout stays
 * aborted and would poison every subsequent attempt.
 */
export async function retryWithBackoff<T>(
  fn: (remainingBudgetMs: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, budgetMs = 60_000, shouldRetry } = options;
  const start = Date.now();
  let lastError: unknown = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - start;
    if (elapsed >= budgetMs) throw lastError;

    try {
      return await fn(budgetMs - elapsed);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      if (shouldRetry && !shouldRetry(error)) throw error;

      const elapsedAfter = Date.now() - start;
      if (elapsedAfter >= budgetMs) throw error;

      // 1s → 2s → 4s + jitter, never overshooting the remaining budget
      const jittered = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      const delay = Math.min(jittered, budgetMs - elapsedAfter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/* ───────────────────────────── Session IDs ───────────────────────────── */

/**
 * Generate a session ID for conversation tracking.
 * Uses crypto.randomUUID (cryptographically random) instead of Math.random.
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `pab_${timestamp}_${random}`;
}

/* ───────────────────────────── Quote parsing ───────────────────────────── */

const QUOTE_REGEX = /\[QUOTE\]\s*([\s\S]*?)\s*\[\/QUOTE\]/;

/** Coerce a model-provided value to a finite number (accepts "35,000", "₦35000"). */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,₦\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Lenient JSON parse for model output: strips markdown code fences
 * (```json ... ```), extracts the first {...} object, and removes trailing
 * commas — the two most common ways LLM JSON output fails strict JSON.parse.
 */
function parseLenientJson(raw: string): Record<string, unknown> | undefined {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  text = text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse the structured [QUOTE] block from the assistant text.
 * PRIMARY extraction method — deterministic JSON parsing.
 *
 * The model's arithmetic is cross-checked: when unit_price × quantity and the
 * surcharge components are present and disagree with `total` by more than 10%,
 * the total is recomputed from the components (guards against hallucinated
 * totals). One exception: when `total` ≈ subtotal and the only difference vs
 * the recomputed value is the express/add-on surcharges, the model is treated
 * as having already folded them into the unit price, and `total` is trusted.
 */
export function parseQuoteBlock(text: string): ChatResponse['quote'] | undefined {
  const match = text.match(QUOTE_REGEX);
  if (!match) return undefined;

  const q = parseLenientJson(match[1]);
  if (!q) return undefined;

  const total = toNumber(q.total);
  if (total === undefined || total <= 0) return undefined;

  const quantity = toNumber(q.quantity) ?? 1;
  const unitPrice = toNumber(q.unit_price);
  const expressSurcharge = toNumber(q.express_surcharge) ?? 0;
  const addOnsTotal = toNumber(q.add_ons_total) ?? 0;
  const deliveryFee = toNumber(q.delivery_fee) ?? 0;
  const discount = toNumber(q.discount) ?? 0;

  const subtotal = unitPrice !== undefined ? unitPrice * quantity : undefined;
  const computedTotal =
    subtotal !== undefined ? subtotal + expressSurcharge + addOnsTotal + deliveryFee - discount : undefined;

  let finalPrice = total;
  if (computedTotal !== undefined && computedTotal > 0) {
    const relativeDiff = Math.abs(computedTotal - total) / Math.max(computedTotal, total);
    // Exception: the model sometimes quotes unit_price ALREADY including the
    // express surcharge and still lists express_surcharge separately — in that
    // case total ≈ subtotal while computedTotal = subtotal + surcharges. Trust
    // the total then, instead of double-counting the surcharge.
    // (If the model instead FORGOT the surcharge, subtotal and total diverge
    // by the surcharge amount and the recompute below correctly kicks in.)
    const expressAlreadyInUnit =
      subtotal !== undefined &&
      Math.abs(subtotal - total) <= Math.max(1, subtotal * 0.02) &&
      Math.abs(computedTotal - total - expressSurcharge - addOnsTotal) <= Math.max(1, subtotal * 0.02);
    if (relativeDiff > 0.1 && !expressAlreadyInUnit) {
      finalPrice = computedTotal;
    }
  }
  finalPrice = Math.max(0, Math.round(finalPrice));
  if (finalPrice <= 0) return undefined;

  return {
    price: finalPrice,
    original_price: toNumber(q.original_price),
    bulk_discount: toNumber(q.bulk_discount),
    breakdown: {
      serviceLabel: typeof q.service_label === 'string' ? q.service_label : undefined,
      serviceType: typeof q.service_type === 'string' ? q.service_type : undefined,
      sla: typeof q.sla === 'string' ? q.sla : undefined,
      leadTime: typeof q.lead_time === 'string' ? q.lead_time : undefined,
      notes: typeof q.notes === 'string' ? q.notes : undefined,
      basePrice: unitPrice,
      expressSurcharge,
      addOnsTotal,
      discount,
      deliveryFee,
      finalPriceNaira: finalPrice,
      quantity,
    },
    summary: `${q.service_label || 'Service'}: ${quantity}× ₦${(unitPrice ?? finalPrice).toLocaleString('en-NG')} = ₦${finalPrice.toLocaleString('en-NG')}. ${q.lead_time || ''}`.trim(),
  };
}

/**
 * FALLBACK: extract a price from free text, used only when no valid
 * [QUOTE] block is present.
 *
 * Requires explicit naira context — a ₦/NGN/N prefix or a "naira"/"NGN"
 * suffix — so phone numbers, dates, and stray digits are never misread as
 * prices ("0803 500 3068" must never become ₦3,068).
 */
export function extractPriceFromText(text: string): ChatResponse['quote'] | undefined {
  const prices = new Set<number>();

  const collect = (regex: RegExp, valueGroup: number, thousandGroup?: number) => {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[valueGroup];
      if (raw) {
        const n = parseFloat(raw.replace(/,/g, ''));
        if (Number.isFinite(n) && n > 0) prices.add(thousandGroup && m[thousandGroup] ? n * 1000 : n);
      }
      if (m.index === regex.lastIndex) regex.lastIndex++;
    }
  };

  // Prefix form: ₦15,000 / N15,000 / NGN 15,000 / ₦20K
  // NOTE: no case-insensitive flag — a lowercase "n" prefix ("n15000") is
  // not naira notation and would cause false positives.
  collect(/(?<![A-Za-z0-9₦])(?:₦|NGN|N)\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?/g, 1, 2);
  // Suffix form: 15,000 naira / 15000naira / 20K naira
  collect(/(\d[\d,]*(?:\.\d+)?)\s*([kK])?\s*(?:naira|NGN)\b/gi, 1, 2);

  if (prices.size === 0) return undefined;

  let bestPrice = 0;
  prices.forEach((price) => {
    if (price > bestPrice) bestPrice = price;
  });
  return {
    price: bestPrice,
    original_price: undefined,
    bulk_discount: undefined,
    breakdown: undefined,
    summary: `Estimated price: ₦${bestPrice.toLocaleString('en-NG')}`,
  };
}

/** Full extraction pipeline: structured [QUOTE] first, regex fallback. */
export function extractQuote(text: string): ChatResponse['quote'] | undefined {
  return parseQuoteBlock(text) ?? extractPriceFromText(text);
}

/**
 * Strip [QUOTE] blocks (and any markdown-fenced JSON leftovers) from the
 * assistant text for clean display.
 */
export function cleanAssistantText(text: string): string {
  return text
    .replace(/\[QUOTE\][\s\S]*?\[\/QUOTE\]/g, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '')
    .trim();
}

/* ───────────────────────────── Input sanitization ───────────────────────────── */

const HARD_INJECTION_PATTERNS = [
  /^system:\s*/im,
  /^\[system\]\s*/im,
  /ignore (all |your )?(previous |prior )?instructions/i,
  /override your /i,
];

// Conversational phrases that are also attack-shaped — only flagged for
// short messages to avoid blocking genuine long customer messages like
// "please forget everything I said earlier about wood".
const SOFT_INJECTION_PATTERNS = [/you are now /i, /forget everything/i];

/**
 * Heuristic prompt-injection detector.
 *
 * Hard patterns ("system:", "ignore … instructions", "override your …") are
 * flagged regardless of length — padding a message past 200 chars must not
 * bypass the check. Soft conversational patterns are only flagged for short
 * messages to avoid false positives on genuine long ones.
 *
 * This is defense-in-depth, not a security boundary: the system prompt is the
 * real defense. Applied to BOTH the current message and the client-supplied
 * history (which is fully attacker-controlled).
 */
export function isInjectionAttempt(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (HARD_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return text.length < 200 && SOFT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize client-supplied conversation history: keep only user/assistant
 * messages with non-empty content, cap the turn count and per-message length.
 */
export function sanitizeHistory(history: unknown, maxTurns = 50, maxLen = 4000): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m: any) =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-maxTurns)
    .map((m: any) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content.trim().slice(0, maxLen),
    }));
}

/* ───────────────────────────── System prompt ───────────────────────────── */

/**
 * The full system prompt for the assistant. Kept here (not in the route) so
 * tests can assert the prompt contract directly — vague-query rules, the
 * [QUOTE] JSON template, and Nigerian-context handling must not silently
 * regress.
 */
export const PABERIN_SYSTEM_PROMPT = `You are Paberin's AI Assistant — the friendly, knowledgeable voice of Paberin Creations, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

# YOUR IDENTITY
- You represent Paberin Creations (sister brand to Skyal Laser Services)
- You help customers with laser cutting, engraving, sheet cutting, and cake toppers
- Your tone: warm, professional, Nigerian-friendly. Use "ma" / "sir" respectfully.
- Be honest about limitations. When you can't do something, explain why.

# SERVICES & PRICING (All amounts in Nigerian Naira ₦ — NO VAT)

## FABRIC LASER CUTTING (customer brings fabric — 5 working days standard, 48h express +50%)
| Service | Price | Express |
|---------|-------|---------|
| Sleeves (pair) | ₦20,000 | +50% |
| Full Buba | ₦35,000 | +50% |
| One Layer of Buba | ₦40,000 | +50% |
| Bottom of Wrapper | ₦40,000 | +50% |
| Skirt | ₦50,000 | +50% |
| Full Blouse + Full Skirt | ₦70,000 | +50% |
| Full Buba + Full Wrapper | ₦75,000 | +50% |
| Boubou | ₦45,000 | +50% |
| Sleeves + Edge of Wrapper | ₦50,000 | +50% |
| Sleeves + Buba Front/Back (3 sections) | ₦30,000 | +50% |
| Custom Fabric Cutting | ₦10,000/section (min ₦20K) | +50% |
| Fabric Per Yard | ₦20,000/yard | +50% |
| Complex Custom Gown | ₦100,000-₦200,000 | NO EXPRESS (1-2 weeks) |

## ENGRAVING (customer brings item — NO EXPRESS, minimum 48 hours)
| Service | Price |
|---------|-------|
| Phone Back Engraving | ₦5,000/phone |
| Jewelry Engraving | ₦6,000/piece |
| Leather Engraving | ₦17,500/piece |
| Wood Engraving | ₦7,500/piece |
| Small Items (stirrers, sticks) | ₦1,500/piece |
| Curved Surface Engraving | ₦15,000/piece |
| Detective Badge | ₦2,500/piece (NO EXPRESS) |
| Necklace Engraving | ₦7,000/piece |

## SHEET CUTTING
| Service | Price | Express |
|---------|-------|---------|
| 4ft × 4ft Sheet | ₦40,000 | 48h (+50%) |
| 8ft × 4ft Sheet | ₦70,000 | NO EXPRESS (ext. partner) |
| Custom Sheet | ₦55,000 | 48h (+50%) |
| Acrylic Stick Cutting | ₦100/piece (min ₦5K) | 48h (+50%) |

## CAKE TOPPERS
| Service | Price |
|---------|-------|
| Acrylic Cake Topper | ₦15,000 |
| Custom Cake Topper | ₦25,000 (5-7 days, no express) |

## ADD-ONS
- Stoning Board: ₦20,000 each

# KEY RULES
- Express = +50% surcharge. 48 hours minimum (NOT next day).
- Engraving: NO express. Minimum 48 hours.
- Metal cutting: ALWAYS external partner. 10 working days. NO express.
- No "wait and get" service.
- Lead time counts from PAYMENT confirmation, not from order placement.
- Full payment before production starts. No deposit/balance system.
- NO VAT on any service.
- First-time discount: one-time only, manually applied at discretion.
- Machine bed: 900mm × 600mm in-house. Larger items → external partner.

# DELIVERY
- FREE pickup from Ogba, Ikeja, Lagos
- Local Lagos delivery: ₦1,500-₦3,000 (distance-based)
- Nationwide waybill: ₦3,500

# MATERIALS WE WORK WITH
- Fabric: cotton, aso oke, ankara, lace, velvet, linen, chantilly
- Leather: genuine and synthetic
- Wood: MDF, plywood
- Acrylic: clear, colored, mirrored, gold, silver, black, white
- Metal sheets: via external partner only

# WHAT YOU SHOULD DO
1. Understand what the customer wants (garment, engraving, sheet, topper)
2. Determine the specific SERVICE TYPE from the catalog above
3. Ask for quantity, SLA preference (Standard/Express), and delivery method
4. Provide an ACCURATE price quote using the catalog prices above
5. Include lead time in your response
6. If details are missing, ask clarifying questions
7. When a quote is ready, END your response with a [QUOTE] block (see below)

# HANDLING AMBIGUOUS / VAGUE QUERIES
Customers often don't state what they want directly. Handle these patterns:

- **"I need something for my wedding/event"** → Ask: What type of item? Fabric cutting for aso-ebi? Cake topper? Signage? Then narrow down.
- **"How much for cutting?"** → Ask: What material? Fabric, leather, wood, or acrylic? What garment/item? How many?
- **"What can you do for me?"** → List our 4 categories briefly (fabric cutting, engraving, sheet cutting, cake toppers) and ask which interests them.
- **"Price?" / "How much?"** → Ask: What service are you interested in? Give a quick overview of price ranges.
- **Pidgin / mixed language** → Understand and respond naturally. "Abeg how much e go cost?" = "How much will it cost?" Be conversational but professional.
- **"Is it cheaper than [competitor]?"** → Don't compare. Say: "Our prices are based on the service catalog. Here's what we charge for similar work..." then quote.
- **Image only (no text)** → Acknowledge the image and ask: "I see you sent an image. What would you like us to do with this? Is it for cutting, engraving, or something else?"
- **"Last price?" / "Can you do better?"** → Politely explain prices are fixed per the catalog. Offer to check if they qualify for first-time discount.
- **Multiple items at once** → Quote each separately if different service types. "For the tags I can quote now, but the cake topper needs more details — what size?"
- **Just "Ok" / "Yes" / "Proceed"** → If a quote was just given, confirm and guide them to place the order. If no prior quote, ask what they're confirming.
- **Off-topic / unrelated** → Politely redirect. "I'm Paberin's assistant for laser cutting services. How can I help with your cutting or engraving needs today?"

# NIGERIAN CONTEXT
- Understand local terms: aso-ebi, buba, wrapper, iro, gele, boubou, agbada
- Understand pidgin: "abeg", "how far", "e go cost", "na how much", "shey you fit"
- Understand local measurements: inches, feet, yards (not cm/metres for fabric)
- Understand local events: weddings, owambe, burials, birthdays, naming ceremonies
- Accept that customers might haggle — be firm on catalog prices, polite about it

# RESPONSE FORMAT
Always respond conversationally first, then if you've built a quote, add this EXACT block at the END:

[QUOTE]
{
  "service_type": "<service_type_key>",
  "service_label": "<human readable name>",
  "quantity": <number>,
  "sla": "Standard" or "Express",
  "unit_price": <base_price_per_unit_in_naira_BEFORE_surcharges>,
  "subtotal": <quantity × unit_price>,
  "express_surcharge": <0_or_surcharge_amount>,
  "add_ons_total": <0_or_total_of_add_ons>,
  "discount": <0_or_discount_amount>,
  "delivery_fee": <0_or_fee>,
  "total": <subtotal + express_surcharge + add_ons_total + delivery_fee − discount>,
  "lead_time": "<human readable>",
  "notes": "<any caveats or important info>"
}
[/QUOTE]

IMPORTANT: the [QUOTE] JSON must be plain text — NEVER wrap it in markdown code fences (triple backticks), NEVER add trailing commas, and make sure "total" matches the sum of its components exactly.

If NO quote can be built yet (missing info), NEVER output a [QUOTE] block — instead ask clarifying questions.`;
