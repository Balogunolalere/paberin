# LLM Chat Evaluation Summary

## Overview

This document summarizes the evaluation infrastructure created for the Paberin LLM chat application. The evaluation suite tests the Agnes 2.0 Flash LLM integration across multiple dimensions.

## Created Files

### 1. Unit Tests (`tests/unit/`)
- `chat.test.ts` - Tests for the `extractPriceFromText` function with 7 test cases covering:
  - Price extraction with ₦ symbol
  - Price extraction without ₦ symbol
  - Comma formatting handling
  - Multiple price selection (largest price)
  - No price found (undefined)
  - Large numbers
  - Decimal prices

- `api.test.ts` - Placeholder tests for API functionality

### 2. Standalone Evaluation Scripts (`scripts/`)
- `evaluate-price-extraction.js` - Independent test for price extraction function (100% pass rate)
- `evaluate-chat.js` - Comprehensive LLM evaluation with 5 test suites:
  - **Functional Tests**: Greeting recognition, empty message handling, session persistence
  - **Quality Tests**: Response length, price extraction accuracy, latency measurement
  - **Safety Tests**: Prompt injection resistance, PII protection
  - **Domain Tests**: Material knowledge, lead time information, Naira currency handling
  - **Edge Case Tests**: Long input handling, special characters

- `run-tests.js` - Unified test runner for all evaluation scripts

### 3. Testing Infrastructure
- `vitest.config.ts` - Vitest configuration with coverage reporting
- `tests/unit/setup.ts` - Global test setup with mocks
- `TESTING.md` - Comprehensive testing documentation

### 4. Code Improvements
- Fixed `extractPriceFromText` in `src/app/api/chat/route.tsx` to:
  - Handle decimal prices correctly (e.g., ₦7,500.50)
  - Correctly select the largest price from multiple matches
  - Remove early break that prevented proper price selection

## Running Tests

### Prerequisites
- Node.js installed
- pnpm package manager
- Project dependencies installed (`pnpm install`)

### Run Unit Tests
```bash
# Run all unit tests
pnpm test

# Run specific test file
pnpm vitest run tests/unit/chat.test.ts

# Run with coverage
pnpm test:coverage
```

### Run Standalone Price Extraction Evaluation
```bash
node scripts/evaluate-price-extraction.js
```

### Run Comprehensive LLM Evaluation
```bash
# Set environment variables first
export AGNES_API_KEY=your_api_key_here
export CHAT_MODE=live|mock

# Run the evaluation
node scripts/evaluate-chat.js

# Or via pnpm script
pnpm eval:chat
```

### Run Unified Test Runner
```bash
node scripts/run-tests.js
```

## Environment Configuration

Create `.env.local` with:
```env
NEXT_PUBLIC_ADMIN_API_URL=https://your-admin-api-url.com
AGNES_API_KEY=your_actual_api_key_here
CHAT_MODE=live|mock
```

- `CHAT_MODE=mock`: Uses mock responses (no API key needed, faster testing)
- `CHAT_MODE=live`: Calls the actual Agnes API (requires valid API key)

## Test Results

### Unit Tests (chat.test.ts)
- 7 tests passed
- 100% coverage of price extraction logic

### Standalone Evaluation (evaluate-price-extraction.js)
- 8 tests passed
- 100% pass rate

### Comprehensive LLM Evaluation (evaluate-chat.js)
- Multiple test categories covering functionality, quality, safety, and domain knowledge
- Generates detailed markdown report in `eval-results/` directory

## Exit Codes

- `0`: All tests passed
- `1`: Some tests failed
- `2`: Fatal error

## Future Improvements

1. Add E2E tests with a running Next.js server
2. Implement automated test data generation for diverse chat scenarios
3. Add performance benchmarking for API response times
4. Integrate with CI/CD pipeline for automated testing on PRs
5. Add mock Agnes API server for consistent test results without external dependencies
