import { logger, fatal } from './lib/logger/index.js'
import { bootstrap, getEnv } from './config/env.js'
import { createApp } from './app.js'
import { disconnectPrisma } from './db/prisma.js'
import { createAuditService, registerAuditService, AuditWorker, SQSQueue } from './audit/index.js'

async function main() {
  try {
    // Bootstrap configuration (loads from SSM in production)
    logger.info('Bootstrapping configuration...')
    await bootstrap()

    const env = getEnv()

    // Initialize audit service
    const auditService = createAuditService()
    registerAuditService(auditService)

    // Start audit worker (it checks mode internally, only processes in async mode)
    const auditWorker = new AuditWorker(new SQSQueue())
    if (env.AUDIT_ENABLED) {
      auditWorker.start()
    }

    // Create Express app
    const app = createApp()

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info('Server started', { port: env.PORT, env: env.NODE_ENV })
    })

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info('Shutdown signal received', { signal })

      // Stop audit worker
      auditWorker.stop()

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed')

        // Close database connections
        await disconnectPrisma()

        logger.info('Graceful shutdown completed')
        process.exit(0)
      })

      // Force exit after timeout
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 30000)
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
    process.on('SIGINT', () => void shutdown('SIGINT'))

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      fatal('Uncaught exception', { metadata: { err: error } })
      void shutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason: unknown) => {
      fatal('Unhandled rejection', { metadata: { reason } })
      void shutdown('unhandledRejection')
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    fatal('Failed to start server', { metadata: { message: err.message, stack: err.stack } })
    process.exit(1)
  }
}

main()
