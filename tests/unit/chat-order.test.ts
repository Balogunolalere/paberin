import { beforeEach, describe, expect, test } from 'vitest'
import { CHAT_ORDER_URL, buildChatOrderNotes, buildChatSpecsFromCustom, buildChatSpecsFromQuote, chatOptionSelection, resolveChatHandoff, stashChatHandoff, takeChatHandoff } from '@/lib/chat-order'
import type { ChatSpecs } from '@/lib/chat'

/**
 * buildChatOrderNotes — carries the chat conversation context into the order
 * form's notes, so the team sees the customer's own words plus the AI's
 * extracted spec (custom job, material, express, delivery).
 */
const SPECS: ChatSpecs = {
  service_type: 'paberin_fabric_custom',
  custom_description: 'Cut my jeans into a pattern',
  material: 'denim',
  quantity: 1,
  sla: 'Express',
  delivery: 'LOCAL_DELIVERY',
  delivery_address: '14 Admiralty Way, Lekki',
  needs_design_upload: false,
}

describe('buildChatOrderNotes', () => {
  test('should include the customer context and spec details', () => {
    const notes = buildChatOrderNotes(SPECS, 'i want to cut my jeans for my birthday')
    expect(notes).toContain('Customer request: i want to cut my jeans for my birthday')
    expect(notes).toContain('Custom job: Cut my jeans into a pattern')
    expect(notes).toContain('Material: denim')
    expect(notes).toContain('Express service requested')
    expect(notes).toContain('Delivery to: 14 Admiralty Way, Lekki')
  })

  test('should return empty string for null/undefined specs', () => {
    expect(buildChatOrderNotes(null, 'context')).toBe('')
    expect(buildChatOrderNotes(undefined, 'context')).toBe('')
  })

  test('should be tolerant of missing optional fields', () => {
    const minimal: ChatSpecs = { service_type: 'paberin_topper_acrylic', quantity: 2 }
    const notes = buildChatOrderNotes(minimal, null)
    expect(notes).toBe('')
    expect(notes.length).toBeLessThanOrEqual(600)
  })

  test('should cap total length at 600 chars', () => {
    const longSpecs: ChatSpecs = {
      service_type: null,
      custom_description: 'x'.repeat(2000),
      quantity: 1,
    }
    const notes = buildChatOrderNotes(longSpecs, 'y'.repeat(2000))
    expect(notes.length).toBeLessThanOrEqual(600)
  })
})

/**
 * The reported bug, verbatim: "after chatting first i didnt see the font, also
 * the fields are not atomatically filled". The chat collected every answer — it
 * has to, the engine will not price a service with required fields missing — and
 * the handoff carried only service_type, quantity and sla. The customer met an
 * empty form and retyped what they had just said; with a font required by
 * default, the order was blocked outright, because chat cannot show the picker.
 */
describe('chatOptionSelection — the answers reach the form', () => {
  const STRUCTURED = {
    optionFields: [
      { key: 'fonts', label: 'Font', type: 'font' as const, choices: [{ value: 'Clarendon' }] },
      { key: 'message', label: 'Message', type: 'text' as const, maxLength: 60 },
    ],
  } as never;

  const specs = (over: Record<string, unknown> = {}) =>
    ({ service_type: 'topper', quantity: 1, sla: 'Standard', ...over }) as never;

  test('hands the font and the message over', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: 'Clarendon', message: 'Ada' } }), STRUCTURED);
    expect(r.selectedOptions).toEqual({ fonts: 'Clarendon', message: 'Ada' });
    expect(r.dropped).toEqual([]);
  });

  test('drops keys this service does not have, keeping the rest', () => {
    const r = chatOptionSelection(
      specs({ selected_options: { fonts: 'Clarendon', colour: 'Gold', message: 'Ada' } }),
      STRUCTURED,
    );
    expect(r.selectedOptions).toEqual({ fonts: 'Clarendon', message: 'Ada' });
    expect(r.dropped).toEqual(['colour']);
  });

  test('trims text and caps it at the field limit', () => {
    const r = chatOptionSelection(specs({ selected_options: { message: `  ${'x'.repeat(80)}  ` } }), STRUCTURED);
    expect(String(r.selectedOptions?.message)).toHaveLength(60);
  });

  test('coerces a number field the way the payload builder does', () => {
    const service = { optionFields: [{ key: 'age', label: 'Age', type: 'number' as const, min: 1, max: 100 }] } as never;
    expect(chatOptionSelection(specs({ selected_options: { age: '7' } }), service).selectedOptions).toEqual({ age: 7 });
  });

  test('ignores blank values instead of prefilling empty fields', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: '   ', message: '' } }), STRUCTURED);
    expect(r.selectedOptions).toBeUndefined();
  });

  test('maps a legacy single choice to the variant the form uses', () => {
    const legacy = { options: ['Gold', 'Silver'] } as never;
    expect(chatOptionSelection(specs({ selected_options: { option: 'Silver' } }), legacy).selectedVariant).toBe('Silver');
    // A value the service does not offer is not carried.
    const bad = chatOptionSelection(specs({ selected_options: { option: 'Chartreuse' } }), legacy);
    expect(bad.selectedVariant).toBeUndefined();
    expect(bad.dropped).toEqual(['option']);
  });

  test('returns nothing to apply when there was nothing to carry', () => {
    expect(chatOptionSelection(specs(), STRUCTURED).selectedOptions).toBeUndefined();
    expect(chatOptionSelection(null, STRUCTURED).dropped).toEqual([]);
    expect(chatOptionSelection(specs({ selected_options: 'nonsense' }), STRUCTURED).dropped).toEqual([]);
    expect(chatOptionSelection(specs({ selected_options: { fonts: 'Clarendon' } }), {} as never).dropped).toEqual(['fonts']);
  });
});

