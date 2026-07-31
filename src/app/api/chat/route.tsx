/**
 * Chat API Route — Paberin AI Assistant v2.0
 * ============================================
 * Powered by Agnes 2.0 Flash (512K context, tool calling).
 *
 * ARCHITECTURE:
 *   Paberin frontend → POST /api/chat → Agnes 2.0 Flash → structured response
 *
 * KEY IMPROVEMENTS OVER v1:
 *   - Rich system prompt with complete Paberin service catalog & pricing
 *   - Structured JSON output mode for deterministic price extraction
 *   - Session persistence (UUID generated, returned to client)
 *   - Quote breakdown passed to order form via structured response
 *   - Proper error classification (timeout vs auth vs rate-limit vs model)
 *   - Multi-turn conversation context tracking
 *   - Nigerian-friendly tone calibration
 *
 * Features:
 *   - Fetch timeout with configurable timeout (default 30s)
 *   - Retry logic with exponential backoff for transient errors
 *   - Rate limiting (per-window, configurable)
 *   - Proper error handling and fallbacks
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChatRequestBody, ChatResponse } from '@/lib/api';

// Agnes API configuration
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const CHAT_MODE = process.env.CHAT_MODE || 'live'; // 'live' or 'mock'
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

// Configuration for robustness
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '30000', 10); // 30s default
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const RETRY_BASE_DELAY = parseInt(process.env.RETRY_BASE_DELAY || '1000', 10); // ms
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // 1min default

if (CHAT_MODE === 'live' && !AGNES_API_KEY) {
  throw new Error('AGNES_API_KEY environment variable is required in live mode');
}

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Complete Paberin service catalog with accurate pricing
// ═══════════════════════════════════════════════════════════════════════

const PABERIN_SYSTEM_PROMPT = `You are Paberin's AI Assistant — the friendly, knowledgeable voice of Paberin Creations, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

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
  "unit_price": <price_per_unit_in_naira>,
  "subtotal": <quantity × unit_price>,
  "express_surcharge": <0_or_surcharge_amount>,
  "delivery_fee": <0_or_fee>,
  "total": <final_price_in_naira>,
  "lead_time": "<human readable>",
  "notes": "<any caveats or important info>"
}
[/QUOTE]

If NO quote can be built yet (missing info), NEVER output a [QUOTE] block — instead ask clarifying questions.`;

// ═══════════════════════════════════════════════════════════════════════

/**
 * Agnes 2.0 Flash model response
 */
interface AgnesChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: [
    {
      index: number;
      message: { role: string; content: string; finish_reason: string };
    }
  ];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Simple in-memory rate limiter.
 * For multi-instance deployments, replace with Redis-based limiter.
 */
class RateLimiter {
  private requestCount = 0;
  private lastReset = Date.now();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW) {
    this.max = max;
    this.windowMs = windowMs;
  }

  acquire(): boolean {
    const now = Date.now();
    if (now - this.lastReset > this.windowMs) {
      this.requestCount = 0;
      this.lastReset = now;
    }
    if (this.requestCount >= this.max) {
      return false;
    }
    this.requestCount++;
    return true;
  }

  reset(): void {
    this.requestCount = 0;
    this.lastReset = Date.now();
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);

/**
 * Retry an async operation with exponential backoff + jitter.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  baseDelay = RETRY_BASE_DELAY
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter: 1s → 2s → 4s + random
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Generate a unique session ID for conversation tracking.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `pab_${timestamp}_${random}`;
}

/**
 * Parse structured [QUOTE] block from Agnes response.
 * This is the PRIMARY price extraction method — deterministic JSON parsing.
 */
function parseQuoteBlock(text: string): ChatResponse['quote'] | undefined {
  const quoteRegex = /\[QUOTE\]\s*([\s\S]*?)\s*\[\/QUOTE\]/;
  const match = text.match(quoteRegex);

  if (!match) return undefined;

  try {
    const quoteData = JSON.parse(match[1].trim());

    if (!quoteData.total || quoteData.total <= 0) return undefined;

    return {
      price: quoteData.total,
      original_price: quoteData.original_price,
      bulk_discount: quoteData.bulk_discount,
      breakdown: {
        serviceLabel: quoteData.service_label,
        basePrice: quoteData.unit_price,
        expressSurcharge: quoteData.express_surcharge || 0,
        addOnsTotal: quoteData.add_ons_total || 0,
        discount: quoteData.discount || 0,
        deliveryFee: quoteData.delivery_fee || 0,
        finalPriceNaira: quoteData.total,
        quantity: quoteData.quantity,
      },
      summary: `${quoteData.service_label || 'Service'}: ${quoteData.quantity || 1}× ₦${(quoteData.unit_price || quoteData.total).toLocaleString('en-NG')} = ₦${quoteData.total.toLocaleString('en-NG')}. ${quoteData.lead_time || ''}`.trim(),
    };
  } catch {
    // JSON parse failed — fall through to regex extraction
  }

  return undefined;
}

