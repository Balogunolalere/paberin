/**
 * Contract tests for the order-form helpers (src/lib/order-form.ts).
 *
 * Covers the three surfaces the admin backend now enforces:
 *  1. Nigerian-only phone validation (11-digit 0… / 13-digit 234… formats)
 *  2. requestedPickupTime rules (future, Mon–Fri, 09:00–18:00 Lagos, ≤30 days)
 *  3. optionFields → input mapping + selectedOptions/selectedVariant payloads
 */
import { describe, expect, test } from 'vitest'
import {
  NIGERIAN_PHONE_RE,
  isValidNigerianPhone,
  pickupTimeError,
  isValidRequestedPickupTime,
  defaultRequestedPickupTime,
  pickupTimeParts,
  pickupTimeFromParts,
  lagosDateISO,
  formatPickupLabel,
  optionInputModel,
  validateOptionValues,
  normalizeOptionValues,
  normalizeChoices,
  hasChoiceImages,
  buildQuotePayload,
  buildOrderPayload,
} from '@/lib/order-form'
import { DEFAULT_BUSINESS_CALENDAR } from '@/lib/business-calendar'
import type { OptionField, Service } from '@/lib/api'

/* ───────────────────────────── Phone ───────────────────────────── */

describe('Nigerian phone validation', () => {
  const valid = [
    '08033503068',
    '0803 350 3068',
    '0803-350-3068',
    '(0803) 350 3068',
    '07033503068',
    '07133503068',
    '08133503068',
    '09033503068',
    '09133503068',
    '+2348033503068',
    '2348033503068',
    '234 803 350 3068',
    '+234-803-350-3068',
  ]
  const invalid = [
    '',
    '123',
    '1234567',
    '12345678901',
    '0803350306', // 10 digits
    '080335030681', // 12 digits
    '07533503068', // third digit 5 is not in [01]
    '08233503068', // third digit 2 is not in [01]
    '09233503068',
    '234803350306', // 12 digits after 234
    '23480335030681', // 14 digits
    '+447700900123', // non-Nigerian
    'abcdefghijk',
  ]

  test.each(valid)('accepts %s', (phone) => {
    expect(isValidNigerianPhone(phone)).toBe(true)
  })

  test.each(invalid)('rejects %s', (phone) => {
    expect(isValidNigerianPhone(phone)).toBe(false)
  })

  test('the regex alone matches the backend contract', () => {
    expect(NIGERIAN_PHONE_RE.source).toBe('^(0[789][01]\\d{8}|234[789][01]\\d{8})$')
  })
})

/* ───────────────────────────── Pickup time ───────────────────────────── */

// Wednesday 2026-08-05 11:00 in Lagos (10:00 UTC)
const NOW = Date.parse('2026-08-05T10:00:00Z')

describe('pickupTimeError / isValidRequestedPickupTime', () => {
  test('requires a value', () => {
    expect(pickupTimeError('', NOW)).toBe('Pickup date & time is required')
  })

  test('rejects past times', () => {
    expect(pickupTimeError('2026-08-01T16:00:00Z', NOW)).toContain('future')
    // same day but earlier than now (10:00 Lagos < 11:00 Lagos)
    expect(pickupTimeError('2026-08-05T09:00:00Z', NOW)).toContain('future')
  })

  test('rejects weekends and observed public holidays', () => {
    expect(pickupTimeError('2026-08-08T16:00:00Z', NOW)).toMatch(/Mon–Fri|working day/) // Sat
    expect(pickupTimeError('2026-08-09T16:00:00Z', NOW)).toMatch(/Mon–Fri|working day/) // Sun
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-06']) }; // Thu holiday
    expect(pickupTimeError('2026-08-06T12:00:00Z', NOW, holidayCal)).toMatch(/holiday|working day/)
    expect(pickupTimeError('2026-08-07T12:00:00Z', NOW, holidayCal)).toBeNull()
  })

  test('enforces the configured opening hours (08:00–17:00, closing exclusive)', () => {
    expect(pickupTimeError('2026-08-06T06:59:00Z', NOW)).toContain('08:00–17:00') // 07:59 Lagos
    expect(pickupTimeError('2026-08-06T16:01:00Z', NOW)).toContain('08:00–17:00') // 17:01 Lagos
    expect(pickupTimeError('2026-08-06T07:00:00Z', NOW)).toBeNull() // 08:00 Lagos = opening
    expect(pickupTimeError('2026-08-06T15:59:00Z', NOW)).toBeNull() // 16:59 Lagos = last minute
    expect(pickupTimeError('2026-08-06T16:00:00Z', NOW)).toContain('08:00–17:00') // 17:00 Lagos = closing, rejected
  })

  test('enforces the 30-day horizon', () => {
    // Wed Aug 5 + 30 = Fri Sep 4 — the last valid day (16:59 Lagos)
    expect(pickupTimeError('2026-09-04T15:59:00Z', NOW)).toBeNull()
    // Mon Sep 7 is 33 days out
    expect(pickupTimeError('2026-09-07T15:59:00Z', NOW)).toContain('30 days')
  })

  test('allows a same-day future slot', () => {
    expect(isValidRequestedPickupTime('2026-08-05T15:00:00Z', NOW)).toBe(true)
  })

  test('isValidRequestedPickupTime mirrors pickupTimeError', () => {
    expect(isValidRequestedPickupTime('2026-08-08T16:00:00Z', NOW)).toBe(false)
    expect(isValidRequestedPickupTime('2026-08-06T15:30:00Z', NOW)).toBe(true)
  })
})

