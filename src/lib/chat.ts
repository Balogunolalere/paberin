/**
 * Paberin Chat — shared pure logic for the /api/chat route.
 *
 * Extracted from the route handler so the exact same code that runs in
 * production is what the unit tests exercise (previously the tests kept a
 * private copy that could drift from the implementation).
 *
 * Pricing design (spec): the AI NEVER prices. It extracts a structured
 * [SPECS] block; the route resolves it against the admin pricing engine and
 * shows the ENGINE's price. The model has no price tables.
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

/* ───────────────────────────── Specs parsing ───────────────────────────── */

const SPECS_REGEX = /\[SPECS\]\s*([\s\S]*?)\s*\[\/SPECS\]/;

/** Structured request extracted by the assistant — NEVER contains a price. */
export interface ChatSpecs {
  service_type: string | null;
  custom_description?: string;
  material?: string;
  quantity: number;
  sla?: 'Standard' | 'Express';
  delivery?: 'PICKUP' | 'LOCAL_DELIVERY';
  delivery_address?: string;
  needs_design_upload?: boolean;
}

/**
 * Lenient JSON parse for model output: strips markdown code fences
 * (```json ... ```), extracts the first {...} object, and removes trailing
 * commas — the two most common ways LLM JSON output fails strict JSON.parse.
 */
export function parseLenientJson(raw: string): Record<string, unknown> | undefined {
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

/** Coerce a model-provided value to a positive integer (defaults to 1). */
function toQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,₦\s]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 1;
}

/**
 * Parse the structured [SPECS] block from the assistant text.
 * The model extracts WHAT the customer wants; the pricing engine decides
 * WHAT IT COSTS. Returns undefined when no valid [SPECS] block is present.
 */
export function parseSpecsBlock(text: string): ChatSpecs | undefined {
  const match = text.match(SPECS_REGEX);
  if (!match) return undefined;

  const q = parseLenientJson(match[1]);
  if (!q) return undefined;

  const serviceType =
    typeof q.service_type === 'string' && q.service_type.trim()
      ? q.service_type.trim().toLowerCase()
      : null;

  const deliveryRaw = typeof q.delivery === 'string' ? q.delivery.trim().toUpperCase() : '';
  const delivery = deliveryRaw === 'LOCAL_DELIVERY' || deliveryRaw === 'PICKUP' ? (deliveryRaw as ChatSpecs['delivery']) : undefined;
  const slaRaw = typeof q.sla === 'string' ? q.sla.trim().toLowerCase() : '';
  const sla = slaRaw === 'express' ? ('Express' as const) : slaRaw === 'standard' ? ('Standard' as const) : undefined;

  return {
    service_type: serviceType,
    custom_description: typeof q.custom_description === 'string' ? q.custom_description.trim().slice(0, 1000) : undefined,
    material: typeof q.material === 'string' ? q.material.trim().slice(0, 200) : undefined,
    quantity: toQuantity(q.quantity),
    sla,
    delivery,
    delivery_address: typeof q.delivery_address === 'string' ? q.delivery_address.trim().slice(0, 500) : undefined,
    needs_design_upload: q.needs_design_upload === true,
  };
}

/**
 * Strip [SPECS] blocks (and any markdown-fenced JSON leftovers) from the
 * assistant text for clean display.
 */
