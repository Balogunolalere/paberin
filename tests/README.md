# PABERIN Test Suite

This directory contains tests for the PABERIN customer-facing website.

## Test Structure

| Directory | Tests |
|-----------|-------|
| `tests/unit/` | Unit tests for API client, utilities, and components |
| `tests/e2e/` | End-to-end tests for chat API |

## Test Files

### Unit Tests (`tests/unit/`)

| File | Coverage |
|------|----------|
| `api.test.ts` | Chat API evaluation (placeholder tests) |
| `chat.test.ts` | `extractPriceFromText` function tests |
| `payment-api.test.ts` | **NEW** - API wrapper payment functions (`initializePayment`, `verifyPayment`) |
| `order-payment.test.ts` | **NEW** - Order page payment flow testing |

### Integration Tests (`tests/`)

| File | Coverage |
|------|----------|
| `payment-flow.test.ts` | **NEW** - Complete order-to-payment flow integration |
| `track-payment.test.ts` | **NEW** - Tracking page payment verification |

## Running Tests

```bash
# Run all unit tests
pnpm test tests/unit/

# Run specific test
pnpm test tests/unit/payment-api.test.ts

# Run integration tests
pnpm test tests/integration/payment-flow.test.ts
```

## Environment Variables

Required for tests:
- `NEXT_PUBLIC_ADMIN_API_URL` - URL of the admin backend (default: `http://localhost:3000`)
- `AGNES_API_KEY` - For chat API tests (can be mock)

## Key Test Scenarios

### Payment API Tests
- `initializePayment`: Correct endpoint, payload structure, brand handling, error handling
- `verifyPayment`: Reference encoding, response parsing, error handling

### Order Page Tests
- Payment initialization after order creation
- Redirect to Paystack authorization URL
- Fallback on payment initialization failure
- Brand metadata inclusion

### Payment Flow Tests
- Complete sequence: quote → order → payment initialization
- Amount consistency between order total and Paystack request
- Error handling at each step

### Tracking Page Tests
- Payment verification on return from Paystack
- Status display based on payment state
