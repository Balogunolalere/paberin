/**
 * Chat → Order handoff helpers.
 *
 * When the chat assistant produces a [QUOTE], the chat page links to
 * /order?from=chat&quote={...}&context={...}. The order form needs to map
 * the AI's quoted service ("Full Buba", "Acrylic Cake Topper", …) onto the
 * admin catalog's fixed service templates — which is NOT a label match for
 * most AI items (e.g. the catalog has "Fabric Laser Cutting (Paberin)", not
 * "Full Buba"). This module owns that mapping so it can be unit-tested.
 */

import type { ChatResponse, Service } from '@/lib/api';

export interface ChatQuoteMatch {
  /** The catalog service to pre-select, or null if nothing fits. */
  service: Service | null;
  /**
   * true when `service` was chosen via category fallback rather than an
   * exact/close match — the UI should tell the customer about the mapping.
   */
  mapped: boolean;
  /** Human-readable reason, for the UI notice. */
  reason: string;
}

/** Category buckets derived from the AI prompt's service vocabulary. */
type Category = 'FABRIC' | 'TOPPER' | 'ENGRAVING' | 'SHEET' | 'STICKS' | 'TAG' | 'NONE';

const CATEGORY_RULES: { cat: Category; patterns: RegExp[] }[] = [
  {
    cat: 'FABRIC',
    patterns: [
      /fabric/i, /garment/i, /buba/i, /wrapper/i, /sleeve/i, /boubou/i,
      /aso-?ebi/i, /ankara/i, /lace/i, /skirt/i, /gown/i, /blouse/i,
      /iro\b/i, /gele/i, /vintage/i,
    ],
  },
  {
    cat: 'TOPPER',
    patterns: [/topper/i, /cake ?topper/i],
  },
  {
    cat: 'ENGRAVING',
    patterns: [/engrav/i, /phone ?back/i, /jewelry/i, /necklace/i, /badge/i, /stirrer/i],
  },
  {
    cat: 'STICKS',
    patterns: [/stick/i],
  },
  {
    cat: 'SHEET',
    patterns: [/sheet/i, /signage/i, /sign ?board/i, /acrylic ?sign/i, /name ?board/i],
  },
  {
    cat: 'TAG',
    patterns: [/tag/i, /label/i, /printed ?card/i],
  },
];

/** Best catalog service type per category (used by pickCategoryService). */

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Token overlap score between two labels (0..1). */
function tokenOverlap(a: string, b: string): number {
  const stop = new Set(['paberin', 'the', 'a', 'an', 'and', 'or', 'cutting', 'laser']);
  const ta = new Set(normalize(a).split(/[^a-z0-9]+/).filter((t) => t && !stop.has(t)));
  const tb = new Set(normalize(b).split(/[^a-z0-9]+/).filter((t) => t && !stop.has(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter++;
  });
  return inter / Math.min(ta.size, tb.size);
}

function detectCategory(quote: ChatResponse['quote']): Category {
  const serviceType = normalize(quote?.breakdown?.serviceType || '');
  const label = normalize(quote?.breakdown?.serviceLabel || '');
  const haystack = `${serviceType} ${label}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.cat;
  }
  return 'NONE';
}

/**
 * Map a chat quote to the closest catalog service.
 *
 * Priority: exact service type → exact label → label/type fuzzy match
 * (token overlap ≥ 0.5) → category keyword fallback. Returns `mapped: true`
 * for the category fallback so the UI can tell the customer "we mapped your
 * request to the closest service; you can change it".
 */
export function matchChatQuoteToService(
  quote: ChatResponse['quote'] | null | undefined,
  services: Service[]
): ChatQuoteMatch {
  if (!quote || !Array.isArray(services) || services.length === 0) {
    return { service: null, mapped: false, reason: 'no quote or catalog' };
  }
  const serviceType = normalize(quote.breakdown?.serviceType || '');
  const label = normalize(quote.breakdown?.serviceLabel || '');

  // 1) Exact service type
  if (serviceType) {
    const exact = services.find((s) => normalize(s.type) === serviceType);
    if (exact) return { service: exact, mapped: false, reason: 'exact service type match' };
  }

  // 2) Exact label
  if (label) {
    const exact = services.find((s) => normalize(s.label) === label);
    if (exact) return { service: exact, mapped: false, reason: 'exact label match' };
  }

  // 3) Category keyword detection (on the AI's service_type + label) —
  //    BEFORE fuzzy label matching, because "acrylic_stick_cutting" shares
  //    tokens with "Acrylic Cake Topper" and fuzzy ties pick the wrong one.
  const cat = detectCategory(quote);
  if (cat !== 'NONE') {
    const svc = pickCategoryService(cat, `${serviceType} ${label}`, services);
    if (svc) return { service: svc, mapped: true, reason: `mapped to ${cat.toLowerCase()} service` };
  }

  // 4) Fuzzy: token overlap on label or type containment
  let best: { service: Service; score: number } | null = null;
  for (const s of services) {
    const score = Math.max(
      tokenOverlap(label, s.label),
      tokenOverlap(serviceType, s.type),
      serviceType && s.type.includes(serviceType) ? 0.5 : 0,
      serviceType && serviceType.includes(s.type) ? 0.4 : 0
    );
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { service: s, score };
    }
  }
  if (best) return { service: best.service, mapped: true, reason: 'fuzzy label match' };

  // 5) No match — leave it to the customer to pick manually.
  return { service: null, mapped: false, reason: 'no match found' };
}

/** Pick the most specific catalog service for a detected category. */
function pickCategoryService(cat: Category, haystack: string, services: Service[]): Service | null {
  const byType = (type: string) => services.find((s) => s.type === type) || null;
  switch (cat) {
    case 'FABRIC':
      return byType('paberin_fabric_cutting');
    case 'STICKS':
      return byType('paberin_acrylic_sticks');
    case 'ENGRAVING':
      return byType('paberin_engraving_name');
    case 'TOPPER':
      if (/custom/i.test(haystack)) return byType('paberin_topper_custom');
      if (/mirror/i.test(haystack)) return byType('paberin_topper_mirror');
      if (/wood/i.test(haystack)) return byType('paberin_topper_wood');
      return byType('paberin_topper_acrylic');
    case 'SHEET':
      if (/sign/i.test(haystack)) return byType('paberin_signage_acrylic');
      return byType('paberin_sheet_cutting');
    case 'TAG':
      if (/card/i.test(haystack)) return byType('paberin_printed_card');
      return byType('paberin_printed_tag');
    default:
      return null;
  }
}

/**
 * Build the customerNotes prefill from the chat quote + the customer's own
 * words, so the order form carries the full AI conversation context.
 */
export function buildChatOrderNotes(
  quote: ChatResponse['quote'] | null | undefined,
  context?: string | null
): string {
  if (!quote) return '';
  const parts: string[] = [];
  const ctx = (context || '').trim();
  if (ctx) parts.push(`Customer request: ${ctx}`);
  if (quote.summary) parts.push(quote.summary);
  const b = quote.breakdown;
  if (b?.sla === 'Express') parts.push('Express service requested (+50%)');
  if (b?.leadTime) parts.push(`Lead time: ${b.leadTime}`);
  if (b?.notes) parts.push(b.notes);
  return parts.join('. ').slice(0, 600);
}
