/**
 * Regression tests for live catalog grounding.
 *
 * The bug these exist to prevent: the chat prompt carried a hardcoded roster of
 * service type keys and a hardcoded "what we do" material list. The owner added
 * "Plain Cardboard Cake Topper" through the admin Services page, the code was
 * never updated, and the assistant told a customer "we cannot cut paper or card
 * for a cake topper" — while selling one.
 *
 * The catalog API is now the single source of truth, so the load-bearing
 * assertion is: EVERY active service must be visible to the model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCatalogDigest,
  buildCatalogDigestWithStats,
  buildCatalogMessage,
  digestHash,
  formatServiceLine,
  getCatalogSnapshot,
  __resetCatalogCache,
  MAX_DIGEST_CHARS,
  CATALOG_TTL_MS,
} from '@/lib/chat-catalog';
import { PABERIN_SYSTEM_PROMPT } from '@/lib/chat';
import type { Service } from '@/lib/api';

/* ───────────────────────────── fixtures ───────────────────────────── */

function svc(partial: Partial<Service> & Pick<Service, 'type' | 'label'>): Service {
  return {
    id: partial.type,
    description: '',
    category: 'ADD_ON',
    basePriceNaira: 0,
    unit: 'per piece',
    minPriceNaira: 0,
    customerSupplied: false,
    standardLeadTime: '2 working days',
    expressLeadTime: null,
    allowExpress: false,
    expressSurchargePct: 0,
    options: [],
    optionFields: null,
    ...partial,
  } as Service;
}

/** The service that exposed the bug — created via admin, absent from the seed. */
const CARDBOARD_TOPPER = svc({
  type: 'paberin_topper_cardboard',
  label: 'Plain Cardboard Cake Topper',
  description: 'Plain cardboard cake topper with name or short text. Pick your color at checkout.',
  unit: 'per piece',
  basePriceNaira: 4000,
  standardLeadTime: '2 working days',
  optionFields: [
    {
      key: 'colour',
      label: 'Colour',
      type: 'dropdown',
      choices: ['Gold', { value: 'Silver', image: 'https://cdn.example/silver.png' }],
    },
  ],
});

const ACRYLIC_TOPPER = svc({
  type: 'paberin_topper_acrylic',
  label: 'Acrylic Cake Topper',
  // Deliberately priced to prove money never leaks into the digest.
  basePriceNaira: 15000,
  minPriceNaira: 15000,
  allowExpress: true,
  expressSurchargePct: 0.5,
});

const ENGRAVING = svc({
  type: 'paberin_engraving_jewelry',
  label: 'Jewelry Engraving',
  category: 'ENGRAVING',
  customerSupplied: true,
  standardLeadTime: '48 hours minimum',
  basePriceNaira: 6000,
});

const CATALOG = [ACRYLIC_TOPPER, CARDBOARD_TOPPER, ENGRAVING];

/* ───────────────────────────── digest content ───────────────────────────── */

describe('buildCatalogDigest — catalog completeness', () => {
  it('includes EVERY active service type key (the cardboard-topper regression)', () => {
    const digest = buildCatalogDigest(CATALOG);
    for (const service of CATALOG) {
      expect(digest).toContain(service.type);
    }
    // The exact service the assistant used to deny.
    expect(digest).toContain('paberin_topper_cardboard');
  });

  it('includes every active service label, so materials are discoverable', () => {
    const digest = buildCatalogDigest(CATALOG);
    for (const service of CATALOG) {
      expect(digest).toContain(service.label);
    }
    expect(digest).toContain('Plain Cardboard Cake Topper');
  });

  it('surfaces the description, which is where material nuance lives', () => {
    expect(buildCatalogDigest([CARDBOARD_TOPPER])).toContain('cardboard');
  });

  it('is deterministic and order-independent (stable hash, stable cache key)', () => {
    const a = buildCatalogDigest(CATALOG);
    const b = buildCatalogDigest([...CATALOG].reverse());
    expect(a).toBe(b);
    expect(digestHash(a)).toBe(digestHash(b));
  });

  it('distinguishes different catalogs by hash', () => {
    expect(digestHash(buildCatalogDigest(CATALOG))).not.toBe(
      digestHash(buildCatalogDigest([ACRYLIC_TOPPER])),
    );
  });

  it('skips malformed rows instead of emitting undefined fields', () => {
    const digest = buildCatalogDigest([
      ACRYLIC_TOPPER,
      { type: '', label: '' } as Service,
      null as unknown as Service,
    ]);
    expect(digest).toContain(ACRYLIC_TOPPER.type);
    expect(digest).not.toContain('undefined');
    expect(digest.split('\n')).toHaveLength(1);
  });

  it('caps total size so a large catalog cannot flood the context', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      svc({
        type: `paberin_bulk_${i}`,
        label: `Bulk Service ${i}`,
        description: 'x'.repeat(300),
      }),
    );
    expect(buildCatalogDigest(many).length).toBeLessThanOrEqual(MAX_DIGEST_CHARS);
  });
});

