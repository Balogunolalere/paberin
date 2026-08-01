/**
 * Tiny in-memory response cache for the chat route.
 *
 * Lives in lib/ (not the route file) because Next.js route modules may only
 * export route handlers + config — a cache-reset export would break that
 * contract. Also gives tests a clean way to clear state between cases.
 */

export const CHAT_CACHE_TTL_MS = 60_000;
export const MAX_CACHE_ENTRIES = 100;

const responseCache = new Map<string, { raw: string; ts: number }>();

/** Return a fresh cached raw reply for `key`, or null (expired entries removed). */
export function chatCacheGet(key: string): string | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CHAT_CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.raw;
}

/** Store a raw reply under `key`, evicting the oldest entry when at capacity. */
export function chatCacheSet(key: string, raw: string): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next();
    if (!oldest.done) responseCache.delete(oldest.value);
  }
  responseCache.set(key, { raw, ts: Date.now() });
}

/** Clear all entries (tests, admin ops). */
export function clearChatCache(): void {
  responseCache.clear();
}
