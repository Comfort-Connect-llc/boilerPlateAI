import { describe, it, expect } from 'vitest'
import {
  ApiError,
  isApiError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  internalError,
} from '../../src/lib/errors.js'

describe('ApiError', () => {
  describe('constructor', () => {
    it('should create an error with statusCode and default message', () => {
      const error = new ApiError({ statusCode: 404 })

      expect(error.statusCode).toBe(404)
      expect(error.message).toBe('Not Found')
      expect(error.isOperational).toBe(true)
      expect(error.details).toBeUndefined()
    })

    it('should create an error with custom message', () => {
      const error = new ApiError({
        statusCode: 400,
        message: 'Custom error message',
      })

      expect(error.statusCode).toBe(400)
      expect(error.message).toBe('Custom error message')
    })

    it('should create an error with details', () => {
      const error = new ApiError({
        statusCode: 400,
        message: 'Validation failed',
        details: { field: 'email', issue: 'invalid format' },
      })

      expect(error.details).toEqual({ field: 'email', issue: 'invalid format' })
    })

    it('should mark system errors as non-operational', () => {
      const error = new ApiError({
        statusCode: 500,
        isOperational: false,
      })

      expect(error.isOperational).toBe(false)
    })

    it('should preserve the cause', () => {
      const cause = new Error('Original error')
      const error = new ApiError({
        statusCode: 500,
        cause,
      })

      expect(error.cause).toBe(cause)
    })
  })

  describe('toJSON', () => {
    it('should serialize error without details', () => {
      const error = new ApiError({
        statusCode: 404,
        message: 'Not found',
      })

      expect(error.toJSON()).toEqual({
        statusCode: 404,
        message: 'Not found',
      })
    })

    it('should serialize error with details', () => {
      const error = new ApiError({
        statusCode: 400,
        message: 'Bad request',
        details: { field: 'name' },
      })

      expect(error.toJSON()).toEqual({
        statusCode: 400,
        message: 'Bad request',
        details: { field: 'name' },
      })
    })
  })
})

describe('isApiError', () => {
  it('should return true for ApiError instances', () => {
    const error = new ApiError({ statusCode: 404 })
    expect(isApiError(error)).toBe(true)
  })

  it('should return false for regular Error', () => {
    const error = new Error('Regular error')
    expect(isApiError(error)).toBe(false)
  })

  it('should return false for non-error values', () => {
    expect(isApiError(null)).toBe(false)
    expect(isApiError(undefined)).toBe(false)
    expect(isApiError('error')).toBe(false)
    expect(isApiError({ statusCode: 404 })).toBe(false)
  })
})

describe('Factory functions', () => {
  it('notFound should create 404 error', () => {
    const error = notFound('Resource not found', { id: '123' })

    expect(error.statusCode).toBe(404)
    expect(error.message).toBe('Resource not found')
    expect(error.details).toEqual({ id: '123' })
    expect(error.isOperational).toBe(true)
  })

  it('badRequest should create 400 error', () => {
    const error = badRequest('Invalid input')

    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('Invalid input')
  })

  it('unauthorized should create 401 error', () => {
    const error = unauthorized('Token expired')

    expect(error.statusCode).toBe(401)
    expect(error.message).toBe('Token expired')
  })

  it('forbidden should create 403 error', () => {
    const error = forbidden('Access denied')

    expect(error.statusCode).toBe(403)
    expect(error.message).toBe('Access denied')
  })

  it('conflict should create 409 error', () => {
    const error = conflict('Resource already exists')

    expect(error.statusCode).toBe(409)
    expect(error.message).toBe('Resource already exists')
  })

  it('internalError should create 500 error with isOperational=false', () => {
    const cause = new Error('DB connection failed')
    const error = internalError('Database error', cause)

    expect(error.statusCode).toBe(500)
    expect(error.message).toBe('Database error')
    expect(error.isOperational).toBe(false)
    expect(error.cause).toBe(cause)
  })
})
