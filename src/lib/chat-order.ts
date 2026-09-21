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
 * Where the chat leaves the order details for the form to pick up.
 *
 * NOT in the URL. It was, and the URL became the order: the customer's message
 * text, their option values and what they had just said to the assistant all
 * appeared in the address bar, in their browser history, in any Referer sent to
 * a third party, and in the access logs of every hop. It is also fragile — a
 * long spec nears URL limits, and a shared or reloaded link carries stale data.
 *
 * sessionStorage keeps it to this tab and this browsing session, and it is single
 * use: the form takes it and clears it, so a reload cannot resurrect an old
 * handoff. The URL keeps a bare `?from=chat` marker; a link built by an OLDER
 * version of the chat (which put specs in the URL) still works, because the form
 * falls back to reading it.
 */
const HANDOFF_KEY = 'paberin.chat-order-handoff';

export interface ChatHandoff {
  specs: ChatSpecs;
  context?: string;
}

/** Leave the details for the order form. Never throws: private mode can refuse. */
export function stashChatHandoff(specs: ChatSpecs, context?: string | null): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ specs, context: context || '' }));
  } catch {
    // Safari private mode, a full quota, storage disabled — the customer simply
    // fills the form themselves rather than hitting an error they cannot act on.
  }
}

/** Take the details, clearing them. Single use, so a reload starts clean. */
export function takeChatHandoff(): ChatHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { specs?: unknown; context?: unknown };
    if (!parsed || typeof parsed !== 'object' || !parsed.specs || typeof parsed.specs !== 'object') return null;
    return {
      specs: parsed.specs as ChatSpecs,
      context: typeof parsed.context === 'string' && parsed.context ? parsed.context : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Which handoff to apply: the stashed one wins, and a specs payload in the URL is
 * the legacy shape from links built before the stash existed. Null means there is
 * nothing to prefill.
 */
export function resolveChatHandoff(
  stashed: ChatHandoff | null,
  urlSpecsRaw?: string | null,
  urlContext?: string | null,
): ChatHandoff | null {
  if (stashed) return stashed;
  if (!urlSpecsRaw) return null;
  try {
    const specs = JSON.parse(urlSpecsRaw) as ChatSpecs;
    if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
    return { specs, context: urlContext || undefined };
  } catch {
    return null; // a mangled link: let the customer fill the form in
  }
}

/** The URL the chat navigates to. Deliberately carries nothing. */
export const CHAT_ORDER_URL = '/order?from=chat';

/** The specs to hand off from a priced quote. */
export function buildChatSpecsFromQuote(quote: Record<string, unknown> | null | undefined): ChatSpecs {
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
  return specs;
}

/** The specs to hand off for a job with no catalog match. */
export function buildChatSpecsFromCustom(custom: Record<string, unknown> | null | undefined): ChatSpecs {
  const quantity = Number(custom?.quantity);
  return {
    service_type: null,
    custom_description: typeof custom?.description === 'string' ? custom.description : undefined,
    material: typeof custom?.material === 'string' ? custom.material : undefined,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    sla: custom?.sla === 'Express' ? 'Express' : undefined,
  };
}
