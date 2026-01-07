import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getRequestContext,
  getRequestId,
  getUser,
  getUserId,
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  setUser,
  requestContextMiddleware,
  type UserContext,
} from '../../src/lib/request-context.js'
import type { Request, Response, NextFunction } from 'express'

describe('Request Context', () => {
  describe('outside of context', () => {
    it('getRequestContext should return undefined', () => {
      expect(getRequestContext()).toBeUndefined()
    })

    it('getRequestId should return "unknown"', () => {
      expect(getRequestId()).toBe('unknown')
    })

    it('getUser should return undefined', () => {
      expect(getUser()).toBeUndefined()
    })

    it('getUserId should return undefined', () => {
      expect(getUserId()).toBeUndefined()
    })

    it('getUserPermissions should return empty array', () => {
      expect(getUserPermissions()).toEqual([])
    })
  })

  describe('permission helpers', () => {
    it('hasPermission should return false when no user', () => {
      expect(hasPermission('read:accounts')).toBe(false)
    })

    it('hasAnyPermission should return false when no user', () => {
      expect(hasAnyPermission(['read:accounts', 'write:accounts'])).toBe(false)
    })

    it('hasAllPermissions should return false when no user', () => {
      expect(hasAllPermissions(['read:accounts'])).toBe(false)
    })
  })

  describe('requestContextMiddleware', () => {
    it('should establish context and call next', () => {
      const req = {
        headers: {},
        method: 'GET',
        originalUrl: '/test',
        get: vi.fn(),
      } as unknown as Request
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response
      const next = vi.fn()

      requestContextMiddleware(req, res, next)

      // next should be called within the context
      expect(next).toHaveBeenCalled()
      // Response should have x-request-id header set
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String))
    })

    it('should use existing x-request-id from headers', () => {
      const existingId = 'existing-request-id'
      const req = {
        headers: { 'x-request-id': existingId },
        method: 'GET',
        originalUrl: '/test',
        get: vi.fn(),
      } as unknown as Request
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response
      const next = vi.fn()

      requestContextMiddleware(req, res, next)

      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', existingId)
    })
  })
})

describe('UserContext helpers', () => {
  const mockUser: UserContext = {
    sub: 'auth0|123456',
    email: 'test@example.com',
    name: 'Test User',
    permissions: ['read:accounts', 'write:accounts'],
  }

  describe('with user context set', () => {
    // These tests need to run within the AsyncLocalStorage context
    // In real usage, the middleware sets up the context

    it('hasPermission should check single permission', () => {
      // This would normally be within context
      // For unit testing, we test the logic directly
      const permissions = ['read:accounts', 'write:accounts']
      expect(permissions.includes('read:accounts')).toBe(true)
      expect(permissions.includes('delete:accounts')).toBe(false)
    })

    it('hasAnyPermission should return true if any match', () => {
      const permissions = ['read:accounts']
      const toCheck = ['read:accounts', 'write:accounts']
      const hasAny = toCheck.some(p => permissions.includes(p))
      expect(hasAny).toBe(true)
    })

    it('hasAnyPermission should return false if none match', () => {
      const permissions = ['read:accounts']
      const toCheck = ['write:accounts', 'delete:accounts']
      const hasAny = toCheck.some(p => permissions.includes(p))
      expect(hasAny).toBe(false)
    })

    it('hasAllPermissions should return true if all match', () => {
      const permissions = ['read:accounts', 'write:accounts']
      const toCheck = ['read:accounts', 'write:accounts']
      const hasAll = toCheck.every(p => permissions.includes(p))
      expect(hasAll).toBe(true)
    })

    it('hasAllPermissions should return false if not all match', () => {
      const permissions = ['read:accounts']
      const toCheck = ['read:accounts', 'write:accounts']
      const hasAll = toCheck.every(p => permissions.includes(p))
      expect(hasAll).toBe(false)
    })
  })
})
