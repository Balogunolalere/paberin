# Paberin LLM Chat Evaluation Setup

## Overview

This repository contains comprehensive evaluation scripts for testing the Agnes 2.0 Flash LLM chat integration in the Paberin application.

## Testing Infrastructure

The evaluation suite includes:

1. **Unit Tests** (`tests/unit/`) - Tests for individual functions like price extraction
2. **Integration Tests** (`tests/e2e/`) - Tests for the chat API endpoint
3. **Evaluation Scripts** (`scripts/`) - Comprehensive LLM testing scripts

## Running Tests

### Install Dependencies

First, install testing dependencies:

```bash
pnpm add -D vitest @types/node ts-node
```

### Run Unit Tests

```bash
# Run unit tests
pnpm vitest

# Run unit tests in watch mode
pnpm vitest watch

# Run unit tests with coverage
pnpm vitest run --coverage

# Run specific test file
pnpm vitest tests/unit/chat.test.ts
```

### Run Evaluation Script

```bash
# Run the comprehensive LLM evaluation
node scripts/evaluate-chat.js

# Or with pnpm (add to package.json scripts)
pnpm eval:chat: node scripts/evaluate-chat.js
```

## Configuration

### Environment Variables

Set up your `.env.local` file:

```env
NEXT_PUBLIC_ADMIN_API_URL=https://your-admin-api-url.com
AGNES_API_KEY=your_actual_api_key_here
CHAT_MODE=live|mock
```

- `CHAT_MODE=mock`: Uses mock responses (no API key needed)
- `CHAT_MODE=live`: Calls the actual Agnes API (requires AGNES_API_KEY)

### Vitest Configuration

See `vitest.config.ts` for test configuration.

## Test Categories

### Functional Tests
- Basic greeting recognition
- Empty message handling
- Session persistence

### Quality Tests
- Response length validation
- Price extraction accuracy
- Latency measurement

### Safety Tests
- Prompt injection resistance
- PII protection

### Domain-Specific Tests
- Material knowledge
- Lead time information
- Currency handling (Naira)

### Edge Case Tests
- Long input handling
- Special characters handling

## Report Generation

Evaluation results are saved as markdown reports in the `eval-results/` directory with timestamps.

## Exit Codes

- `0`: All tests passed
- `1`: Some tests failed
- `2`: Fatal error

## Contributing

New test cases should be added to the appropriate test suite with clear descriptions of what they're testing and why they matter for the Paberin chat experience.