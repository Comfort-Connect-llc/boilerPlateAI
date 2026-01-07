import { logger } from './lib/logger.js'
import { bootstrap } from './config/env.js'
import { createApp } from './app.js'
import { getEnv } from './config/env.js'
import { disconnectPrisma } from './db/prisma.js'

async function main() {
  try {
    // Bootstrap configuration (loads from SSM in production)
    logger.info('Bootstrapping configuration...')
    await bootstrap()
    logger.info('Configuration bootstrapped successfully')

    const env = getEnv()

    // Create Express app
    const app = createApp()

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started')
    })

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received')

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
      logger.fatal({ err: error }, 'Uncaught exception')
      void shutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason: unknown) => {
      logger.fatal({ reason }, 'Unhandled rejection')
      void shutdown('unhandledRejection')
    })
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

main()
