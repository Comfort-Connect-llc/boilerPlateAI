import { PrismaClient } from '@prisma/client'
import { logger } from '../lib/logger.js'

// Singleton pattern for Prisma client
let prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    })

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        logger.debug('Prisma query', { query: e.query, duration: e.duration })
      })
    }

    prisma.$on('error', (e) => {
      logger.error('Prisma error', { error: e })
    })
  }

  return prisma
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
    logger.info('Prisma disconnected')
  }
}

export async function healthCheckPrisma(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
