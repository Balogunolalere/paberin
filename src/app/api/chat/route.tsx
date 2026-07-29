/**
 * Chat API Route using Agnes 2.0 Flash
 * 
 * This route handles chat requests by calling the Agnes AI API directly.
 * It replaces the previous external admin API LLM integration.
 * 
 * Features:
 * - Fetch timeout with configurable timeout (default 30s)
 * - Retry logic with exponential backoff for transient errors
 * - Rate limiting (per-window, configurable)
 * - Proper error handling and fallbacks
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChatRequestBody, ChatResponse } from '@/lib/api';

// Agnes API configuration
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const CHAT_MODE = process.env.CHAT_MODE || 'live'; // 'live' or 'mock'

// Configuration for robustness
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '30000', 10); // 30s default
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const RETRY_BASE_DELAY = parseInt(process.env.RETRY_BASE_DELAY || '1000', 10); // ms
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // 1min default

if (CHAT_MODE === 'live' && !AGNES_API_KEY) {
  throw new Error('AGNES_API_KEY environment variable is required in live mode');
}

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
 * Simple in-memory rate limiter (for edge runtime, consider Redis for persistent state)
 * Tracks request count per window and blocks if limit exceeded
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
    // Reset counter if window has passed
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
 * Retry an async operation with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param baseDelay - Base delay in ms for exponential backoff
 * @returns Result of the function call
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
      
      // If we've exhausted retries, throw the last error
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError; // Should never reach here
}

/**
 * Extract price from text using simple pattern matching
 * This is a basic implementation - in production, use structured output or tool calling
 */
function extractPriceFromText(text: string): ChatResponse['quote'] | undefined {
  // Match patterns like "₦15,000", "₦15000", or "₦7,500.50" (with ₦ symbol and optional decimals)
  const nairaWithSymbolPattern = /₦?([\d,]+\.?\d*)/g;
  const matches = text.match(nairaWithSymbolPattern);
  
  if (matches) {
    // Find the largest price - check all matches without early break
    let bestPrice: number | undefined;
    let bestMatch: string | null = null;
    let hasNairaSymbol = false;
    
    for (const match of matches) {
      const priceStr = match.replace(/₦|,/g, '');
      const price = parseFloat(priceStr);
      
      // Track if any match has the ₦ symbol
      if (match.includes('₦')) {
        hasNairaSymbol = true;
      }
      
      // Always track the largest price
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
        summary: bestMatch ? `Estimated price: ${new Intl.NumberFormat('en-NG').format(bestPrice)} ₦` : `Estimated price: ${bestPrice} ₦`,
      };
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    // Parse incoming request body
    const body = await request.json();
    const { message, history, brand = 'paberin', mode = 'live' } = body;

    if (!message || message.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (CHAT_MODE === 'mock') {
      // Mock response for development without API key
      const response: ChatResponse = {
        assistant_text: `This is a mock response. In live mode, I would connect to Agnes 2.0 Flash to answer: "${message}". Please set AGNES_API_KEY in .env.local to use real AI responses.`,
        tool_calls: [],
        tool_results: [],
        latency_ms: 100,
        customer_type: 'paberin',
        confidence: 0.85,
        quote: undefined,
        render_order_now: false,
        confidence_blocked: false,
        sessionId: '',
        error: undefined,
      };
      return NextResponse.json(response);
    }

    // Build messages array for Agnes API
    const agnesMessages = [
      {
        role: 'system',
        content: `You are Paberin's AI assistant. You help customers with materials, lead times, pricing, quotes, delivery, and order information. Be professional, helpful, and accurate. If a customer asks about a quote, provide the price in Nigerian Naira (₦). Your responses should include price estimates when relevant, formatted with the ₦ symbol.`,
      },
      ...(history || []).map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // Check rate limit first (only in live mode)
    if (CHAT_MODE === 'live' && !rateLimiter.acquire()) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again later. Limit: ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW / 1000} seconds`,
        },
        { status: 429 }
      );
    }

    // Create abort controller for fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    // Track latency measurement
    const fetchStartTime = performance.now();

    // Wrap fetch in a function that can be retried
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
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    };

    let agnesResponse: Response;
    try {
      // Execute fetch with retry logic
      agnesResponse = await retryWithBackoff(fetchWithTimeoutAndRetry, MAX_RETRIES, RETRY_BASE_DELAY);
    } catch (error) {
      clearTimeout(timeoutId);
      // Check if it's an abort error (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Agnes API request timed out after ${FETCH_TIMEOUT}ms`);
      }
      throw error;
    }

    const fetchEndTime = performance.now();
    const fetchLatency = Math.floor(fetchEndTime - fetchStartTime);

    if (!agnesResponse.ok) {
      const errorText = await agnesResponse.text().catch(() => 'Unknown error');
      throw new Error(`Agnes API error: ${agnesResponse.status} - ${errorText}`);
    }

    const data: AgnesChatResponse = await agnesResponse.json();

    // Extract the assistant response
    const assistantText = data.choices[0].message.content;

    // Extract quote from response text
    const quote = extractPriceFromText(assistantText); // returns QuoteResponse | undefined

    const response: ChatResponse = {
      assistant_text: assistantText,
      tool_calls: [],
      tool_results: [],
      latency_ms: fetchLatency,
      customer_type: 'paberin',
      confidence: 0.95,
      quote: quote, // undefined if no price found
      render_order_now: quote !== undefined,
      confidence_blocked: false,
      sessionId: '',
      error: undefined,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Chat API error:', error);
    
    // Handle error in mock mode gracefully
    if (CHAT_MODE === 'mock') {
      const response: ChatResponse = {
        assistant_text: `Mock mode: I couldn't connect to Agnes 2.0 because AGNES_API_KEY is not set. Please add your API key to .env.local to use real AI responses.`,
        tool_calls: [],
        tool_results: [],
        latency_ms: 100,
        customer_type: 'paberin',
        confidence: 0.85,
        quote: undefined,
        render_order_now: false,
        confidence_blocked: false,
        sessionId: '',
        error: undefined,
      };
      return NextResponse.json(response);
    }

    return NextResponse.json(
      {
        error: 'Failed to process chat request',
        message: error?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'edge'; // Use edge runtime for better performance and cost