import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import healthRoutes from '../../src/modules/health/health.routes.js'

// Mock the database health checks
vi.mock('../../src/db/prisma.js', () => ({
  healthCheckPrisma: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../src/db/dynamodb.js', () => ({
  healthCheckDynamoDB: vi.fn().mockResolvedValue(true),
  getTableName: vi.fn().mockReturnValue('test-accounts'),
}))

describe('Health Routes', () => {
  let app: express.Express

  beforeAll(() => {
    app = express()
    app.use('/health', healthRoutes)
  })

  describe('GET /health', () => {
    it('should return healthy status when all services are up', async () => {
      const { healthCheckPrisma } = await import('../../src/db/prisma.js')
      const { healthCheckDynamoDB } = await import('../../src/db/dynamodb.js')

      vi.mocked(healthCheckPrisma).mockResolvedValue(true)
      vi.mocked(healthCheckDynamoDB).mockResolvedValue(true)

      const response = await request(app).get('/health')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        status: 'healthy',
        services: {
          postgres: 'up',
          dynamodb: 'up',
        },
      })
      expect(response.body.timestamp).toBeDefined()
    })

    it('should return unhealthy status when postgres is down', async () => {
      const { healthCheckPrisma } = await import('../../src/db/prisma.js')
      const { healthCheckDynamoDB } = await import('../../src/db/dynamodb.js')

      vi.mocked(healthCheckPrisma).mockResolvedValue(false)
      vi.mocked(healthCheckDynamoDB).mockResolvedValue(true)

      const response = await request(app).get('/health')

      expect(response.status).toBe(503)
      expect(response.body).toMatchObject({
        status: 'unhealthy',
        services: {
          postgres: 'down',
          dynamodb: 'up',
        },
      })
    })

    it('should return unhealthy status when dynamodb is down', async () => {
      const { healthCheckPrisma } = await import('../../src/db/prisma.js')
      const { healthCheckDynamoDB } = await import('../../src/db/dynamodb.js')

      vi.mocked(healthCheckPrisma).mockResolvedValue(true)
      vi.mocked(healthCheckDynamoDB).mockResolvedValue(false)

      const response = await request(app).get('/health')

      expect(response.status).toBe(503)
      expect(response.body).toMatchObject({
        status: 'unhealthy',
        services: {
          postgres: 'up',
          dynamodb: 'down',
        },
      })
    })
  })

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app).get('/health/live')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'alive' })
    })
  })

  describe('GET /health/ready', () => {
    it('should return ready when postgres is up', async () => {
      const { healthCheckPrisma } = await import('../../src/db/prisma.js')
      vi.mocked(healthCheckPrisma).mockResolvedValue(true)

      const response = await request(app).get('/health/ready')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ready' })
    })

    it('should return not ready when postgres is down', async () => {
      const { healthCheckPrisma } = await import('../../src/db/prisma.js')
      vi.mocked(healthCheckPrisma).mockResolvedValue(false)

      const response = await request(app).get('/health/ready')

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ status: 'not ready' })
    })
  })
})