describe('defaultRequestedPickupTime', () => {
  test('now + 2 working days at 16:00 Lagos (one hour before closing)', () => {
    // Wed 11:00 Lagos → Thu (1), Fri (2) → Fri Aug 7 16:00 Lagos = 15:00Z
    expect(defaultRequestedPickupTime(NOW)).toBe('2026-08-07T15:00:00.000Z')
  })

  test('skips the weekend from Friday', () => {
    // Fri 2026-08-07 13:00 Lagos → Mon (1), Tue (2) → Tue Aug 11
    expect(defaultRequestedPickupTime(Date.parse('2026-08-07T12:00:00Z'))).toBe('2026-08-11T15:00:00.000Z')
  })

  test('skips the weekend from Saturday and Sunday', () => {
    expect(defaultRequestedPickupTime(Date.parse('2026-08-08T12:00:00Z'))).toBe('2026-08-11T15:00:00.000Z')
    expect(defaultRequestedPickupTime(Date.parse('2026-08-09T12:00:00Z'))).toBe('2026-08-11T15:00:00.000Z')
  })

  test('lands on Wednesday from Monday', () => {
    expect(defaultRequestedPickupTime(Date.parse('2026-08-10T12:00:00Z'))).toBe('2026-08-12T15:00:00.000Z')
  })

  test('skips observed public holidays', () => {
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-11']) }; // Tue holiday
    // Fri Aug 7 → Mon Aug 10 (1), Tue Aug 11 holiday skipped → Wed (2)
    expect(defaultRequestedPickupTime(Date.parse('2026-08-07T12:00:00Z'), holidayCal)).toBe('2026-08-12T15:00:00.000Z')
  })

  test('respects customized hours (never lands on the exclusive close)', () => {
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, openMinute: 10 * 60, closeMinute: 16 * 60 };
    const v = defaultRequestedPickupTime(NOW, cal);
    expect(v).toBe('2026-08-07T14:00:00.000Z'); // 15:00 Lagos = close - 1h
    expect(isValidRequestedPickupTime(v, NOW, cal)).toBe(true)
  })

  test('produces a value that passes its own validation', () => {
    const v = defaultRequestedPickupTime()
    expect(isValidRequestedPickupTime(v)).toBe(true)
  })
})

describe('pickup time date/time parts', () => {
  test('splits an ISO instant into Lagos-local parts', () => {
    expect(pickupTimeParts('2026-08-06T16:00:00Z')).toEqual({ date: '2026-08-06', time: '17:00' })
    expect(pickupTimeParts('')).toBeNull()
  })

  test('rebuilds an ISO instant from Lagos-local parts', () => {
    expect(pickupTimeFromParts('2026-08-06', '17:00')).toBe('2026-08-06T16:00:00.000Z')
    expect(pickupTimeFromParts('', '17:00')).toBeNull()
    expect(pickupTimeFromParts('2026-02-30', '17:00')).toBeNull() // rolls over — refused
    expect(pickupTimeFromParts('2026-08-06', '24:00')).toBeNull() // out-of-range hour
  })

  test('lagosDateISO gives the picker min/max', () => {
    expect(lagosDateISO(0, NOW)).toBe('2026-08-05')
    expect(lagosDateISO(30, NOW)).toBe('2026-09-04')
  })

  test('formatPickupLabel renders a friendly label', () => {
    expect(formatPickupLabel('2026-08-06T16:00:00Z')).toBe('Thu, Aug 6 at 17:00')
  })
})

/* ───────────────────────────── Options ───────────────────────────── */

const topperFields: OptionField[] = [
  { key: 'colour', label: 'Colour', type: 'dropdown', choices: ['Gold', 'Silver', 'Rose Gold'], required: true },
  { key: 'message', label: 'Message', type: 'text', required: true, maxLength: 60 },
  { key: 'age', label: 'Age', type: 'number', required: false, min: 1, max: 21 },
  { key: 'notes', label: 'Notes', type: 'textarea', required: false },
]

