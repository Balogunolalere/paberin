import { vi } from 'vitest'

// Global setup for tests
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((body) => ({
      json: () => body,
    })),
  },
}))

// Mock fetch for API calls. Keep the real implementation reachable first: a
// test that genuinely needs the network (tests/integration/backend-contract)
// can then opt out instead of silently getting `undefined` back — which is what
// this stub returns, and why such a test fails with "reading 'json' of undefined"
// rather than something that names the cause.
;(globalThis as unknown as { __realFetch?: typeof fetch }).__realFetch = globalThis.fetch
global.fetch = vi.fn() as unknown as typeof fetch

// Set up environment variables
process.env.CHAT_MODE = process.env.CHAT_MODE || 'mock'
process.env.NEXT_PUBLIC_ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000'