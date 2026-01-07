import httpStatus from 'http-status'

export interface ApiErrorOptions {
  statusCode: number
  message?: string
  isOperational?: boolean
  details?: unknown
  cause?: Error
}

export class ApiError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly details?: unknown

  constructor(options: ApiErrorOptions) {
    const message = options.message || (httpStatus[options.statusCode] as string) || 'Unknown Error'
    super(message, { cause: options.cause })

    this.statusCode = options.statusCode
    this.isOperational = options.isOperational ?? true
    this.details = options.details

    Error.captureStackTrace(this, this.constructor)
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      message: this.message,
      ...(this.details && { details: this.details }),
    }
  }
}

// Convenience factory functions
export const notFound = (message?: string, details?: unknown) =>
  new ApiError({ statusCode: httpStatus.NOT_FOUND, message, details })

export const badRequest = (message?: string, details?: unknown) =>
  new ApiError({ statusCode: httpStatus.BAD_REQUEST, message, details })

export const unauthorized = (message?: string, details?: unknown) =>
  new ApiError({ statusCode: httpStatus.UNAUTHORIZED, message, details })

export const forbidden = (message?: string, details?: unknown) =>
  new ApiError({ statusCode: httpStatus.FORBIDDEN, message, details })

export const conflict = (message?: string, details?: unknown) =>
  new ApiError({ statusCode: httpStatus.CONFLICT, message, details })

export const internalError = (message?: string, cause?: Error) =>
  new ApiError({
    statusCode: httpStatus.INTERNAL_SERVER_ERROR,
    message,
    isOperational: false,
    cause,
  })

// Type guard
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
