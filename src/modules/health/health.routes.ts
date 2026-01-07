import { Router, type Request, type Response } from 'express'
import httpStatus from 'http-status'
import { healthCheckPrisma } from '../../db/prisma.js'
import { healthCheckDynamoDB, getTableName } from '../../db/dynamodb.js'
import { getEnv } from '../../config/env.js'

const router = Router()

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  memory: {
    used: number
    total: number
    percentage: number
  }
  services: {
    postgres: { status: 'up' | 'down'; responseTime?: number }
    dynamodb: { status: 'up' | 'down'; responseTime?: number }
  }
}

router.get('/', async (_req: Request, res: Response) => {
  // Measure response times
  const postgresStart = Date.now()
  const postgresOk = await healthCheckPrisma()
  const postgresTime = Date.now() - postgresStart

  const dynamoStart = Date.now()
  const dynamoOk = await healthCheckDynamoDB(getTableName('example'))
  const dynamoTime = Date.now() - dynamoStart

  // Memory metrics
  const memUsage = process.memoryUsage()
  const memUsed = memUsage.heapUsed
  const memTotal = memUsage.heapTotal
  const memPercentage = Math.round((memUsed / memTotal) * 100)

  const allUp = postgresOk && dynamoOk
  const someUp = postgresOk || dynamoOk

  const status: HealthStatus = {
    status: allUp ? 'healthy' : someUp ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: memUsed,
      total: memTotal,
      percentage: memPercentage,
    },
    services: {
      postgres: {
        status: postgresOk ? 'up' : 'down',
        responseTime: postgresTime,
      },
      dynamodb: {
        status: dynamoOk ? 'up' : 'down',
        responseTime: dynamoTime,
      },
    },
  }

  const statusCode =
    status.status === 'healthy'
      ? httpStatus.OK
      : status.status === 'degraded'
        ? httpStatus.OK
        : httpStatus.SERVICE_UNAVAILABLE

  res.status(statusCode).json(status)
})

// Simple liveness probe (doesn't check dependencies)
router.get('/live', (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({ status: 'alive' })
})

// Readiness probe (checks if ready to accept traffic)
router.get('/ready', async (_req: Request, res: Response) => {
  const postgresOk = await healthCheckPrisma()

  if (postgresOk) {
    res.status(httpStatus.OK).json({ status: 'ready' })
  } else {
    res.status(httpStatus.SERVICE_UNAVAILABLE).json({ status: 'not ready' })
  }
})

export default router
