import { vi, beforeAll, afterAll, afterEach } from 'vitest'

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.PORT = '3001'
process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
process.env.AUTH0_AUDIENCE = 'https://test-api'
process.env.AUTH0_CLIENT_ID = 'test-client-id'
process.env.AUTH0_CLIENT_SECRET = 'test-client-secret'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = 'test-access-key'
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.DYNAMODB_TABLE_PREFIX = 'test'
process.env.S3_BUCKET_NAME = 'test-bucket'
process.env.LOG_LEVEL = 'silent'

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks()
})

// Global test setup
beforeAll(() => {
  // Silence console during tests unless explicitly needed
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  vi.restoreAllMocks()
})

// =============================================
// Generic Test Helpers
// =============================================

/**
 * Creates a mock Auth0 JWT user payload
 * Use this to simulate authenticated requests in tests
 *
 * @param overrides - Custom user properties
 * @returns Mock user object
 *
 * @example
 * ```typescript
 * const mockUser = createMockAuthUser({
 *   permissions: ['read:invoices', 'write:invoices']
 * })
 * ```
 */
export function createMockAuthUser(overrides: Partial<{
  sub: string
  email: string
  name: string
  permissions: string[]
  metadata: Record<string, unknown>
}> = {}) {
  return {
    sub: 'auth0|123456789',
    email: 'test@example.com',
    name: 'Test User',
    permissions: ['read:test', 'write:test'],
    metadata: {},
    ...overrides,
  }
}

/**
 * Creates a mock request context for testing
 * Useful for testing service layer functions that use request context
 *
 * @param user - Mock user object
 * @param requestId - Custom request ID
 * @returns Mock request context
 *
 * @example
 * ```typescript
 * const context = createMockRequestContext(
 *   createMockAuthUser({ permissions: ['admin:system'] }),
 *   'test-request-123'
 * )
 * ```
 */
export function createMockRequestContext(
  user = createMockAuthUser(),
  requestId = 'test-request-id'
) {
  return {
    user,
    requestId,
    startTime: Date.now(),
  }
}

/**
 * Mocks an internal HTTP service call
 * Use this to mock calls to other internal services via http-client
 *
 * @param response - Mock response data
 * @returns Mock function
 *
 * @example
 * ```typescript
 * const mockFetch = mockServiceCall({ invoiceId: '123' })
 * // Use in your test setup
 * vi.mock('../lib/http-client', () => ({
 *   http: { post: mockFetch }
 * }))
 * ```
 */
export function mockServiceCall<T>(response: T) {
  return vi.fn().mockResolvedValue(response)
}

/**
 * Creates a mock base entity with common fields
 * Useful for mocking database entities in service tests
 *
 * @param overrides - Custom entity properties
 * @returns Mock entity object
 *
 * @example
 * ```typescript
 * const mockInvoice = createMockEntity({
 *   id: 'invoice-123',
 *   amount: 1000,
 *   status: 'paid'
 * })
 * ```
 */
export function createMockEntity<T extends Record<string, unknown>>(
  overrides: Partial<T> = {}
): T & {
  id: string
  version: number
  active: boolean
  createdAt: string
  updatedAt: string
} {
  const now = new Date().toISOString()
  return {
    id: 'mock-entity-id',
    version: 1,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as T & {
    id: string
    version: number
    active: boolean
    createdAt: string
    updatedAt: string
  }
}

/**
 * Creates a mock paginated response for testing list operations
 *
 * @param data - Array of items
 * @param total - Total number of items
 * @param page - Current page
 * @param pageSize - Items per page
 * @returns Mock paginated response
 *
 * @example
 * ```typescript
 * const mockResponse = createMockPaginatedResponse([item1, item2], 50, 1, 10)
 * ```
 */
export function createMockPaginatedResponse<T>(
  data: T[],
  total: number = data.length,
  page: number = 1,
  pageSize: number = 10
) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page < Math.ceil(total / pageSize),
      hasPrev: page > 1,
    },
  }
}