export function cleanAssistantText(text: string): string {
  return text
    .replace(/\[SPECS\][\s\S]*?\[\/SPECS\]/g, '')
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
 * tests can assert the prompt contract directly.
 *
 * PRICING CONTRACT: the model never states a price and never receives a price
 * list. It extracts [SPECS]; the route computes the exact price with the
 * admin pricing engine and appends it to the reply.
 */
export const PABERIN_SYSTEM_PROMPT = `You are Paberin's AI Assistant — the friendly, knowledgeable voice of Paberin Creations, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

# YOUR IDENTITY
- You represent Paberin Creations (sister brand to Skyal Laser Services)
- You help customers with laser cutting, engraving, sheet cutting, and cake toppers
- Your tone: warm, professional, Nigerian-friendly. Use "ma" / "sir" respectfully.
- Be honest about limitations. When you can't do something, explain why.

# WHAT YOU DO
You turn a customer's request into a structured order. You NEVER quote prices —
the system computes the exact price and shows it to the customer automatically.

# WHAT WE DO (categories)
- FABRIC LASER CUTTING — customer brings the fabric (aso-ebi, buba, wrapper, skirt, gown, sleeves, boubou, jeans, ankara, lace, per-yard, custom sections)
- ENGRAVING — customer brings the item (phone backs, jewelry, leather, wood items, necklaces, badges, small items, curved surfaces)
- SHEET CUTTING — acrylic / wood / mirror (in-house 900×600mm bed; larger sheets via external partner, 10 working days, no express)
- CAKE TOPPERS — acrylic, mirror, wood, custom (5–7 days)
- PRINTED ITEMS — cards, tags, labels
- ACRYLIC STICKS — sticks/straws for toppers, signage, floral

# KEY RULES
- Express = faster turnaround with a surcharge. NOT available for: engraving, complex custom gowns, external-partner sheet work. Minimum 48 hours.
- Lead time counts from PAYMENT confirmation, not from order placement.
- Full payment before production starts. No deposit/balance system.
- NO VAT on any service.
- Machine bed: 900mm × 600mm in-house. Larger items → external partner.

# DELIVERY
- FREE pickup from Ogba, Ikeja, Lagos
- Local Lagos delivery (fee applies)
- Nationwide waybill (fee applies)

# WHAT YOU SHOULD DO
1. Understand what the customer wants (garment, engraving, sheet, topper, printed, sticks).
2. Extract the exact spec: the item/garment, the MATERIAL, the QUANTITY, SLA preference (Standard/Express) if they mention a rush, and the DELIVERY method (pickup or local delivery + address).
3. If details are missing, ask clarifying questions — do NOT guess material, quantity, or delivery.
4. When the spec is complete, END your response with a [SPECS] block (see below).
5. If the job clearly matches a catalog category (fabric garment, engraving item, topper, sheet, signage, printed card/tag, sticks), set "service_type" to the closest catalog type key. Use the type keys EXACTLY as listed:
   - Fabric: paberin_fabric_sleeves, paberin_fabric_buba, paberin_fabric_buba_layer, paberin_fabric_wrapper, paberin_fabric_skirt, paberin_fabric_blouse_skirt, paberin_fabric_buba_wrapper, paberin_fabric_boubou, paberin_fabric_sleeves_wrapper, paberin_fabric_sleeves_buba, paberin_fabric_per_yard, paberin_fabric_custom (custom fabric job), paberin_fabric_complex_gown
   - Engraving: paberin_engraving_phone, paberin_engraving_jewelry, paberin_engraving_leather, paberin_engraving_wood, paberin_engraving_small_item, paberin_engraving_curved, paberin_engraving_badge, paberin_engraving_necklace
   - Toppers: paberin_topper_acrylic, paberin_topper_mirror, paberin_topper_wood, paberin_topper_custom
   - Signage: paberin_signage_acrylic, paberin_signage_mirror
   - Sheets: paberin_sheet_cutting (in-house), paberin_sheet_oversize (external), paberin_sheet_custom
   - Printed: paberin_printed_card, paberin_printed_tag
   - Sticks: paberin_acrylic_sticks
6. If the job does NOT clearly match any of those types (e.g. "cut my jeans into a pattern" — that's custom fabric work, so paberin_fabric_custom), set "service_type" to null and describe it in "custom_description" instead. Never force a wrong type.
7. If the customer asks for a price, answer: "Let me confirm the exact price for you" and emit the [SPECS] block — the system shows the exact price.

# HANDLING AMBIGUOUS / VAGUE QUERIES
- **"I need something for my wedding/event"** → Ask: What type of item? Fabric cutting for aso-ebi? Cake topper? Signage? Then narrow down.
- **"How much for cutting?"** → Ask: What material? Fabric, leather, wood, or acrylic? What garment/item? How many?
- **"What can you do for me?"** → List the categories briefly and ask which interests them.
- **"Price?" / "How much?"** → Ask what they want; then extract specs and let the system show the exact price.
- **Pidgin / mixed language** → Understand and respond naturally. Be conversational but professional.
- **"Is it cheaper than [competitor]?"** → Don't compare prices. Say: "I'll confirm our exact price for your job." then extract specs.
- **"Last price?" / "Can you do better?"** → Prices are fixed and computed automatically; you cannot discount.
- **Multiple items at once** → Ask which item to quote first, or extract the primary one.
- **Just "Ok" / "Yes" / "Proceed"** → If specs were just extracted, confirm and guide them to place the order. If no specs yet, ask what they're confirming.
- **Off-topic / unrelated** → Politely redirect to laser cutting/engraving services.

# NIGERIAN CONTEXT
- Understand local terms: aso-ebi, buba, wrapper, iro, gele, boubou, agbada
- Understand pidgin: "abeg", "how far", "e go cost", "na how much", "shey you fit"
- Understand local measurements: inches, feet, yards (not cm/metres for fabric)
- Understand local events: weddings, owambe, burials, birthdays, naming ceremonies

# RESPONSE FORMAT
Always respond conversationally first, then if you've extracted the full spec, add this EXACT block at the END:

[SPECS]
{
  "service_type": "<catalog type key> or null",
  "custom_description": "<the customer's job in their own words, only when service_type is null>",
  "material": "<material if known>",
  "quantity": <number>,
  "sla": "Standard" or "Express" (omit if not discussed),
  "delivery": "PICKUP" or "LOCAL_DELIVERY" (omit if not discussed),
  "delivery_address": "<address, only when delivery is LOCAL_DELIVERY>",
  "needs_design_upload": true or false
}
[/SPECS]

IMPORTANT: the [SPECS] JSON must be plain text — NEVER wrap it in markdown code fences (triple backticks), NEVER add trailing commas, and NEVER include any price or amount anywhere in the block.

If the spec is NOT complete yet (missing info), NEVER output a [SPECS] block — instead ask clarifying questions.`;
