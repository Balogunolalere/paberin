import { describe, expect, test } from 'vitest'
import { matchChatQuoteToService, buildChatOrderNotes } from '@/lib/chat-order'
import type { ChatResponse, Service } from '@/lib/api'

/**
 * Fixture mirroring the LIVE admin catalog (fetched from
 * https://skyalxpaberin-admin.vercel.app/api/services?brand=PABERIN).
 * The AI prompt's item vocabulary (Full Buba, cake toppers, tags…) does NOT
 * match these labels — that mismatch is exactly what this module resolves.
 */
const SERVICES: Service[] = [
  { id: '1', type: 'paberin_topper_acrylic', label: 'Acrylic Cake Topper', description: '', category: 'ADD_ON', basePriceNaira: 15000, unit: 'piece', minPriceNaira: 15000, customerSupplied: false, standardLeadTime: '5 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '2', type: 'paberin_topper_mirror', label: 'Mirror Cake Topper', description: '', category: 'ADD_ON', basePriceNaira: 18000, unit: 'piece', minPriceNaira: 18000, customerSupplied: false, standardLeadTime: '5 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '3', type: 'paberin_topper_wood', label: 'Wooden Cake Topper', description: '', category: 'ADD_ON', basePriceNaira: 15000, unit: 'piece', minPriceNaira: 15000, customerSupplied: false, standardLeadTime: '5 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '4', type: 'paberin_topper_custom', label: 'Custom Cake Topper', description: '', category: 'ADD_ON', basePriceNaira: 25000, unit: 'piece', minPriceNaira: 25000, customerSupplied: false, standardLeadTime: '7 days', expressLeadTime: null, allowExpress: false, expressSurchargePct: 0 },
  { id: '5', type: 'paberin_signage_acrylic', label: 'Acrylic Signage', description: '', category: 'SHEET_CUTTING', basePriceNaira: 55000, unit: 'sheet', minPriceNaira: 55000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '6', type: 'paberin_signage_mirror', label: 'Mirror Signage', description: '', category: 'SHEET_CUTTING', basePriceNaira: 60000, unit: 'sheet', minPriceNaira: 60000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '7', type: 'paberin_printed_card', label: 'Printed Cards (per piece)', description: '', category: 'ADD_ON', basePriceNaira: 1500, unit: 'piece', minPriceNaira: 5000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '8', type: 'paberin_printed_tag', label: 'Printed Tags (per piece)', description: '', category: 'ADD_ON', basePriceNaira: 500, unit: 'piece', minPriceNaira: 5000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '9', type: 'paberin_acrylic_sticks', label: 'Acrylic Sticks (small batch)', description: '', category: 'SHEET_CUTTING', basePriceNaira: 100, unit: 'piece', minPriceNaira: 5000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '10', type: 'paberin_fabric_cutting', label: 'Fabric Laser Cutting (Paberin)', description: '', category: 'FABRIC_CUTTING', basePriceNaira: 20000, unit: 'section', minPriceNaira: 20000, customerSupplied: true, standardLeadTime: '5 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
  { id: '11', type: 'paberin_engraving_name', label: 'Name Engraving (Paberin)', description: '', category: 'ENGRAVING', basePriceNaira: 5000, unit: 'piece', minPriceNaira: 5000, customerSupplied: true, standardLeadTime: '2 days', expressLeadTime: null, allowExpress: false, expressSurchargePct: 0 },
  { id: '12', type: 'paberin_sheet_cutting', label: 'Sheet Cutting (Paberin, in-house)', description: '', category: 'SHEET_CUTTING', basePriceNaira: 40000, unit: 'sheet', minPriceNaira: 40000, customerSupplied: false, standardLeadTime: '3 days', expressLeadTime: '48h', allowExpress: true, expressSurchargePct: 50 },
]

function quote(overrides: Partial<NonNullable<ChatResponse['quote']>> = {}): ChatResponse['quote'] {
  const base: NonNullable<ChatResponse['quote']> = {
    price: 105000,
    original_price: undefined,
    bulk_discount: undefined,
    breakdown: {
      serviceLabel: 'Full Buba',
      serviceType: 'fabric_buba',
      sla: 'Standard',
      leadTime: '5 working days',
      basePrice: 35000,
      expressSurcharge: 0,
      addOnsTotal: 0,
      discount: 0,
      deliveryFee: 0,
      finalPriceNaira: 105000,
      quantity: 3,
    },
    summary: 'Full Buba: 3× ₦35,000 = ₦105,000. 5 working days',
  }
  return {
    ...base,
    ...overrides,
    breakdown: { ...base.breakdown, ...(overrides.breakdown ?? {}) },
  }
}

describe('matchChatQuoteToService', () => {
  test('matches an exact catalog label (Acrylic Cake Topper)', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Cake Topper', serviceType: 'cake_topper' } })
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_topper_acrylic')
    expect(mapped).toBe(false)
  })

  test('matches Custom Cake Topper exactly', () => {
    const q = quote({ breakdown: { serviceLabel: 'Custom Cake Topper', serviceType: 'cake_topper_custom' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_topper_custom')
  })

  test('maps "Full Buba" (fabric_buba) to Fabric Laser Cutting via category fallback', () => {
    const q = quote()
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_fabric_cutting')
    expect(mapped).toBe(true)
  })

  test('maps garment items (sleeves, wrapper, boubou) to fabric cutting', () => {
    for (const label of ['Sleeves (pair)', 'Bottom of Wrapper', 'Boubou', 'Full Buba + Full Wrapper']) {
      const q = quote({ breakdown: { serviceLabel: label, serviceType: 'fabric_cutting' } })
      const { service } = matchChatQuoteToService(q, SERVICES)
      expect(service?.type).toBe('paberin_fabric_cutting')
    }
  })

  test('maps Phone Back Engraving to Name Engraving', () => {
    const q = quote({ breakdown: { serviceLabel: 'Phone Back Engraving', serviceType: 'phone_engraving' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_engraving_name')
  })

  test('maps Acrylic Stick Cutting to Acrylic Sticks', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Stick Cutting', serviceType: 'acrylic_stick_cutting' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_acrylic_sticks')
  })

  test('maps tags/labels to Printed Tags', () => {
    const q = quote({ breakdown: { serviceLabel: 'Leather Tags', serviceType: 'tags_labels' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('paberin_printed_tag')
  })

  test('maps signage to Sheet Cutting', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Signage 4x4', serviceType: 'sheet_cutting' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(['paberin_sheet_cutting', 'paberin_signage_acrylic']).toContain(service?.type)
  })

  test('returns null when nothing matches', () => {
    const q = quote({ breakdown: { serviceLabel: 'Quantum Laser Sculpture', serviceType: 'quantum' } })
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service).toBeNull()
    expect(mapped).toBe(false)
  })

  test('returns null for empty quote/catalog', () => {
    expect(matchChatQuoteToService(null, SERVICES).service).toBeNull()
    expect(matchChatQuoteToService(quote(), []).service).toBeNull()
  })
})

describe('buildChatOrderNotes', () => {
  test('includes the customer request, summary, SLA and lead time', () => {
    const q = quote({
      breakdown: {
        sla: 'Express',
        leadTime: '48 hours minimum',
        notes: 'Customer brings fabric',
      },
    })
    const notes = buildChatOrderNotes(q, 'I need 3 full bubas for my wedding, express please')
    expect(notes).toContain('Customer request: I need 3 full bubas')
    expect(notes).toContain('₦105,000')
    expect(notes).toContain('Express service requested (+50%)')
    expect(notes).toContain('Lead time: 48 hours minimum')
    expect(notes).toContain('Customer brings fabric')
  })

  test('handles missing context', () => {
    const notes = buildChatOrderNotes(quote(), null)
    expect(notes).toContain('Full Buba: 3×')
    expect(notes).not.toContain('Customer request')
  })

  test('returns empty for no quote', () => {
    expect(buildChatOrderNotes(null, 'x')).toBe('')
  })
})
