/**
 * Chat API Route — Paberin AI Assistant
 * =====================================
 * Powered by Agnes 2.0 Flash (512K context, tool calling).
 *
 * ARCHITECTURE:
 *   Paberin frontend → POST /api/chat → Agnes 2.0 Flash → structured response
 *
 * KEY FEATURES:
 *   - Rich system prompt with complete Paberin service catalog & pricing
 *   - [QUOTE] block extraction with lenient JSON parsing (code fences,
 *     trailing commas) plus a numeric cross-check that recomputes the total
 *     from its components when the model's arithmetic is inconsistent
 *   - Naira-context-only regex fallback — phone numbers and dates are never
 *     misread as prices
 *   - Session persistence (session ID generated, returned to client)
 *   - Quote breakdown passed to order form via structured response
 *   - Error classification (timeout vs auth vs rate-limit vs model)
 *   - Multi-turn conversation context tracking (sanitized client history)
 *   - Nigerian-friendly tone calibration
 *
 * Robustness:
 *   - Per-attempt fetch timeout (default 30s) — each attempt gets a FRESH
 *     AbortController so a timed-out attempt never poisons the retries
 *   - Retry only on transient failures (network, timeout, 408/429/5xx),
 *     exponential backoff + jitter, capped by a total time budget (60s)
 *   - Per-IP rate limiting (in-memory; swap for Redis on multi-instance)
 *   - Input validation + prompt-injection heuristics on the message AND the
 *     client-supplied history
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChatResponse } from '@/lib/api';
import {
  RateLimiter,
  retryWithBackoff,
  parseEnvInt,
  generateSessionId,
  extractQuote,
  cleanAssistantText,
  sanitizeHistory,
  isInjectionAttempt,
  PABERIN_SYSTEM_PROMPT,
} from '@/lib/chat';

// Agnes API configuration
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const CHAT_MODE = process.env.CHAT_MODE || 'live'; // 'live' or 'mock'
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

// Robustness configuration — validated; invalid env values fall back to defaults
const FETCH_TIMEOUT = parseEnvInt('FETCH_TIMEOUT', 20000); // per-attempt timeout in ms
const MAX_RETRIES = parseEnvInt('MAX_RETRIES', 2);
const RETRY_BASE_DELAY = parseEnvInt('RETRY_BASE_DELAY', 1000); // ms
const TOTAL_BUDGET_MS = parseEnvInt('TOTAL_TIMEOUT', 45000); // cap across all attempts
const RATE_LIMIT_MAX = parseEnvInt('RATE_LIMIT_MAX', 100);
const RATE_LIMIT_WINDOW = parseEnvInt('RATE_LIMIT_WINDOW', 60000); // 1min default

// Short in-memory response cache so repeated questions (e.g. after a
// timeout) don't re-hit the slow LLM and trip the platform's 504.
import { chatCacheGet, chatCacheSet } from '@/lib/chat-cache';

if (CHAT_MODE === 'live' && !AGNES_API_KEY) {
  throw new Error('AGNES_API_KEY environment variable is required in live mode');
}


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

/** Error carrying an HTTP status from the Agnes API (used to decide retries). */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Statuses worth retrying — everything else is a hard failure. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) return RETRYABLE_STATUS.has(error.status);
  if (error instanceof Error) {
    // AbortError = our per-attempt timeout fired; TimeoutError = upstream timeout;
    // TypeError = network-level fetch failure (DNS, connection reset, …)
    return error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError';
  }
  return false;
}

/**
 * Simple in-memory rate limiter, keyed per client IP.
 * For multi-instance deployments, replace with Redis-based limiter.
 */
const rateLimiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${ADMIN_API_URL}/api/skyal/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.messages[params.messages.length - 1]?.content || '',
        brand: params.brand,
        mode: 'live', // Admin will process through its own LLM + save to DB
        history: params.messages.slice(0, -1),
        sessionId: params.sessionId,
      }),
      // Short timeout — we don't want to block the customer waiting for admin save
      signal: controller.signal,
    });
  } catch {
    // Best-effort: admin save failure must not affect the customer
    console.warn('[Paberin Chat] Admin session save failed (non-critical)');
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Parse incoming request body
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body', message: 'Please send a valid JSON body.' },
        { status: 400 }
      );
    }
    const {
      message: rawMessage,
      history,
      brand = 'paberin',
      sessionId: incomingSessionId,
    } = body as Record<string, unknown>;

    // ── Input validation & sanitization ──
    if (typeof rawMessage !== 'string' || rawMessage.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required', message: 'Please type a message to chat with the assistant.' },
        { status: 400 }
      );
    }

    const message = rawMessage.trim();

    // Reject excessively long messages (512K context, but single messages shouldn't abuse it)
    if (message.length > 8000) {
      return NextResponse.json(
        { error: 'Message too long', message: 'Please keep your message under 8,000 characters. Try breaking it into smaller parts.' },
        { status: 400 }
      );
    }

    // Sanitize history: max 50 turns, strip empty content, strip long messages
    const sanitizedHistory = sanitizeHistory(history);

    // Reject messages that look like prompt injection / system override attempts.
    // History is fully client-controlled, so it must be scanned too — an attacker
    // can otherwise smuggle instructions in via history and bypass the check.
    const injected =
      isInjectionAttempt(message) ||
      sanitizedHistory.some((m) => m.role === 'user' && isInjectionAttempt(m.content));
    if (injected) {
      return NextResponse.json(
        { error: 'Invalid message', message: 'I can only help with questions about Paberin laser cutting services.' },
        { status: 400 }
      );
    }

    // Generate or reuse session ID for conversation continuity
    const sessionId =
      typeof incomingSessionId === 'string' && incomingSessionId.length <= 128
        ? incomingSessionId
        : generateSessionId();

    // ── Rate limit check (per client IP) ──
    // Use the LAST x-forwarded-for entry: proxies append the client IP, so the
    // rightmost entry is the one closest to this server and the least
    // attacker-influenceable among the entries (on Vercel it is set by the
    // platform itself). Note: this limiter is a blunt per-instance instrument,
    // not a hard security boundary.
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = (forwardedFor ? forwardedFor.split(',') : []).map((s) => s.trim()).filter(Boolean).pop() || 'unknown';
    if (!rateLimiter.acquire(clientIp)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again later. Limit: ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW / 1000} seconds.`,
        },
        { status: 429 }
      );
    }

    // ── Mock mode (no API key needed) ──
    if (CHAT_MODE === 'mock') {
      const response: ChatResponse = {
        assistant_text: `[MOCK MODE] I'd normally connect to Agnes 2.0 Flash to answer: "${message}". Set AGNES_API_KEY in .env.local and CHAT_MODE=live for real AI responses.`,
        latency_ms: 5,
        quote: undefined,
        render_order_now: false,
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
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
    ];

    // ── Short response cache (TTL 60s) ──
    // Avoids re-hitting the LLM for identical questions — the most common
    // cause of 504s is a slow Agnes call, and a retry of the same question
    // shouldn't have to wait for another one.
    const cacheKey = agnesMessages.map((m) => `${m.role}:${m.content}`).join('|');
    const cachedRaw = chatCacheGet(cacheKey);
    if (cachedRaw !== null) {
      const quote = extractQuote(cachedRaw);
      const assistantText = cleanAssistantText(cachedRaw);
      return NextResponse.json({
        assistant_text: assistantText,
        latency_ms: 0,
        quote,
        render_order_now: quote !== undefined,
        sessionId,
        error: undefined,
        cached: true,
      });
    }

    // ── Call Agnes 2.0 Flash ──
    // Each attempt gets its OWN AbortController + timeout: an aborted
    // controller stays aborted, so sharing one across retries would make
    // every retry after a timeout fail instantly (and the timeout must be
    // re-armed per attempt, not cleared after the first fetch).
    const fetchStartTime = performance.now();

    const callAgnes = async (remainingBudgetMs: number): Promise<AgnesChatResponse> => {
      // Shrink the per-attempt timeout to fit the remaining total budget so a
      // single attempt can't burn 30s past the 60s cap. Floor at 500ms: if the
      // budget is nearly gone, the pre-attempt check in retryWithBackoff
      // already stops us from starting.
      const attemptTimeout = Math.max(500, Math.min(FETCH_TIMEOUT, remainingBudgetMs));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), attemptTimeout);
      try {
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
            max_tokens: 4096, // Room for long answers + the [QUOTE] block without mid-quote truncation
          }),
          signal: controller.signal,
        });

        // ── Handle API errors ──
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const status = response.status;

          // Classify errors for better debugging
          if (status === 401 || status === 403) {
            throw new Error(`Agnes API authentication error (${status}). Check AGNES_API_KEY.`);
          }
          if (RETRYABLE_STATUS.has(status)) {
            throw new HttpError(
              status,
              status === 429
                ? `Agnes API rate limit exceeded (429). Try again in a few seconds.`
                : `Agnes API server error (${status}). The model may be temporarily unavailable.`
            );
          }

          throw new Error(`Agnes API error: ${status} - ${errorText.substring(0, 200)}`);
        }

        return (await response.json()) as AgnesChatResponse;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let data: AgnesChatResponse;
    try {
      data = await retryWithBackoff(callAgnes, {
        maxRetries: MAX_RETRIES,
        baseDelay: RETRY_BASE_DELAY,
        budgetMs: TOTAL_BUDGET_MS,
        shouldRetry: isRetryableError,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new Error(`Agnes API request timed out after ${FETCH_TIMEOUT}ms`);
      }
      throw error;
    }

    const fetchLatency = Math.floor(performance.now() - fetchStartTime);

    // ── Parse response ──
    const rawAssistantText = data.choices?.[0]?.message?.content || '';

    // Store in cache (bounded)
    if (rawAssistantText) {
      chatCacheSet(cacheKey, rawAssistantText);
    }

    // ── Extract quote (structured [QUOTE] block first, regex fallback) ──
    const quote = extractQuote(rawAssistantText);

    // ── Clean display text (remove [QUOTE] blocks) ──
    const assistantText = cleanAssistantText(rawAssistantText);

    // ── Build response ──
    const response: ChatResponse = {
      assistant_text: assistantText,
      latency_ms: fetchLatency,
      quote,
      render_order_now: quote !== undefined,
      sessionId,
      error: undefined,
    };

    // ── Fire-and-forget: save session to admin backend for admin viewing ──
    // Don't await — we respond to the customer immediately
    const allMessages = [
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: assistantText },
    ];
    saveSessionToAdmin({
      sessionId,
      brand: typeof brand === 'string' && brand.length <= 32 ? brand : 'paberin',
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
        : error?.message?.includes('authentication') || error?.message?.includes('server error')
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

export const runtime = 'nodejs';

// Vercel function duration: Node runtime + maxDuration is required because
// the Agnes call can take 20-45s and Edge functions get killed at ~30s
// (which surfaced as 504s). Hobby allows 60s; on Pro you can raise this to
// 300 if you also bump TOTAL_TIMEOUT.
export const maxDuration = 60;
