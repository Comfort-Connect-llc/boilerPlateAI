import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import pinoHttp from 'pino-http'

import { logger } from './lib/logger.js'
import { requestContextMiddleware } from './lib/request-context.js'
import { createAuthMiddleware, populateUserContext } from './middleware/auth.js'
import { metricsMiddleware } from './middleware/metrics.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

// Routes
import healthRoutes from './modules/health/health.routes.js'
// Import your domain routes here
// Example: import exampleRoutes from './modules/_example/example.routes.js'

export function createApp(): Express {
  const app = express()

  // Security middleware
  app.use(helmet())
  app.use(cors())

  // Request parsing with size limits
  app.use(express.json({ limit: '10kb' }))
  app.use(express.urlencoded({ extended: true, limit: '10kb' }))

  // Compression
  app.use(compression())

  // Request logging
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url?.includes('/health') ?? false,
      },
    })
  )

  // Request context (AsyncLocalStorage) - must be early in the chain
  app.use(requestContextMiddleware)

  // Request metrics
  app.use(metricsMiddleware)

  // Health check routes (no auth required)
  app.use('/health', healthRoutes)

  // Auth middleware for protected routes
  const authMiddleware = createAuthMiddleware()
  app.use('/api', authMiddleware, populateUserContext)

  // API routes - Register your domain routes here
  // Example: app.use('/api/v1/example', exampleRoutes)
  // NOTE: Remove the _example module when creating your first real module

  // 404 handler
  app.use(notFoundHandler)

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