describe('the handoff no longer travels in the URL', () => {
  /** Minimal sessionStorage, so this file needs no DOM. */
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  test('the details go to storage, not the address bar', () => {
    stashChatHandoff({ service_type: 't', quantity: 1, sla: 'Standard', selected_options: { font: 'Clarendon' } }, 'ada topper');
    const stashed = Array.from(store.values())[0];
    expect(stashed).toContain('Clarendon');
    // …and the URL the chat navigates to carries none of it.
    expect(CHAT_ORDER_URL).toBe('/order?from=chat');
    expect(CHAT_ORDER_URL).not.toContain('specs');
    expect(CHAT_ORDER_URL).not.toContain('context');
  });

  test('taking it is single use, so a reload starts clean', () => {
    const specs = { service_type: 't', quantity: 2, sla: 'Express' as const };
    stashChatHandoff(specs, 'ctx');
    const first = takeChatHandoff();
    expect(first?.specs.quantity).toBe(2);
    expect(first?.context).toBe('ctx');
    expect(takeChatHandoff()).toBeNull();
  });

  test('nothing in storage reads as nothing to prefill', () => {
    expect(takeChatHandoff()).toBeNull();
  });

  test('a corrupt entry is ignored rather than thrown at the customer', () => {
    store.set('paberin.chat-order-handoff', 'not json');
    expect(takeChatHandoff()).toBeNull();
    store.set('paberin.chat-order-handoff', JSON.stringify({ context: 'no specs' }));
    expect(takeChatHandoff()).toBeNull();
  });

  test('private mode (storage refusing to write) does not break the handoff', () => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    expect(() => stashChatHandoff({ service_type: 't', quantity: 1, sla: 'Standard' })).not.toThrow();
    expect(takeChatHandoff()).toBeNull();
  });
});

describe('resolveChatHandoff — stashed first, legacy URL second', () => {
  const stashed = { specs: { service_type: 'stashed', quantity: 1, sla: 'Standard' as const }, context: 'from storage' };

  test('prefers the stash', () => {
    const r = resolveChatHandoff(stashed, JSON.stringify({ service_type: 'from-url', quantity: 9, sla: 'Express' }), 'url ctx');
    expect(r?.specs.service_type).toBe('stashed');
    expect(r?.context).toBe('from storage');
  });

  test('falls back to a link built before the stash existed', () => {
    const r = resolveChatHandoff(null, JSON.stringify({ service_type: 'from-url', quantity: 3, sla: 'Standard' }), 'url ctx');
    expect(r?.specs.service_type).toBe('from-url');
    expect(r?.specs.quantity).toBe(3);
    expect(r?.context).toBe('url ctx');
  });

  test('says nothing rather than guessing', () => {
    expect(resolveChatHandoff(null, null, null)).toBeNull();
    expect(resolveChatHandoff(null, '', 'ctx')).toBeNull();
    expect(resolveChatHandoff(null, 'not json', 'ctx')).toBeNull();
    // Valid JSON that is not an object is not specs either.
    expect(resolveChatHandoff(null, '"a string"', 'ctx')).toBeNull();
    expect(resolveChatHandoff(null, '[1,2]', 'ctx')).toBeNull();
  });
});

describe('buildChatSpecsFromQuote — what travels', () => {
  test('carries the options and the deadline', () => {
    const specs = buildChatSpecsFromQuote({
      breakdown: { serviceType: 'paberin_topper_acrylic', quantity: 2, sla: 'Express' },
      selected_options: { font: 'Clarendon', message: 'Ada' },
      requested_pickup_time: '2026-12-31T09:00:00.000Z',
      delivery: 'LOCAL_DELIVERY',
      delivery_address: '12 Marina, Lagos',
    });
    expect(specs).toMatchObject({
      service_type: 'paberin_topper_acrylic',
      quantity: 2,
      sla: 'Express',
      selected_options: { font: 'Clarendon', message: 'Ada' },
      requested_pickup_time: '2026-12-31T09:00:00.000Z',
      delivery: 'LOCAL_DELIVERY',
      delivery_address: '12 Marina, Lagos',
    });
  });

  test('invents nothing when the quote is thin', () => {
    const specs = buildChatSpecsFromQuote({ breakdown: { serviceType: 't' } });
    expect(specs.selected_options).toBeUndefined();
    expect(specs.requested_pickup_time).toBeUndefined();
    expect(specs.quantity).toBe(1);
    expect(buildChatSpecsFromQuote(null).service_type).toBeNull();
    expect(buildChatSpecsFromQuote({ breakdown: { quantity: -2 } }).quantity).toBe(1);
  });
});

describe('buildChatSpecsFromCustom', () => {
  test('carries the description and material, quantity defaulted', () => {
    expect(buildChatSpecsFromCustom({ description: 'cut my jeans', material: 'denim' })).toMatchObject({
      service_type: null,
      custom_description: 'cut my jeans',
      material: 'denim',
      quantity: 1,
    });
  });

  test('survives junk', () => {
    expect(buildChatSpecsFromCustom(null).quantity).toBe(1);
    expect(buildChatSpecsFromCustom({ quantity: 'lots' }).quantity).toBe(1);
    expect(buildChatSpecsFromCustom({ quantity: 4 }).sla).toBeUndefined();
  });
});