/**
 * FALLBACK: Extract price from text using regex pattern matching.
 * Used only when structured [QUOTE] block parsing fails.
 */
function extractPriceFromText(text: string): ChatResponse['quote'] | undefined {
  const nairaWithSymbolPattern = /₦?([\d,]+\.?\d*)/g;
  const matches = text.match(nairaWithSymbolPattern);

  if (!matches) return undefined;

  let bestPrice: number | undefined;
  let bestMatch: string | null = null;

  for (const match of matches) {
    const priceStr = match.replace(/₦|,/g, '');
    const price = parseFloat(priceStr);

    if (bestPrice === undefined || price > bestPrice) {
      bestPrice = price;
      bestMatch = match;
    }
  }

  if (bestPrice !== undefined && bestPrice > 0) {
    return {
      price: bestPrice,
      original_price: undefined,
      bulk_discount: undefined,
      breakdown: undefined,
      summary: `Estimated price: ₦${bestPrice.toLocaleString('en-NG')}`,
    };
  }

  return undefined;
}

/**
 * Strip [QUOTE] blocks from the assistant text for clean display.
 */
function cleanAssistantText(text: string): string {
  return text.replace(/\[QUOTE\][\s\S]*?\[\/QUOTE\]/g, '').trim();
}

/**
 * Fire-and-forget: save the chat session to the admin backend so admins can
 * view customer conversations in /admin/chats. Best-effort — failures are
 * silently swallowed to avoid affecting the customer experience.
 */