/* ───────────────────────────── money safety ───────────────────────────── */

describe('buildCatalogDigest — the engine stays the only pricing authority', () => {
  it('never emits a price, regardless of what the service costs', () => {
    const digest = buildCatalogDigest(CATALOG);
    expect(digest).not.toContain('₦');
    expect(digest).not.toMatch(/naira/i);
    // The actual numbers from the fixtures must not appear.
    expect(digest).not.toContain('15000');
    expect(digest).not.toContain('4000');
    expect(digest).not.toContain('6000');
    expect(digest).not.toMatch(/\d{1,3},\d{3}/);
  });

  it('never emits a surcharge percentage', () => {
    const digest = buildCatalogDigest([ACRYLIC_TOPPER]);
    expect(digest).not.toMatch(/\d+\s*%/);
    expect(digest).not.toContain('0.5');
  });
});

/* ───────────────────────────── line format ───────────────────────────── */

describe('formatServiceLine', () => {
  it('encodes the operational facts the model needs', () => {
    const line = formatServiceLine(ACRYLIC_TOPPER);
    expect(line).toContain('paberin_topper_acrylic');
    expect(line).toContain('Acrylic Cake Topper');
    expect(line).toContain('express available');
    expect(line).toContain('2 working days');
  });

  it('flattens object choices (including image choices) to plain values', () => {
    const line = formatServiceLine(CARDBOARD_TOPPER);
    // Structured fields render with their KEY (the engine needs it to price) and
    // mark required ones, so the model can emit selected_options.
    expect(line).toContain('fields: colour=Gold|Silver');
    expect(line).not.toContain('cdn.example');
  });

  it('falls back to the legacy flat options array', () => {
    const legacy = svc({ type: 'paberin_legacy', label: 'Legacy', options: ['Red', 'Blue'] });
    expect(formatServiceLine(legacy)).toContain('choices: Red, Blue');
  });

  it('flags customer-supplied items', () => {
    expect(formatServiceLine(ENGRAVING)).toContain('customer supplies the item');
    expect(formatServiceLine(ACRYLIC_TOPPER)).not.toContain('customer supplies the item');
  });
});

/* ───────────────────────────── prompt hygiene ───────────────────────────── */

describe('PABERIN_SYSTEM_PROMPT no longer restates the catalog', () => {
  it('contains no hardcoded service type key roster', () => {
    // Any paberin_* key in the persona means a second, drift-prone source of truth.
    expect(PABERIN_SYSTEM_PROMPT).not.toMatch(/paberin_[a-z_]+/);
  });

  it('points the model at the injected catalog instead', () => {
    expect(PABERIN_SYSTEM_PROMPT).toContain('LIVE SERVICE CATALOG');
  });

  it('forbids denying capability outright', () => {
    expect(PABERIN_SYSTEM_PROMPT).toMatch(/NEVER tell a customer that we cannot do something/i);
  });

  it('no longer enumerates topper materials (the drift that caused the bug)', () => {
    expect(PABERIN_SYSTEM_PROMPT).not.toMatch(/CAKE TOPPERS — acrylic/i);
  });
});

/* ───────────────────────────── degradation ───────────────────────────── */

