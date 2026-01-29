import { logger, fatal } from './lib/logger.js'
import { bootstrap } from './config/env.js'
import { createApp } from './app.js'
import { getEnv } from './config/env.js'
import { disconnectPrisma } from './db/prisma.js'

async function main() {
  try {
    // Bootstrap configuration (loads from SSM in production)
    logger.info('Bootstrapping configuration...')
    await bootstrap()

    const env = getEnv()

    // Create Express app
    const app = createApp()

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info('Server started', { port: env.PORT, env: env.NODE_ENV })
    })

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info('Shutdown signal received', { signal })

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
    fatal('Failed to start server', { metadata: { err: error } })
    process.exit(1)
  }
}

main()
