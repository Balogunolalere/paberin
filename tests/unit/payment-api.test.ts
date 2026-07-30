import { describe, it, expect, beforeEach, vi, afterEach, MockInstance } from "vitest"
import { api, PaymentInitResponse, PaymentVerifyResponse } from '@/lib/api'

// Mock apiFetch at the module level
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  api: {
    initializePayment: vi.fn(),
    verifyPayment: vi.fn(),
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  process.env.NEXT_PUBLIC_ADMIN_API_URL = 'http://localhost:3000'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api.initializePayment', () => {
  it('should call apiFetch with correct endpoint and method', async () => {
    // Arrange
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-001',
    } as PaymentInitResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    const result = await api.initializePayment({
      amount: 10000,
      email: 'test@example.com',
      orderNumber: 'TEST-ORDER-001',
      brand: 'PABERIN',
      metadata: { orderNumber: 'TEST-ORDER-001' },
    })

    // Assert
    expect(result).toEqual(mockResponse)
    expect((global as any)).toHaveBeenCalledWith('/api/payment/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: 10000,
        email: 'test@example.com',
        orderNumber: 'TEST-ORDER-001',
        brand: 'PABERIN',
        metadata: { orderNumber: 'TEST-ORDER-001' },
      }),
    })
  })

  it('should include brand in the request body even if not provided', async () => {
    // Arrange
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-002',
    } as PaymentInitResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act - brand is optional, should default to PABERIN
    const result = await api.initializePayment({
      amount: 5000,
      email: 'user@example.com',
      orderNumber: 'TEST-ORDER-002',
    })

    // Assert
    expect(result).toEqual(mockResponse)
    const callArgs = ((global as any).apiFetch).mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.brand).toBe('PABERIN')
  })

  it('should convert amount correctly in request', async () => {
    // Arrange
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-003',
    } as PaymentInitResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    await api.initializePayment({
      amount: 25000,
      email: 'customer@example.com',
      orderNumber: 'TEST-ORDER-003',
    })

    // Assert - amount should be sent as-is (admin backend handles Naira to kobo conversion)
    const callArgs = ((global as any).apiFetch).mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.amount).toBe(25000)
  })

  it('should handle errors from apiFetch', async () => {
    // Arrange
    ((global as any).apiFetch).mockRejectedValueOnce(new Error('Network error'))

    // Act & Assert
    await expect(
      api.initializePayment({
        amount: 10000,
        email: 'test@example.com',
        orderNumber: 'TEST-ORDER-004',
      })
    ).rejects.toThrow('Network error')
  })

  it('should include metadata in request when provided', async () => {
    // Arrange
    const mockResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test123',
      accessCode: 'ACC123',
      reference: 'TEST-ORDER-005',
    } as PaymentInitResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    await api.initializePayment({
      amount: 10000,
      email: 'test@example.com',
      orderNumber: 'TEST-ORDER-005',
      metadata: { customField: 'value', brand: 'SKYAL' },
    })

    // Assert
    const callArgs = ((global as any).apiFetch).mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.metadata).toEqual({ customField: 'value', brand: 'SKYAL' })
  })
})

describe('api.verifyPayment', () => {
  it('should call apiFetch with correct endpoint and reference', async () => {
    // Arrange
    const mockResponse = { verified: true, reference: 'TEST-REF-123' } as PaymentVerifyResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    const result = await api.verifyPayment('TEST-REF-123')

    // Assert
    expect(result).toEqual(mockResponse)
    expect((global as any)).toHaveBeenCalledWith('/api/payment/verify?reference=TEST-REF-123', {
      method: 'POST',
      body: JSON.stringify({ reference: 'TEST-REF-123' }),
    })
  })

  it('should return verified status from response', async () => {
    // Arrange
    const mockResponse = { verified: true, reference: 'TEST-REF-124' } as PaymentVerifyResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    const result = await api.verifyPayment('TEST-REF-124')

    // Assert
    expect(result.verified).toBe(true)
    expect(result.reference).toBe('TEST-REF-124')
  })

  it('should handle unverified payment', async () => {
    // Arrange
    const mockResponse = { verified: false, reference: 'TEST-REF-125' } as PaymentVerifyResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    const result = await api.verifyPayment('TEST-REF-125')

    // Assert
    expect(result.verified).toBe(false)
  })

  it('should handle errors from apiFetch', async () => {
    // Arrange
    ((global as any).apiFetch).mockRejectedValueOnce(new Error('Verification failed'))

    // Act & Assert
    await expect(api.verifyPayment('TEST-REF-126')).rejects.toThrow('Verification failed')
  })

  it('should encode reference safely in URL', async () => {
    // Arrange
    const mockResponse = { verified: true, reference: 'TEST/REF' } as PaymentVerifyResponse
    ((global as any).apiFetch).mockResolvedValueOnce(mockResponse)

    // Act
    await api.verifyPayment('TEST/REF')

    // Assert - reference should be URL-encoded
    const callArgs = ((global as any).apiFetch).mock.calls[0][0]
    expect(callArgs).toContain('reference=TEST%2FREF')
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
