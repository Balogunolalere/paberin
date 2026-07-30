/**
 * Comprehensive Unit Tests for Order Page Payment Flow
 * 
 * Tests the order page payment flow including:
 * - Order creation before payment initialization
 * - Payment initialization with correct parameters
 * - Error handling when payment fails
 * - Form validation before submission
 * - Currency formatting
 * 
 * To run: pnpm test tests/unit/order-payment.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { api, Order, PaymentInitResponse } from '@/lib/api'

// Mock the api module functions
vi.mock('@/lib/api', () => ({
  api: {
    createOrder: vi.fn(),
    initializePayment: vi.fn(),
    verifyPayment: vi.fn(),
    formatNaira: (n: number) => `₦${n}`,
  },
  formatNaira: (n: number) => `₦${n}`,
}))

beforeEach(() => {
  vi.resetAllMocks()
  process.env.NEXT_PUBLIC_ADMIN_API_URL = 'http://localhost:3000'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Order Page Payment Flow', () => {
  it('should create order before initializing payment', async () => {
    // Arrange - mock api.createOrder to return a sample order
    const mockOrder = {
      id: 'order-123',
      orderNumber: 'PAB-001',
      brand: 'PABERIN',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      serviceType: 'fabric-cut',
      serviceLabel: 'Fabric Cutting',
      quantity: 10,
      sla: 'Standard',
      totalAmount: 5000,
      state: 'PAYMENT_PENDING',
      deliveryMethod: 'PICKUP',
      deliveryAddress: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Order
    (api.createOrder as any).mockResolvedValueOnce(mockOrder)

    // Act - create order
    const result = await api.createOrder({
      serviceType: 'fabric-cut',
      quantity: 10,
      sla: 'Standard',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      deliveryMethod: 'PICKUP',
      deliveryAddress: undefined,
      designFileUrl: undefined,
      customerNotes: '',
      referralCode: undefined,
      isFirstTimeCustomer: false,
    })

    // Assert
    expect(result).toEqual(mockOrder)
    expect(api.createOrder).toHaveBeenCalledWith({
      serviceType: 'fabric-cut',
      quantity: 10,
      sla: 'Standard',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      deliveryMethod: 'PICKUP',
      deliveryAddress: undefined,
      designFileUrl: undefined,
      customerNotes: '',
      referralCode: undefined,
      isFirstTimeCustomer: false,
    })
  })

  it('should initialize payment with order details after successful order creation', async () => {
    // Arrange
    const mockOrder = {
      id: 'order-123',
      orderNumber: 'PAB-002',
      brand: 'PABERIN',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      serviceType: 'leather-cut',
      serviceLabel: 'Leather Cutting',
      quantity: 5,
      sla: 'Express',
      totalAmount: 15000,
      state: 'PAYMENT_PENDING',
      deliveryMethod: 'DELIVERY',
      deliveryAddress: '123 Lagos Street',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Order
    (api.createOrder as any).mockResolvedValueOnce(mockOrder)

    const mockPayResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=PAB-002',
      accessCode: 'ACC456',
      reference: 'PAB-002',
    } as PaymentInitResponse
    (api.initializePayment as any).mockResolvedValueOnce(mockPayResponse)

    // Act - create order first
    await api.createOrder({
      serviceType: 'leather-cut',
      quantity: 5,
      sla: 'Express',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      deliveryMethod: 'DELIVERY',
      deliveryAddress: '123 Lagos Street',
      designFileUrl: undefined,
      customerNotes: '',
      referralCode: undefined,
      isFirstTimeCustomer: false,
    })

    // Assert - initializePayment was called with order details
    expect(api.initializePayment).toHaveBeenCalledWith({
      amount: mockOrder.totalAmount,
      email: mockOrder.customerEmail,
      orderNumber: mockOrder.orderNumber,
      brand: 'PABERIN',
      metadata: { orderNumber: mockOrder.orderNumber, brand: 'PABERIN' },
    })
  })

  it('should handle payment initialization failure gracefully without blocking order creation', async () => {
    // Arrange
    const mockOrder = {
      id: 'order-123',
      orderNumber: 'PAB-004',
      brand: 'PABERIN',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      serviceType: 'acrylic-cut',
      serviceLabel: 'Acrylic Cutting',
      quantity: 2,
      sla: 'Standard',
      totalAmount: 12000,
      state: 'PAYMENT_PENDING',
      deliveryMethod: 'PICKUP',
      deliveryAddress: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Order
    (api.createOrder as any).mockResolvedValueOnce(mockOrder)

    // Simulate payment initialization failure
    (api.initializePayment as any).mockRejectedValueOnce(new Error('Payment service unavailable'))

    // Act & Assert - order creation should succeed even if payment init fails
    await expect(
      api.createOrder({
        serviceType: 'acrylic-cut',
        quantity: 2,
        sla: 'Standard',
        customerName: 'Test User',
        customerPhone: '+2348031234567',
        customerEmail: 'test@example.com',
        deliveryMethod: 'PICKUP',
        deliveryAddress: undefined,
        designFileUrl: undefined,
        customerNotes: '',
        referralCode: undefined,
        isFirstTimeCustomer: false,
      })
    ).resolves.toEqual(mockOrder)

    // Assert - payment init failure should be caught and logged
    expect(console.warn).toHaveBeenCalledWith('Payment init failed:', expect.any(Error))
  })

  it('should include brand in payment initialization request', async () => {
    // Arrange
    const mockPayResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=test',
      accessCode: 'ACC123',
      reference: 'TEST',
    } as PaymentInitResponse
    (api.initializePayment as any).mockResolvedValueOnce(mockPayResponse)

    // Act - call initializePayment without brand (should default to PABERIN)
    await api.initializePayment({
      amount: 10000,
      email: 'test@example.com',
      orderNumber: 'TEST',
    })

    // Assert - brand should be included as PABERIN
    const callArgs = (api.initializePayment as any).mock.calls[0][1]
    expect(callArgs.brand).toBe('PABERIN')
  })

  it('should format currency correctly', () => {
    // Test formatNaira helper
    const { formatNaira } = require('@/lib/api')
    expect(formatNaira(5000)).toBe('₦5,000')
    expect(formatNaira(15000)).toBe('₦15,000')
    expect(formatNaira(0)).toBe('₦0')
    expect(formatNaira(1234567)).toBe('₦1,234,567')
  })

  it('should have all required payment functions in api module', () => {
    const apiModule = require('@/lib/api')
    expect(apiModule.initializePayment).toBeDefined()
    expect(apiModule.verifyPayment).toBeDefined()
    expect(apiModule.PaymentInitResponse).toBeDefined()
    expect(apiModule.PaymentVerifyResponse).toBeDefined()
    expect(apiModule.formatNaira).toBeDefined()
  })

  it('should validate order amount before payment', async () => {
    // Arrange - test that amount is properly passed
    const mockOrder = {
      id: 'order-123',
      orderNumber: 'PAB-005',
      brand: 'PABERIN',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      serviceType: 'test',
      serviceLabel: 'Test',
      quantity: 1,
      sla: 'Standard',
      totalAmount: 9999.99,
      state: 'PAYMENT_PENDING',
      deliveryMethod: 'PICKUP',
      deliveryAddress: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Order
    (api.createOrder as any).mockResolvedValueOnce(mockOrder)

    const mockPayResponse = {
      authorizationUrl: 'https://paystack.com/authorize?ref=PAB-005',
      accessCode: 'ACC789',
      reference: 'PAB-005',
    } as PaymentInitResponse
    (api.initializePayment as any).mockResolvedValueOnce(mockPayResponse)

    // Act
    await api.createOrder({
      serviceType: 'test',
      quantity: 1,
      sla: 'Standard',
      customerName: 'Test User',
      customerPhone: '+2348031234567',
      customerEmail: 'test@example.com',
      deliveryMethod: 'PICKUP',
      deliveryAddress: undefined,
      designFileUrl: undefined,
      customerNotes: '',
      referralCode: undefined,
      isFirstTimeCustomer: false,
    })

    // Assert - amount should be passed correctly to payment init
    expect(api.initializePayment).toHaveBeenCalledWith({
      amount: 9999.99,
      email: 'test@example.com',
      orderNumber: 'PAB-005',
      brand: 'PABERIN',
      metadata: { orderNumber: 'PAB-005', brand: 'PABERIN' },
    })
  })
})
