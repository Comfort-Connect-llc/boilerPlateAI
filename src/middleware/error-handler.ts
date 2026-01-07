import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import httpStatus from 'http-status'
import { ApiError, isApiError } from '../lib/errors.js'
import { getLogger, getRequestId } from '../lib/request-context.js'
import { logger as rootLogger } from '../lib/logger.js'
import { isProduction } from '../config/env.js'

interface ErrorResponse {
  statusCode: number
  message: string
  requestId: string
  details?: unknown
  stack?: string
}

function convertToApiError(err: Error): ApiError {
  // Already an ApiError
  if (isApiError(err)) {
    return err
  }

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    return new ApiError({
      statusCode: httpStatus.UNAUTHORIZED,
      message: 'Invalid or expired token',
      isOperational: true,
      cause: err,
    })
  }

  if (err.name === 'ValidationError') {
    return new ApiError({
      statusCode: httpStatus.BAD_REQUEST,
      message: err.message,
      isOperational: true,
      cause: err,
    })
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    return new ApiError({
      statusCode: httpStatus.BAD_REQUEST,
      message: 'Database constraint violation',
      isOperational: true,
      cause: err,
    })
  }

  // Default: internal server error
  return new ApiError({
    statusCode: httpStatus.INTERNAL_SERVER_ERROR,
    message: isProduction() ? 'Internal server error' : err.message,
    isOperational: false,
    cause: err,
  })
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const apiError = convertToApiError(err)
  const logger = getLogger() ?? rootLogger
  const requestId = getRequestId()

  // Log the error
  if (apiError.isOperational) {
    logger.warn(
      {
        err: apiError,
        statusCode: apiError.statusCode,
        requestId,
      },
      apiError.message
    )
  } else {
    logger.error(
      {
        err,
        statusCode: apiError.statusCode,
        requestId,
        stack: err.stack,
      },
      'Unhandled error'
    )
  }

  // Build response
  const response: ErrorResponse = {
    statusCode: apiError.statusCode,
    message: apiError.message,
    requestId,
  }

  // Include details if present
  if (apiError.details) {
    response.details = apiError.details
  }

  // Include stack trace in non-production
  if (!isProduction() && err.stack) {
    response.stack = err.stack
  }

  res.status(apiError.statusCode).json(response)
}

// 404 handler for unmatched routes
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new ApiError({
      statusCode: httpStatus.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      isOperational: true,
    })
  )
}