async function saveSessionToAdmin(params: {
  sessionId: string;
  brand: string;
  messages: { role: string; content: string }[];
  customerPhone?: string;
}): Promise<void> {
  try {
    await fetch(`${ADMIN_API_URL}/api/skyal/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.messages[params.messages.length - 1]?.content || '',
        brand: params.brand,
        mode: 'live', // Admin will process through its LLM + save to DB
        history: params.messages.slice(0, -1),
        sessionId: params.sessionId,
      }),
      // Short timeout — we don't want to block the customer waiting for admin save
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort: admin save failure must not affect the customer
    console.warn('[Paberin Chat] Admin session save failed (non-critical)');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Parse incoming request body
    const body = await request.json();
    let { message, history, brand = 'paberin', mode = 'live', sessionId: incomingSessionId } = body;

    // ── Input validation & sanitization ──
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required', message: 'Please type a message to chat with the assistant.' },
        { status: 400 }
      );
    }

    message = message.trim();

    // Reject excessively long messages (512K context, but single messages shouldn't abuse it)
    if (message.length > 8000) {
      return NextResponse.json(
        { error: 'Message too long', message: 'Please keep your message under 8,000 characters. Try breaking it into smaller parts.' },
        { status: 400 }
      );
    }

    // Reject messages that look like prompt injection / system override attempts
    const injectionPatterns = [
      /^system:\s*/im,
      /^\[system\]\s*/im,
      /ignore (all |your )?(previous |prior )?instructions/i,
      /you are now /i,
      /forget everything/i,
      /override your /i,
    ];
    for (const pattern of injectionPatterns) {
      if (pattern.test(message) && message.length < 200) {
        // Short messages matching injection patterns — likely an attack
        return NextResponse.json(
          { error: 'Invalid message', message: 'I can only help with questions about Paberin laser cutting services.' },
          { status: 400 }
        );
      }
    }

    // Sanitize history: max 50 turns, strip empty content, strip long messages
    const sanitizedHistory = (history || [])
      .filter((m: any) => m?.role && m?.content && typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-50)
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content.trim().slice(0, 4000), // Cap each history message
      }));

    // Detect repeated identical messages (spam / stuck retry)
    const lastUserMsg = sanitizedHistory.filter((m: any) => m.role === 'user').pop();
    if (lastUserMsg && lastUserMsg.content === message) {
      // Same message sent twice — still process, but don't penalize
      // The AI should notice the repeat and ask what's different this time
    }

    // Generate or reuse session ID for conversation continuity
    const sessionId = incomingSessionId || generateSessionId();

    // ── Mock mode (no API key needed) ──
    if (CHAT_MODE === 'mock') {
      const response: ChatResponse = {
        assistant_text: `[MOCK MODE] I'd normally connect to Agnes 2.0 Flash to answer: "${message}". Set AGNES_API_KEY in .env.local and CHAT_MODE=live for real AI responses.`,
        tool_calls: [],
        tool_results: [],
        latency_ms: 5,
        customer_type: 'paberin',
        confidence: 0.85,
        quote: undefined,
        render_order_now: false,
        confidence_blocked: false,
        sessionId,
        error: undefined,
      };
      return NextResponse.json(response);
    }

    // ── Build messages for Agnes ──
    const agnesMessages = [
      {
        role: 'system' as const,
        content: PABERIN_SYSTEM_PROMPT,
      },
      ...sanitizedHistory.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // ── Rate limit check ──
    if (!rateLimiter.acquire()) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again later. Limit: ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW / 1000} seconds.`,
        },
        { status: 429 }
      );
    }

    // ── Call Agnes 2.0 Flash with timeout + retry ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const fetchStartTime = performance.now();

    const fetchWithTimeoutAndRetry = async () => {
      const response = await fetch(AGNES_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'agnes-2.0-flash',
          messages: agnesMessages,
          temperature: 0.5, // Balanced: creative enough for natural chat, deterministic enough for quotes
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    };

    let agnesResponse: Response;
    try {
      agnesResponse = await retryWithBackoff(fetchWithTimeoutAndRetry, MAX_RETRIES, RETRY_BASE_DELAY);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Agnes API request timed out after ${FETCH_TIMEOUT}ms`);
      }
      throw error;
    }

    const fetchLatency = Math.floor(performance.now() - fetchStartTime);

    // ── Handle API errors ──
    if (!agnesResponse.ok) {
      const errorText = await agnesResponse.text().catch(() => 'Unknown error');
      const status = agnesResponse.status;

      // Classify errors for better debugging
      if (status === 401 || status === 403) {
        throw new Error(`Agnes API authentication error (${status}). Check AGNES_API_KEY.`);
      }
      if (status === 429) {
        throw new Error(`Agnes API rate limit exceeded (429). Try again in a few seconds.`);
      }
      if (status >= 500) {
        throw new Error(`Agnes API server error (${status}). The model may be temporarily unavailable.`);
      }

      throw new Error(`Agnes API error: ${status} - ${errorText.substring(0, 200)}`);
    }

    // ── Parse response ──
    const data: AgnesChatResponse = await agnesResponse.json();
    const rawAssistantText = data.choices[0]?.message?.content || '';

    // ── Extract quote (structured [QUOTE] block first, regex fallback) ──
    const quote = parseQuoteBlock(rawAssistantText) ?? extractPriceFromText(rawAssistantText);

    // ── Clean display text (remove [QUOTE] blocks) ──
    const assistantText = cleanAssistantText(rawAssistantText);

    // ── Build response ──
    const response: ChatResponse = {
      assistant_text: assistantText,
      tool_calls: [],
      tool_results: [],
      latency_ms: fetchLatency,
      customer_type: 'paberin',
      confidence: quote ? 0.95 : 0.85,
      quote: quote,
      render_order_now: quote !== undefined,
      confidence_blocked: false,
      sessionId,
      error: undefined,
    };

    // ── Fire-and-forget: save session to admin backend for admin viewing ──
    // Don't await — we respond to the customer immediately
    const allMessages = [
      ...sanitizedHistory.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
      { role: 'assistant', content: assistantText },
    ];
    saveSessionToAdmin({
      sessionId,
      brand: brand || 'paberin',
      messages: allMessages,
    }).catch(() => {}); // Explicitly swallow — must not throw

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Paberin Chat API] Error:', error?.message || error);

    // Return a graceful error the frontend can display
    const friendlyMessage = error?.message?.includes('timed out')
      ? "I'm taking a bit longer than usual. Please try again in a moment."
      : error?.message?.includes('rate limit')
        ? "We're experiencing high demand. Please try again shortly."
        : error?.message?.includes('authentication')
          ? "The assistant is temporarily unavailable. Please try again later or call 0803 500 3068."
          : "I couldn't process that right now. Please try again, or call us at 0803 500 3068.";

    return NextResponse.json(
      {
        error: 'Failed to process chat request',
        message: friendlyMessage,
        detail: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

export const runtime = 'edge';