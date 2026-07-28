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

// Mock fetch for API calls
global.fetch = vi.fn()

// Set up environment variables
process.env.CHAT_MODE = process.env.CHAT_MODE || 'mock'
process.env.NEXT_PUBLIC_ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000'