describe('optionFields → input mapping', () => {
  test('dropdown maps to a <select> with its choices', () => {
    const model = optionInputModel(topperFields[0])
    expect(model.kind).toBe('select')
    expect(model.choices).toEqual([
      { value: 'Gold' },
      { value: 'Silver' },
      { value: 'Rose Gold' },
    ])
    expect(model.required).toBe(true)
  })

  test('dropdown with image choices renders Gold thumbnail and submits the string value', () => {
    const field: OptionField = {
      key: 'colour',
      label: 'Colour',
      type: 'dropdown',
      choices: [{ value: 'Gold', image: 'https://x/g.png' }, 'Silver'],
      required: true,
    }
    const model = optionInputModel(field)
    // Gold carries its image (renders as a thumbnail in the choice grid),
    // plain 'Silver' normalizes to { value: 'Silver' }
    expect(model.choices[0]).toEqual({ value: 'Gold', image: 'https://x/g.png' })
    expect(model.choices[1]).toEqual({ value: 'Silver' })
    expect(hasChoiceImages(model.choices)).toBe(true)
    expect(hasChoiceImages(optionInputModel(topperFields[0]).choices)).toBe(false)
    // Selection still submits the plain string — the image never reaches the payload
    expect(validateOptionValues([field], { colour: 'Gold' }).valid).toBe(true)
    expect(validateOptionValues([field], { colour: 'Purple' }).valid).toBe(false)
    expect(normalizeOptionValues([field], { colour: 'Gold' })).toEqual({ colour: 'Gold' })
    expect(
      buildQuotePayload({
        service: { ...topperService, optionFields: [field] },
        serviceType: 'paberin_topper_acrylic',
        quantity: 1,
        sla: 'Standard',
        requestedPickupTime: PICKUP,
        selectedOptions: { colour: 'Gold' },
      }).selectedOptions
    ).toEqual({ colour: 'Gold' })
  })

  test('text maps to a text input with maxLength', () => {
    const model = optionInputModel(topperFields[1])
    expect(model.kind).toBe('text')
    expect(model.maxLength).toBe(60)
  })

  test('textarea maps to a <textarea>', () => {
    expect(optionInputModel(topperFields[3]).kind).toBe('textarea')
  })

  test('number maps to a number input with min/max', () => {
    const model = optionInputModel(topperFields[2])
    expect(model.kind).toBe('number')
    expect(model.min).toBe(1)
    expect(model.max).toBe(21)
  })

  test('optional flags default to false and choices to []', () => {
    const model = optionInputModel({ key: 'x', label: 'X', type: 'text' })
    expect(model.required).toBe(false)
    expect(model.choices).toEqual([])
    expect(model.maxLength).toBeUndefined()
  })
})

describe('validateOptionValues', () => {
  test('flags missing required fields', () => {
    const v = validateOptionValues(topperFields, {})
    expect(v.valid).toBe(false)
    expect(v.errors.colour).toBe('Colour is required')
    expect(v.errors.message).toBe('Message is required')
  })

  test('enforces number min/max', () => {
    expect(validateOptionValues(topperFields, { colour: 'Gold', message: 'Hi', age: '0' }).errors.age).toBe('Age must be at least 1')
    expect(validateOptionValues(topperFields, { colour: 'Gold', message: 'Hi', age: '22' }).errors.age).toBe('Age must be at most 21')
  })

  test('enforces maxLength on text fields', () => {
    const v = validateOptionValues(topperFields, { colour: 'Gold', message: 'x'.repeat(61) })
    expect(v.errors.message).toBe('Message must be at most 60 characters')
  })

  test('rejects a dropdown value outside the choices', () => {
    const v = validateOptionValues(topperFields, { colour: 'Purple', message: 'Hi' })
    expect(v.errors.colour).toBe('Colour must be one of the listed options')
  })

  test('accepts a complete value set (optional Age omitted)', () => {
    const v = validateOptionValues(topperFields, { colour: 'Gold', message: 'Happy Birthday' })
    expect(v.valid).toBe(true)
    expect(v.errors).toEqual({})
  })

  test('handles absent fields gracefully', () => {
    expect(validateOptionValues(undefined, {}).valid).toBe(true)
    expect(validateOptionValues(null, {}).valid).toBe(true)
  })
})

describe('normalizeOptionValues', () => {
  test('coerces numbers, trims strings, drops empties, caps maxLength', () => {
    const out = normalizeOptionValues(topperFields, {
      colour: 'Gold',
      message: '  Happy Birthday  ',
      age: '21',
      notes: '   ',
    })
    expect(out).toEqual({ colour: 'Gold', message: 'Happy Birthday', age: 21 })
    expect(typeof out.age).toBe('number')
    expect(normalizeOptionValues(topperFields, { colour: 'Gold', message: 'x'.repeat(70) }).message).toHaveLength(60)
  })
})

