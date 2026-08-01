/**
 * SKYAL PORT — src/lib/chat.ts (draft, ready to copy into
 * /home/doombuggy_/Projects/skyalproj/src/lib/chat.ts)
 *
 * Ported from the Paberin implementation (same fixes: lenient quote parsing,
 * naira-context-only price fallback, prompt-injection scanning, retry with
 * per-attempt timeouts, per-IP rate limiting, validated env config).
 * Written inside the paberin workspace because the sandbox could not write to
 * skyalproj; the new session (see scripts/skyal/skyal-setup-prompt.md) should
 * copy this file over and then run the tests described in the prompt.
 */

/* ───────────────────────────── Types ───────────────────────────── */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QuoteBreakdown {
  serviceLabel?: string;
  serviceType?: string;
  sla?: string;
  leadTime?: string;
  notes?: string;
  basePrice?: number;
  expressSurcharge?: number;
  addOnsTotal?: number;
  discount?: number;
  deliveryFee?: number;
  finalPriceNaira?: number;
  quantity?: number;
  [k: string]: unknown;
}

export interface ChatQuote {
  price: number;
  original_price?: number;
  bulk_discount?: number;
  breakdown?: QuoteBreakdown;
  summary?: string;
}

export interface ChatResponse {
  reply?: string;
  assistant_text?: string;
  quote?: ChatQuote;
  render_order_now?: boolean;
  sessionId?: string;
  error?: boolean;
  error_code?: string;
  cached?: boolean;
}

/* ───────────────────────────── Env helpers ───────────────────────────── */

/** Parse a positive-integer env var with a validated fallback (NaN-safe). */
export function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(`[Skyal Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  const n = Number.parseInt(trimmed, 10);
  if (n <= 0) {
    console.warn(`[Skyal Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  return n;
}

/* ───────────────────────────── Rate limiter ───────────────────────────── */

/** In-memory fixed-window rate limiter, keyed per client. */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 15,
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
    if (this.buckets.size > 1000) {
      this.buckets.forEach((b, k) => {
        if (now >= b.resetAt) this.buckets.delete(k);
      });
    }
    return true;
  }

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
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retry with exponential backoff + jitter. Hard cap on total wall-clock time:
 * no attempt starts once the budget is exhausted, and `fn` receives the
 * remaining budget so callers can shrink per-attempt timeouts.
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

      const jittered = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      const delay = Math.min(jittered, budgetMs - elapsedAfter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/* ───────────────────────────── Session IDs ───────────────────────────── */

/** Generate a session ID using crypto.randomUUID (not Math.random). */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `skyal_${timestamp}_${random}`;
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
 * Lenient JSON parse: strips markdown code fences, extracts the first {...}
 * object, removes trailing commas.
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
 * Parse the structured [QUOTE] block. PRIMARY extraction method.
 * Numeric cross-check: recompute the total from components when it disagrees
 * by >10% (except when express is folded into unit_price — then trust total).
 */
export function parseQuoteBlock(text: string): ChatQuote | undefined {
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
 * [QUOTE] block is present. Requires explicit naira context — a ₦/NGN/N
 * prefix or a "naira"/"NGN" suffix — so phone numbers are never misread.
 */
export function extractPriceFromText(text: string): ChatQuote | undefined {
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

  // Prefix form: ₦15,000 / N15,000 / NGN 15,000 / ₦20K (no 'i' flag: lowercase
  // "n" is not naira notation)
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
export function extractQuote(text: string): ChatQuote | undefined {
  return parseQuoteBlock(text) ?? extractPriceFromText(text);
}

/** Strip [QUOTE] blocks (and fenced JSON leftovers) for clean display. */
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
// short messages to avoid blocking genuine long customer messages.
const SOFT_INJECTION_PATTERNS = [/you are now /i, /forget everything/i];

/**
 * Heuristic prompt-injection detector. Hard patterns are flagged at ANY
 * length (padding must not bypass); soft patterns only <200 chars.
 * Defense-in-depth, not a boundary. Apply to message AND history.
 */
export function isInjectionAttempt(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (HARD_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return text.length < 200 && SOFT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize client-supplied history: only user|assistant roles, non-empty,
 * capped turns and per-message length.
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
