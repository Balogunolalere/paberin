import { describe, expect, test } from 'vitest'
import { buildChatOrderNotes, buildOrderHandoffUrl, chatOptionSelection } from '@/lib/chat-order'
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

describe('buildOrderHandoffUrl — what travels to /order', () => {
  const parse = (url: string) => {
    const [, qs] = url.split('?');
    const params = new URLSearchParams(qs);
    return { params, specs: JSON.parse(params.get('specs') || '{}') as Record<string, unknown> };
  };

  test('carries the options, which it used to drop', () => {
    const { params, specs } = parse(
      buildOrderHandoffUrl({
        breakdown: { serviceType: 'paberin_topper_acrylic', quantity: 2, sla: 'Express' },
        selected_options: { fonts: 'Clarendon', message: 'Ada' },
        requested_pickup_time: '2026-12-31T09:00:00.000Z',
      }),
    );
    expect(params.get('from')).toBe('chat');
    expect(specs).toMatchObject({
      service_type: 'paberin_topper_acrylic',
      quantity: 2,
      sla: 'Express',
      selected_options: { fonts: 'Clarendon', message: 'Ada' },
      requested_pickup_time: '2026-12-31T09:00:00.000Z',
    });
  });

  test('omits what the quote does not have, and defaults the rest', () => {
    const { specs } = parse(buildOrderHandoffUrl({ breakdown: { serviceType: 't' } }));
    expect(specs.selected_options).toBeUndefined();
    expect(specs.requested_pickup_time).toBeUndefined();
    expect(specs.quantity).toBe(1);
    expect(specs.sla).toBe('Standard');
  });

  test('keeps the context that explains the request, capped', () => {
    const { params } = parse(buildOrderHandoffUrl({ breakdown: {} }, 'x'.repeat(500)));
    expect(params.get('context')).toHaveLength(200);
    expect(parse(buildOrderHandoffUrl({ breakdown: {} }, '   ')).params.get('context')).toBeNull();
  });

  test('survives a missing quote', () => {
    const { specs } = parse(buildOrderHandoffUrl(null));
    expect(specs.service_type).toBeNull();
    expect(specs.quantity).toBe(1);
  });
});
