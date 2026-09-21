/**
 * Chat → Order handoff helpers.
 *
 * The chat assistant extracts a structured [SPECS] block; the order form
 * receives it as `?from=chat&specs={...}`. Mapping a spec to a catalog
 * service is now EXACT (service_type keys are validated against the catalog
 * server-side) — the old fuzzy/category matching (`matchChatQuoteToService`)
 * was retired because it silently mis-priced bespoke jobs.
 */

import type { ChatSpecs } from '@/lib/chat';
import type { Service } from '@/lib/api';
import { normalizeOptionValues } from '@/lib/order-form';

/**
 * Build the customerNotes prefill from the chat specs + the customer's own
 * words, so the order form carries the full AI conversation context.
 */
export function buildChatOrderNotes(specs: ChatSpecs | null | undefined, context?: string | null): string {
  if (!specs) return '';
  const parts: string[] = [];
  const ctx = (context || '').trim();
  if (ctx) parts.push(`Customer request: ${ctx}`);
  if (specs.custom_description) parts.push(`Custom job: ${specs.custom_description}`);
  if (specs.material) parts.push(`Material: ${specs.material}`);
  if (specs.sla === 'Express') parts.push('Express service requested');
  if (specs.delivery === 'LOCAL_DELIVERY' && specs.delivery_address) parts.push(`Delivery to: ${specs.delivery_address}`);
  return parts.join('. ').slice(0, 600);
}

/**
 * The customer's option values as they should arrive in the order form.
 *
 * The chat assistant already collects these — it has to, because the pricing
 * engine refuses to price a service whose required fields are missing — but the
 * handoff used to drop them on the floor: the customer answered every question
 * in chat, then met an empty form and had to answer them all again. Now that a
 * font field is required by default, that also meant a blocked order.
 *
 * Keys the chosen service does not have are dropped rather than carried: a
 * service can be re-edited between the chat and the form, and a value for a field
 * that no longer exists would be rejected by the backend.
 *
 * A legacy flat-option service (no `optionFields`) keeps its single choice under
 * the `option` key the chat catalog uses, and it comes back as `selectedVariant`.
 */
export interface ChatOptionSelection {
  /** Structured fields, normalized to the values the engine accepts. */
  selectedOptions?: Record<string, string | number>;
  /** Legacy single choice. */
  selectedVariant?: string;
  /** Keys the model sent that this service does not offer (diagnostics, tests). */
  dropped: string[];
}

export function chatOptionSelection(
  specs: ChatSpecs | null | undefined,
  service: Service | null | undefined,
): ChatOptionSelection {
  const incoming = specs?.selected_options;
  if (!incoming || typeof incoming !== 'object') return { dropped: [] };

  const structured = service?.optionFields ?? [];
  if (structured.length > 0) {
    const knownKeys = new Set(structured.map((f) => f.key));
    const kept: Record<string, string | number> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(incoming)) {
      // The engine matches field keys EXACTLY, so anything else is noise.
      if (!knownKeys.has(key)) { dropped.push(key); continue; }
      if (value === undefined || value === null || String(value).trim() === '') continue;
      kept[key] = value;
    }
    const normalized = normalizeOptionValues(structured, kept);
    return Object.keys(normalized).length > 0 ? { selectedOptions: normalized, dropped } : { dropped };
  }

  const legacy = service?.options ?? [];
  if (legacy.length > 0) {
    const pick = incoming.option;
    if (typeof pick === 'string' && legacy.includes(pick)) {
      return { selectedVariant: pick, dropped: [] };
    }
    return { dropped: pick === undefined ? [] : ['option'] };
  }

  // No options on this service: nothing to carry.
  return { dropped: Object.keys(incoming) };
}

/**
 * Build the `/order` handoff URL from a chat quote.
 *
 * Everything the assistant already knows travels with it — previously only
 * service_type, quantity and sla did, so `selected_options` and the pickup time
 * were silently lost between the two screens.
 */
export function buildOrderHandoffUrl(
  quote: Record<string, unknown> | null | undefined,
  context?: string | null,
): string {
  const b = (quote?.breakdown || {}) as Record<string, unknown>;
  const specs: ChatSpecs = {
    service_type: typeof b.serviceType === 'string' ? b.serviceType : null,
    quantity: typeof b.quantity === 'number' && b.quantity > 0 ? b.quantity : 1,
    sla: b.sla === 'Express' ? 'Express' : 'Standard',
  };
  if (quote?.selected_options && typeof quote.selected_options === 'object') {
    specs.selected_options = quote.selected_options as Record<string, string>;
  }
  if (typeof quote?.requested_pickup_time === 'string') specs.requested_pickup_time = quote.requested_pickup_time;
  if (quote?.delivery === 'LOCAL_DELIVERY' || quote?.delivery === 'PICKUP') specs.delivery = quote.delivery;
  if (typeof quote?.delivery_address === 'string') specs.delivery_address = quote.delivery_address;

  const params = new URLSearchParams();
  params.set('from', 'chat');
  params.set('specs', JSON.stringify(specs));
  const ctx = (context || '').trim();
  if (ctx) params.set('context', ctx.slice(0, 200));
  return `/order?${params.toString()}`;
}
