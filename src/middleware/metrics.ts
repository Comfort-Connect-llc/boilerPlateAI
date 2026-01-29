import type { Request, Response, NextFunction } from 'express'
import { getLogger, getRequestId } from '../lib/request-context.js'
import { logger as rootLogger } from '../lib/logger.js'

/**
 * Metrics middleware - tracks request timing and logs completion.
 *
 * Logs include:
 * - Request method and path
 * - Status code
 * - Duration in milliseconds
 * - Request ID for tracing
 *
 * This provides observability for:
 * - Performance monitoring
 * - Error tracking
 * - Request patterns
 * - Debugging slow requests
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start
    const logger = getLogger() || rootLogger

    logger.info(
      'Request completed',
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        requestId: getRequestId(),
      },
    )
  })

  next()
}
