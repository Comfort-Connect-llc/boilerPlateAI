import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js'
import { requestContextMiddleware } from '../../src/lib/request-context.js'
import accountRoutes from '../../src/modules/accounts/account.routes.js'

// Mock auth middleware to skip authentication in tests
vi.mock('../../src/middleware/auth.js', () => ({
  requirePermissions: () => (_req: any, _res: any, next: any) => next(),
  requireAnyPermission: () => (_req: any, _res: any, next: any) => next(),
}))

// Mock account service
vi.mock('../../src/modules/accounts/account.service.js', () => ({
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  listAccounts: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}))

// Mock request context user
vi.mock('../../src/lib/request-context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/request-context.js')>()
  return {
    ...actual,
    getUser: vi.fn().mockReturnValue({
      sub: 'auth0|test-user',
      permissions: ['read:accounts', 'write:accounts', 'delete:accounts'],
    }),
  }
})

describe('Account Routes', () => {
  let app: express.Express

  beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use(requestContextMiddleware)
    app.use('/api/v1/accounts', accountRoutes)
    app.use(notFoundHandler)
    app.use(errorHandler)
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/v1/accounts', () => {
    it('should create an account with valid data', async () => {
      const { createAccount } = await import('../../src/modules/accounts/account.service.js')
      const mockAccount = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Account',
        email: 'test@example.com',
        version: 1,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditTrail: [],
      }

      vi.mocked(createAccount).mockResolvedValue(mockAccount)

      const response = await request(app)
        .post('/api/v1/accounts')
        .send({
          name: 'Test Account',
          email: 'test@example.com',
        })

      expect(response.status).toBe(201)
      expect(response.body.message).toBe('Account created successfully')
      expect(response.body.data).toMatchObject({
        id: mockAccount.id,
        name: 'Test Account',
        email: 'test@example.com',
      })
    })

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/accounts')
        .send({
          name: 'Test Account',
          email: 'not-an-email',
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Validation failed')
    })

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/accounts')
        .send({
          name: 'Test Account',
          // missing email
        })

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/v1/accounts/:id', () => {
    it('should return account by id', async () => {
      const { getAccount } = await import('../../src/modules/accounts/account.service.js')
      const mockAccount = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Account',
        email: 'test@example.com',
        version: 1,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditTrail: [],
      }

      vi.mocked(getAccount).mockResolvedValue(mockAccount)

      const response = await request(app)
        .get('/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000')

      expect(response.status).toBe(200)
      expect(response.body.data).toMatchObject({
        id: mockAccount.id,
        name: 'Test Account',
      })
    })

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/invalid-uuid')

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/v1/accounts', () => {
    it('should list accounts with pagination', async () => {
      const { listAccounts } = await import('../../src/modules/accounts/account.service.js')

      vi.mocked(listAccounts).mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Account 1',
            email: 'account1@example.com',
            version: 1,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            auditTrail: [],
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
      })

      const response = await request(app)
        .get('/api/v1/accounts')
        .query({ page: 1, pageSize: 10 })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(1)
      expect(response.body.pagination).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 1,
      })
    })

    it('should accept search parameter', async () => {
      const { listAccounts } = await import('../../src/modules/accounts/account.service.js')

      vi.mocked(listAccounts).mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      })

      const response = await request(app)
        .get('/api/v1/accounts')
        .query({ search: 'test' })

      expect(response.status).toBe(200)
      expect(listAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test' })
      )
    })
  })

  describe('PUT /api/v1/accounts/:id', () => {
    it('should update account', async () => {
      const { updateAccount } = await import('../../src/modules/accounts/account.service.js')
      const mockAccount = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated Name',
        email: 'test@example.com',
        version: 2,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditTrail: [],
      }

      vi.mocked(updateAccount).mockResolvedValue(mockAccount)

      const response = await request(app)
        .put('/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated Name' })

      expect(response.status).toBe(200)
      expect(response.body.data.name).toBe('Updated Name')
    })

    it('should reject invalid email in update', async () => {
      const response = await request(app)
        .put('/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000')
        .send({ email: 'invalid-email' })

      expect(response.status).toBe(400)
    })
  })

  describe('DELETE /api/v1/accounts/:id', () => {
    it('should soft delete account', async () => {
      const { deleteAccount } = await import('../../src/modules/accounts/account.service.js')
      vi.mocked(deleteAccount).mockResolvedValue(undefined)

      const response = await request(app)
        .delete('/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000')

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Account deleted successfully')
      expect(deleteAccount).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    })
  })
})