/* ───────────────────────────── Payloads ───────────────────────────── */

const topperService: Service = {
  id: 'svc-topper',
  type: 'paberin_topper_acrylic',
  label: 'Acrylic Cake Topper',
  description: 'Custom acrylic cake topper',
  category: 'CAKE_TOPPERS',
  basePriceNaira: 15000,
  unit: 'per piece',
  minPriceNaira: 15000,
  customerSupplied: false,
  standardLeadTime: '5-7 working days',
  expressLeadTime: null,
  allowExpress: false,
  expressSurchargePct: 0,
  options: [],
  optionFields: topperFields,
}

const legacyService: Service = {
  ...topperService,
  id: 'svc-legacy',
  type: 'paberin_fabric_per_yard',
  label: 'Fabric Cutting (per yard)',
  options: ['A4', 'A3'],
  optionFields: null,
}

const plainService: Service = {
  ...topperService,
  id: 'svc-plain',
  type: 'paberin_sheet_cutting',
  label: 'Sheet Cutting',
  options: [],
  optionFields: null,
}

const PICKUP = '2026-08-07T16:00:00.000Z'

const baseInput = {
  serviceType: 'paberin_topper_acrylic',
  quantity: 1,
  sla: 'Standard',
  requestedPickupTime: PICKUP,
}

describe('buildQuotePayload', () => {
  test('sends requestedPickupTime and selectedOptions for structured services', () => {
    const payload = buildQuotePayload({
      ...baseInput,
      service: topperService,
      selectedVariant: 'ignored', // must NOT leak into the structured payload
      selectedOptions: { colour: 'Gold', message: 'Happy Birthday', age: '21' },
    })
    expect(payload.requestedPickupTime).toBe(PICKUP)
    expect(payload.selectedOptions).toEqual({ colour: 'Gold', message: 'Happy Birthday', age: 21 })
    expect(payload).not.toHaveProperty('selectedVariant')
  })

  test('sends selectedVariant (string) for legacy option lists', () => {
    const payload = buildQuotePayload({
      ...baseInput,
      service: legacyService,
      selectedVariant: 'A4',
      selectedOptions: { colour: 'Gold' }, // must NOT leak into the legacy payload
    })
    expect(payload.requestedPickupTime).toBe(PICKUP)
    expect(payload.selectedVariant).toBe('A4')
    expect(payload).not.toHaveProperty('selectedOptions')
  })

  test('sends neither key for services without options', () => {
    const payload = buildQuotePayload({ ...baseInput, service: plainService })
    expect(payload).not.toHaveProperty('selectedVariant')
    expect(payload).not.toHaveProperty('selectedOptions')
  })
})

describe('buildOrderPayload', () => {
  const customer = {
    customerName: 'Ada Obi',
    customerPhone: '08033503068',
    customerEmail: 'ada@example.com',
  }

  test('catalog order: requestedPickupTime + selectedOptions + serviceType, no customSpec', () => {
    const payload = buildOrderPayload({
      ...baseInput,
      service: topperService,
      selectedOptions: { colour: 'Gold', message: 'Happy Birthday', age: '21' },
      ...customer,
      deliveryMethod: 'PICKUP',
    })
    expect(payload.requestedPickupTime).toBe(PICKUP)
    expect(payload.selectedOptions).toEqual({ colour: 'Gold', message: 'Happy Birthday', age: 21 })
    expect(payload.serviceType).toBe('paberin_topper_acrylic')
    expect(payload.customerEmail).toBe('ada@example.com')
    expect(payload).not.toHaveProperty('customSpec')
    expect(payload).not.toHaveProperty('selectedVariant')
  })

  test('catalog order with legacy options sends selectedVariant only', () => {
    const payload = buildOrderPayload({
      ...baseInput,
      service: legacyService,
      selectedVariant: 'A3',
      ...customer,
      deliveryMethod: 'PICKUP',
    })
    expect(payload.selectedVariant).toBe('A3')
    expect(payload).not.toHaveProperty('selectedOptions')
  })

  test('custom order: requestedPickupTime + customSpec, no catalog option keys', () => {
    const payload = buildOrderPayload({
      ...baseInput,
      service: null,
      serviceType: '',
      ...customer,
      deliveryMethod: 'PICKUP',
      customSpec: { description: 'Cut my jeans into a pattern', complexity: 'simple' },
    })
    expect(payload.requestedPickupTime).toBe(PICKUP)
    expect(payload.customSpec).toEqual({ description: 'Cut my jeans into a pattern', complexity: 'simple' })
    expect(payload).not.toHaveProperty('serviceType')
    expect(payload).not.toHaveProperty('selectedOptions')
    expect(payload).not.toHaveProperty('selectedVariant')
  })
})
