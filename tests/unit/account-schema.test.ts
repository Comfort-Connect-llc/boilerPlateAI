import { describe, it, expect } from 'vitest'
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsQuerySchema,
  accountIdParamSchema,
} from '../../src/modules/accounts/account.schema.js'

describe('Account Schemas', () => {
  describe('createAccountSchema', () => {
    it('should validate valid input', () => {
      const result = createAccountSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('John Doe')
        expect(result.data.email).toBe('john@example.com')
      }
    })

    it('should accept optional metadata', () => {
      const result = createAccountSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        metadata: { tier: 'premium', source: 'api' },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata).toEqual({ tier: 'premium', source: 'api' })
      }
    })

    it('should reject missing name', () => {
      const result = createAccountSchema.safeParse({
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
    })

    it('should reject missing email', () => {
      const result = createAccountSchema.safeParse({
        name: 'John Doe',
      })

      expect(result.success).toBe(false)
    })

    it('should reject invalid email', () => {
      const result = createAccountSchema.safeParse({
        name: 'John Doe',
        email: 'not-an-email',
      })

      expect(result.success).toBe(false)
    })

    it('should reject empty name', () => {
      const result = createAccountSchema.safeParse({
        name: '',
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
    })

    it('should reject name over 255 characters', () => {
      const result = createAccountSchema.safeParse({
        name: 'a'.repeat(256),
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('updateAccountSchema', () => {
    it('should allow partial updates', () => {
      const result = updateAccountSchema.safeParse({
        name: 'New Name',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('New Name')
        expect(result.data.email).toBeUndefined()
      }
    })

    it('should allow empty object (no updates)', () => {
      const result = updateAccountSchema.safeParse({})

      expect(result.success).toBe(true)
    })

    it('should validate email if provided', () => {
      const invalidResult = updateAccountSchema.safeParse({
        email: 'not-an-email',
      })

      expect(invalidResult.success).toBe(false)

      const validResult = updateAccountSchema.safeParse({
        email: 'valid@example.com',
      })

      expect(validResult.success).toBe(true)
    })
  })

  describe('listAccountsQuerySchema', () => {
    it('should have default values', () => {
      const result = listAccountsQuerySchema.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(10)
        expect(result.data.orderBy).toBe('createdAt')
        expect(result.data.orderDirection).toBe('desc')
        expect(result.data.active).toBe(true)
      }
    })

    it('should coerce string values', () => {
      const result = listAccountsQuerySchema.safeParse({
        page: '2',
        pageSize: '25',
        active: 'false',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
        expect(result.data.pageSize).toBe(25)
        expect(result.data.active).toBe(false)
      }
    })

    it('should accept search parameter', () => {
      const result = listAccountsQuerySchema.safeParse({
        search: 'john',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.search).toBe('john')
      }
    })

    it('should validate orderBy enum', () => {
      const validResult = listAccountsQuerySchema.safeParse({
        orderBy: 'name',
      })
      expect(validResult.success).toBe(true)

      const invalidResult = listAccountsQuerySchema.safeParse({
        orderBy: 'invalidField',
      })
      expect(invalidResult.success).toBe(false)
    })

    it('should reject pageSize > 100', () => {
      const result = listAccountsQuerySchema.safeParse({
        pageSize: 101,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('accountIdParamSchema', () => {
    it('should validate valid UUID', () => {
      const result = accountIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = accountIdParamSchema.safeParse({
        id: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })

    it('should reject missing id', () => {
      const result = accountIdParamSchema.safeParse({})

      expect(result.success).toBe(false)
    })
  })
})
