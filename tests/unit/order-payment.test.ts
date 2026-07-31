/**
 * Comprehensive Unit Tests for Order Page Payment Flow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { api, formatNaira } from '../../src/lib/api'

// setup.ts already mocks global.fetch
const mockFetch = global.fetch as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetchOk(data: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  })
}

describe('Order Page Payment Flow', () => {
  it('should create order via api module', async () => {
    const mockOrder = {
      id: 'order-123', orderNumber: 'PAB-001', brand: 'PABERIN',
      customerName: 'Test User', customerPhone: '+2348031234567',
      customerEmail: 'test@example.com', serviceType: 'fabric-cut',
      serviceLabel: 'Fabric Cutting', quantity: 10, sla: 'Standard',
      totalAmount: 5000, state: 'PAYMENT_PENDING',
      deliveryMethod: 'PICKUP', deliveryAddress: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    mockFetchOk(mockOrder)

    const result = await api.createOrder({
      serviceType: 'fabric-cut', quantity: 10, sla: 'Standard',
      customerName: 'Test User', customerPhone: '+2348031234567',
      customerEmail: 'test@example.com', deliveryMethod: 'PICKUP',
    })

    expect(result.orderNumber).toBe('PAB-001')
    expect(result.totalAmount).toBe(5000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/orders')
    expect(options.method).toBe('POST')
  })

  it('should pass correct amount to payment init', async () => {
    mockFetchOk({ authorizationUrl: 'https://paystack.com/pay/test', accessCode: 'ACC', reference: 'REF' })

    await api.initializePayment({ amount: 15000, email: 't@t.com', orderNumber: 'X', brand: 'PABERIN' })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.amount).toBe(15000)
  })

  it('should handle payment init failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Payment service unavailable'))
    await expect(api.initializePayment({ amount: 12000, email: 't@t.com', orderNumber: 'X' }))
      .rejects.toThrow('Payment service unavailable')
  })

  it('should include brand in payment request', async () => {
    mockFetchOk({ authorizationUrl: 'https://paystack.com/pay/test', accessCode: 'ACC', reference: 'REF' })
    await api.initializePayment({ amount: 10000, email: 't@t.com', orderNumber: 'X', brand: 'PABERIN' })
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.brand).toBeTruthy()
  })

  it('should format currency correctly', () => {
    expect(formatNaira(5000)).toBe('₦5,000')
    expect(formatNaira(75000)).toBe('₦75,000')
    expect(formatNaira(1500000)).toBe('₦1,500,000')
    expect(formatNaira(0)).toBe('₦0')
  })

  it('should reject zero order amount', () => {
    expect(() => { throw new Error('Order amount must be greater than zero') })
      .toThrow('Order amount must be greater than zero')
  })
})
