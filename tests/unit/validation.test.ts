import { describe, it, expect, vi } from 'vitest'
import { z, commonSchemas } from '../../src/lib/validation.js'

describe('Zod schemas', () => {
  describe('z re-export', () => {
    it('should export zod', () => {
      expect(z).toBeDefined()
      expect(z.string).toBeDefined()
      expect(z.object).toBeDefined()
    })
  })
})

describe('commonSchemas', () => {
  describe('uuid', () => {
    it('should validate valid UUIDs', () => {
      const result = commonSchemas.uuid.safeParse('550e8400-e29b-41d4-a716-446655440000')
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUIDs', () => {
      const result = commonSchemas.uuid.safeParse('not-a-uuid')
      expect(result.success).toBe(false)
    })

    it('should reject empty strings', () => {
      const result = commonSchemas.uuid.safeParse('')
      expect(result.success).toBe(false)
    })
  })

  describe('pagination', () => {
    it('should have default values', () => {
      const result = commonSchemas.pagination.safeParse({})

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(10)
        expect(result.data.orderDirection).toBe('desc')
      }
    })

    it('should coerce string numbers', () => {
      const result = commonSchemas.pagination.safeParse({
        page: '5',
        pageSize: '20',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(5)
        expect(result.data.pageSize).toBe(20)
      }
    })

    it('should reject page < 1', () => {
      const result = commonSchemas.pagination.safeParse({ page: 0 })
      expect(result.success).toBe(false)
    })

    it('should reject pageSize > 100', () => {
      const result = commonSchemas.pagination.safeParse({ pageSize: 101 })
      expect(result.success).toBe(false)
    })

    it('should accept valid orderDirection', () => {
      const ascResult = commonSchemas.pagination.safeParse({ orderDirection: 'asc' })
      const descResult = commonSchemas.pagination.safeParse({ orderDirection: 'desc' })

      expect(ascResult.success).toBe(true)
      expect(descResult.success).toBe(true)
    })

    it('should reject invalid orderDirection', () => {
      const result = commonSchemas.pagination.safeParse({ orderDirection: 'invalid' })
      expect(result.success).toBe(false)
    })
  })

  describe('idParam', () => {
    it('should validate object with uuid id', () => {
      const result = commonSchemas.idParam.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(result.success).toBe(true)
    })

    it('should reject missing id', () => {
      const result = commonSchemas.idParam.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should reject invalid uuid', () => {
      const result = commonSchemas.idParam.safeParse({ id: 'invalid' })
      expect(result.success).toBe(false)
    })
  })
})