describe('buildCatalogMessage — failure mode is safe', () => {
  /** Prompt prose is wrapped for readability; assertions must not depend on line breaks. */
  const flat = (text: string) => text.replace(/\s+/g, ' ');

  it('forbids denying capability when no catalog could be loaded', () => {
    const msg = flat(buildCatalogMessage(null));
    expect(msg).toMatch(/NEVER tell a customer that we cannot do something/i);
    expect(msg).toMatch(/not knowing is not the same as being unable/i);
  });

  it('tells the model to avoid a service_type it cannot verify', () => {
    const msg = flat(buildCatalogMessage(null));
    expect(msg).toMatch(/do NOT emit a \[SPECS\] block with a "service_type"/i);
  });

  it('never falls back to a hardcoded roster when unavailable', () => {
    expect(buildCatalogMessage(null)).not.toMatch(/paberin_[a-z_]+/);
  });

  it('embeds the digest and hash when a snapshot exists', () => {
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length,
      dropped: 0,
      fetchedAt: Date.now(),
    });
    expect(msg).toContain('paberin_topper_cardboard');
    expect(msg).toContain('paberin_topper_acrylic');
    expect(msg).toContain('3 active services');
    expect(msg).toMatch(/authoritative/i);
  });

  it('warns the model when the digest had to omit services', () => {
    // Truncation must never be silent. An incomplete catalog that LOOKS complete
    // is precisely how the assistant ended up denying a service we sell — the
    // real catalog rendered to ~5.9k chars and quietly dropped the last 4 of 36.
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length + 4,
      dropped: 4,
      fetchedAt: Date.now(),
    });
    expect(msg).toMatch(/this list is PARTIAL/i);
    expect(msg).toContain('4 further service(s)');
    expect(msg).toMatch(/never as unavailable/i);
  });

  it('says nothing about omissions when the catalog was complete', () => {
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length,
      dropped: 0,
      fetchedAt: Date.now(),
    });
    expect(msg).not.toMatch(/PARTIAL/i);
  });

  it('reports how much of the catalog it dropped', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      svc({ type: `paberin_bulk_${i}`, label: `Bulk ${i}`, description: 'x'.repeat(300) }),
    );
    const { included, dropped, digest } = buildCatalogDigestWithStats(many);
    expect(included + dropped).toBe(400);
    expect(dropped).toBeGreaterThan(0);
    expect(included).toBeGreaterThan(0);
    expect(digest.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS);
  });
});

/* ───────────────────────────── fetch + cache ───────────────────────────── */

describe('getCatalogSnapshot — freshness with a safe fallback', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    __resetCatalogCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = realFetch;
    __resetCatalogCache();
  });

  function mockOk(services: Service[]) {
    const fn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: services }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fn;
    return fn;
  }

  function mockFail() {
    const fn = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    globalThis.fetch = fn;
    return fn;
  }

  it('fetches the live catalog for the requested brand', async () => {
    const fn = mockOk(CATALOG);
    const snapshot = await getCatalogSnapshot('PABERIN', 'https://admin.test');
    expect(String((fn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      '/api/services?brand=PABERIN',
    );
    expect(snapshot?.count).toBe(3);
    expect(snapshot?.digest).toContain('paberin_topper_cardboard');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fn = mockOk(CATALOG);
    await getCatalogSnapshot('PABERIN', 'https://admin.test');
    await getCatalogSnapshot('PABERIN', 'https://admin.test');
    expect((fn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(CATALOG_TTL_MS).toBeGreaterThan(0);
  });

  it('coalesces concurrent cold-cache callers into ONE fetch', async () => {
    const fn = mockOk(CATALOG);
    await Promise.all([
      getCatalogSnapshot('PABERIN', 'https://admin.test'),
      getCatalogSnapshot('PABERIN', 'https://admin.test'),
      getCatalogSnapshot('PABERIN', 'https://admin.test'),
    ]);
    expect((fn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('serves the last known good catalog when a refresh fails', async () => {
    vi.useFakeTimers();
    try {
      mockOk(CATALOG);
      const first = await getCatalogSnapshot('PABERIN', 'https://admin.test');

      // Age the cache past its TTL, then break the network. The snapshot must be
      // RETAINED and served — grounding the model in nothing is exactly what let
      // it deny capability in the first place.
      vi.advanceTimersByTime(CATALOG_TTL_MS + 1000);
      mockFail();

      const stale = await getCatalogSnapshot('PABERIN', 'https://admin.test');
      expect(stale?.digest).toBe(first?.digest);
      expect(stale?.digest).toContain('paberin_topper_cardboard');

      // A stale snapshot is still an authoritative grounding.
      expect(buildCatalogMessage(stale)).toMatch(/authoritative/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null (and the caller degrades) when it has never succeeded', async () => {
    mockFail();
    expect(await getCatalogSnapshot('PABERIN', 'https://admin.test')).toBeNull();
  });

  it('treats an empty catalog as unavailable rather than grounding in nothing', async () => {
    mockOk([]);
    expect(await getCatalogSnapshot('PABERIN', 'https://admin.test')).toBeNull();
  });

  it('treats a non-array payload as unavailable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { nope: true } }),
    })) as unknown as typeof fetch;
    expect(await getCatalogSnapshot('PABERIN', 'https://admin.test')).toBeNull();
  });
});
