import { describe, expect, test } from 'vitest'
import { buildChatOrderNotes } from '@/lib/chat-order'
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
