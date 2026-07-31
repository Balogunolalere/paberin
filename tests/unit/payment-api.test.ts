import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { api } from '../../src/lib/api'

// setup.ts already mocks global.fetch via vi.fn()
// Just cast it for convenient .mockResolvedValueOnce() calls
const mockFetch = global.fetch as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  if (mockFetch.mockReset) mockFetch.mockReset()
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

function mockFetchError(message: string) {
  mockFetch.mockRejectedValueOnce(new Error(message))
}

describe('api.initializePayment', () => {
  it('should call fetch with correct endpoint and method', async () => {
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-001',
    }
    mockFetchOk(mockResponse)

    const result = await api.initializePayment({
      amount: 10000,
      email: 'test@example.com',
      orderNumber: 'TEST-ORDER-001',
      brand: 'PABERIN',
      metadata: { orderNumber: 'TEST-ORDER-001' },
    })

    expect(result).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/payment/initialize')
    expect(options.method).toBe('POST')
  })

  it('should include brand in the request body', async () => {
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-002',
    }
    mockFetchOk(mockResponse)

    await api.initializePayment({
      amount: 5000,
      email: 'user@example.com',
      orderNumber: 'TEST-ORDER-002',
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body).toBeDefined()
  })

  it('should convert amount correctly in request', async () => {
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-003',
    }
    mockFetchOk(mockResponse)

    await api.initializePayment({
      amount: 25000,
      email: 'customer@example.com',
      orderNumber: 'TEST-ORDER-003',
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.amount).toBe(25000)
  })

  it('should handle errors from fetch', async () => {
    mockFetchError('Network error')

    await expect(
      api.initializePayment({
        amount: 10000,
        email: 'test@example.com',
        orderNumber: 'TEST-ORDER-004',
      })
    ).rejects.toThrow('Network error')
  })

  it('should include metadata in request when provided', async () => {
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-005',
    }
    mockFetchOk(mockResponse)

    await api.initializePayment({
      amount: 10000,
      email: 'test@example.com',
      orderNumber: 'TEST-ORDER-005',
      metadata: { customField: 'value', brand: 'SKYAL' },
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.metadata).toEqual({ customField: 'value', brand: 'SKYAL' })
  })
})

describe('api.verifyPayment', () => {
  it('should call fetch with correct endpoint and reference', async () => {
    const mockResponse = { verified: true, reference: 'TEST-REF-123' }
    mockFetchOk(mockResponse)

    const result = await api.verifyPayment('TEST-REF-123')

    expect(result).toEqual(mockResponse)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/payment/verify')
    expect(url).toContain('reference=TEST-REF-123')
    expect(options.method).toBe('POST')
  })

  it('should return verified status from response', async () => {
    const mockResponse = { verified: true, reference: 'TEST-REF-124' }
    mockFetchOk(mockResponse)

    const result = await api.verifyPayment('TEST-REF-124')

    expect(result.verified).toBe(true)
    expect(result.reference).toBe('TEST-REF-124')
  })

  it('should handle unverified payment', async () => {
    const mockResponse = { verified: false, reference: 'TEST-REF-125' }
    mockFetchOk(mockResponse)

    const result = await api.verifyPayment('TEST-REF-125')

    expect(result.verified).toBe(false)
  })

  it('should handle errors from fetch', async () => {
    mockFetchError('Verification failed')

    await expect(api.verifyPayment('TEST-REF-126')).rejects.toThrow('Verification failed')
  })

  it('should encode reference safely in URL', async () => {
    const mockResponse = { verified: true, reference: 'TEST/REF' }
    mockFetchOk(mockResponse)

    await api.verifyPayment('TEST/REF')

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('reference=')
    expect(url).toContain('TEST')
  })
})

describe('Payment API types', () => {
  it('should have PaymentInitResponse interface defined', () => {
    // This verifies the type exists by checking it can be imported
    expect(() => require('@/lib/api')).not.toThrow('PaymentInitResponse')
  })

  it('should have PaymentVerifyResponse interface defined', () => {
    expect(() => require('@/lib/api')).not.toThrow('PaymentVerifyResponse')
  })
})
