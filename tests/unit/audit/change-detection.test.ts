import { describe, it, expect } from 'vitest'
import {
  detectChanges,
  detectCreateChanges,
  detectDeleteChanges,
} from '../../../src/lib/audit/change-detection.js'

describe('Change Detection', () => {
  describe('detectChanges', () => {
    it('should detect simple field changes', () => {
      const before = { name: 'John', email: 'john@example.com' }
      const after = { name: 'Jane', email: 'john@example.com' }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'name',
        oldValue: 'John',
        newValue: 'Jane',
        valueType: 'string',
      })
    })

    it('should detect multiple field changes', () => {
      const before = { name: 'John', email: 'john@example.com', age: 30 }
      const after = { name: 'Jane', email: 'jane@example.com', age: 30 }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(2)
      expect(changes.map((c) => c.path).sort()).toEqual(['email', 'name'])
    })

    it('should detect nested object changes', () => {
      const before = { user: { address: { city: 'NYC', zip: '10001' } } }
      const after = { user: { address: { city: 'LA', zip: '10001' } } }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'user.address.city',
        oldValue: 'NYC',
        newValue: 'LA',
        valueType: 'string',
      })
    })

    it('should detect array element changes', () => {
      const before = { items: ['a', 'b', 'c'] }
      const after = { items: ['a', 'x', 'c'] }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'items[1]',
        oldValue: 'b',
        newValue: 'x',
        valueType: 'string',
      })
    })

    it('should detect array length changes', () => {
      const before = { items: ['a', 'b'] }
      const after = { items: ['a', 'b', 'c'] }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'items[2]',
        oldValue: undefined,
        newValue: 'c',
        valueType: 'string',
      })
    })

    it('should detect added fields', () => {
      const before = { name: 'John' }
      const after = { name: 'John', email: 'john@example.com' }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'email',
        oldValue: undefined,
        newValue: 'john@example.com',
        valueType: 'string',
      })
    })

    it('should detect removed fields', () => {
      const before = { name: 'John', email: 'john@example.com' }
      const after = { name: 'John' }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'email',
        oldValue: 'john@example.com',
        newValue: undefined,
        valueType: 'string',
      })
    })

    it('should exclude default system fields', () => {
      const before = {
        id: '123',
        name: 'John',
        version: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        active: true,
      }
      const after = {
        id: '123',
        name: 'Jane',
        version: 2,
        createdAt: '2026-01-01',
        updatedAt: '2026-02-01',
        active: false,
      }

      const changes = detectChanges(before, after)

      // Only name should be detected (version, updatedAt, active are excluded)
      expect(changes).toHaveLength(1)
      expect(changes[0].path).toBe('name')
    })

    it('should exclude custom fields when specified', () => {
      const before = { name: 'John', password: 'secret1', email: 'a@b.com' }
      const after = { name: 'Jane', password: 'secret2', email: 'c@d.com' }

      const changes = detectChanges(before, after, {
        excludeFields: ['password'],
      })

      expect(changes).toHaveLength(2)
      expect(changes.map((c) => c.path).sort()).toEqual(['email', 'name'])
    })

    it('should return empty array when no changes', () => {
      const before = { name: 'John', age: 30 }
      const after = { name: 'John', age: 30 }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(0)
    })

    it('should handle null values', () => {
      const before = { name: 'John', nickname: null }
      const after = { name: 'John', nickname: 'Johnny' }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        path: 'nickname',
        oldValue: null,
        newValue: 'Johnny',
        valueType: 'string',
      })
    })

    it('should handle type changes', () => {
      const before = { value: '123' }
      const after = { value: 123 }

      const changes = detectChanges(before, after)

      expect(changes).toHaveLength(1)
      expect(changes[0].valueType).toBe('number')
    })

    it('should respect maxDepth option', () => {
      const before = { a: { b: { c: { d: { e: 'old' } } } } }
      const after = { a: { b: { c: { d: { e: 'new' } } } } }

      const changes = detectChanges(before, after, { maxDepth: 3 })

      // Changes deeper than maxDepth should not be detected
      expect(changes).toHaveLength(0)
    })
  })

  describe('detectCreateChanges', () => {
    it('should return all fields as new', () => {
      const entity = { name: 'John', email: 'john@example.com' }

      const changes = detectCreateChanges(entity)

      expect(changes).toHaveLength(2)
      expect(changes.every((c) => c.oldValue === null)).toBe(true)
    })

    it('should exclude default system fields', () => {
      const entity = {
        id: '123',
        name: 'John',
        version: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        active: true,
      }

      const changes = detectCreateChanges(entity)

      // Only name should be included (id is kept for tracing)
      expect(changes.map((c) => c.path)).toContain('name')
      expect(changes.map((c) => c.path)).toContain('id')
    })
  })

  describe('detectDeleteChanges', () => {
    it('should return all fields as removed', () => {
      const entity = { name: 'John', email: 'john@example.com' }

      const changes = detectDeleteChanges(entity)

      expect(changes).toHaveLength(2)
      expect(changes.every((c) => c.newValue === null)).toBe(true)
    })

    it('should exclude default system fields', () => {
      const entity = {
        id: '123',
        name: 'John',
        version: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        active: true,
      }

      const changes = detectDeleteChanges(entity)

      expect(changes.map((c) => c.path)).toContain('name')
      expect(changes.map((c) => c.path)).toContain('id')
    })
  })
})
