import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  auditService,
  clearWriterCache,
} from '../../../src/lib/audit/audit-service.js'
import {
  resetAuditConfig,
  setAuditConfig,
  configureEntityAudit,
} from '../../../src/lib/audit/audit-config.js'
import { AuditOperation } from '../../../src/lib/audit/types.js'

// Mock the writers to avoid actual database/queue calls
vi.mock('../../../src/lib/audit/writers/dynamodb-writer.js', () => ({
  DynamoDBWriter: vi.fn().mockImplementation(() => ({
    type: 'dynamodb',
    write: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../../src/lib/audit/writers/postgres-writer.js', () => ({
  PostgresWriter: vi.fn().mockImplementation(() => ({
    type: 'postgres',
    write: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../../src/lib/audit/writers/sqs-writer.js', () => ({
  SQSWriter: vi.fn().mockImplementation(() => ({
    type: 'sqs',
    write: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock logger to capture error logs
const mockLogError = vi.fn()
const mockLogDebug = vi.fn()
const mockLogWarn = vi.fn()

vi.mock('../../../src/lib/logger.js', () => ({
  error: (...args: unknown[]) => mockLogError(...args),
  debug: (...args: unknown[]) => mockLogDebug(...args),
  warn: (...args: unknown[]) => mockLogWarn(...args),
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAuditConfig()
    clearWriterCache()

    // Set up default config with a test table
    setAuditConfig({
      globalEnabled: true,
      defaultWriter: 'noop', // Use noop to avoid real writer instantiation issues
      writers: {
        dynamodb: { tableName: 'test-audit-logs' },
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('auditCreate', () => {
    it('should record a CREATE audit log', async () => {
      const entity = {
        id: 'entity-123',
        name: 'Test Entity',
        email: 'test@example.com',
      }

      // Should not throw
      await expect(
        auditService.auditCreate({
          entityType: 'TestEntity',
          entityId: entity.id,
          entity,
          userId: 'user-123',
          metadata: { requestId: 'req-123', source: 'api' },
        })
      ).resolves.toBeUndefined()
    })

    it('should skip audit when entity type is disabled', async () => {
      configureEntityAudit('DisabledEntity', { enabled: false })

      await auditService.auditCreate({
        entityType: 'DisabledEntity',
        entityId: 'entity-123',
        entity: { id: 'entity-123', name: 'Test' },
        userId: 'user-123',
      })

      // Should log debug message about skipping
      expect(mockLogDebug).toHaveBeenCalledWith(
        'Audit disabled for entity type',
        expect.any(Object)
      )
    })

    it('should not throw on writer failure', async () => {
      // Configure to use dynamodb which will throw due to mock
      setAuditConfig({
        globalEnabled: true,
        defaultWriter: 'dynamodb',
        writers: {
          dynamodb: { tableName: 'test-audit-logs' },
        },
      })
      clearWriterCache()

      // Reset the DynamoDB mock to throw an error
      vi.doMock('../../../src/lib/audit/writers/dynamodb-writer.js', () => ({
        DynamoDBWriter: vi.fn().mockImplementation(() => ({
          type: 'dynamodb',
          write: vi.fn().mockRejectedValue(new Error('DB connection failed')),
          writeBatch: vi.fn().mockRejectedValue(new Error('DB connection failed')),
        })),
      }))

      // Should not throw even if writer fails
      await expect(
        auditService.auditCreate({
          entityType: 'TestEntity',
          entityId: 'entity-123',
          entity: { id: 'entity-123', name: 'Test' },
          userId: 'user-123',
        })
      ).resolves.toBeUndefined()
    })
  })

  describe('auditUpdate', () => {
    it('should record an UPDATE audit log with changes', async () => {
      const entityBefore = { id: 'entity-123', name: 'Old Name', email: 'old@example.com' }
      const entityAfter = { id: 'entity-123', name: 'New Name', email: 'old@example.com' }

      await expect(
        auditService.auditUpdate({
          entityType: 'TestEntity',
          entityId: 'entity-123',
          entityBefore,
          entityAfter,
          userId: 'user-123',
          metadata: { requestId: 'req-123' },
        })
      ).resolves.toBeUndefined()
    })

    it('should skip audit when no changes detected', async () => {
      const entity = { id: 'entity-123', name: 'Same Name' }

      await auditService.auditUpdate({
        entityType: 'TestEntity',
        entityId: 'entity-123',
        entityBefore: entity,
        entityAfter: { ...entity },
        userId: 'user-123',
      })

      // Should log debug message about no changes
      expect(mockLogDebug).toHaveBeenCalledWith(
        'No changes detected, skipping audit',
        expect.any(Object)
      )
    })

    it('should exclude system fields from change detection', async () => {
      const entityBefore = {
        id: 'entity-123',
        name: 'Same Name',
        version: 1,
        updatedAt: '2026-01-01',
      }
      const entityAfter = {
        id: 'entity-123',
        name: 'Same Name',
        version: 2,
        updatedAt: '2026-02-01',
      }

      await auditService.auditUpdate({
        entityType: 'TestEntity',
        entityId: 'entity-123',
        entityBefore,
        entityAfter,
        userId: 'user-123',
      })

      // Should skip because only system fields changed
      expect(mockLogDebug).toHaveBeenCalledWith(
        'No changes detected, skipping audit',
        expect.any(Object)
      )
    })
  })

  describe('auditDelete', () => {
    it('should record a DELETE audit log', async () => {
      const entity = {
        id: 'entity-123',
        name: 'Entity to Delete',
        email: 'delete@example.com',
      }

      await expect(
        auditService.auditDelete({
          entityType: 'TestEntity',
          entityId: entity.id,
          entity,
          userId: 'user-123',
          metadata: { requestId: 'req-123', source: 'api' },
        })
      ).resolves.toBeUndefined()
    })

    it('should skip audit when globally disabled', async () => {
      setAuditConfig({ globalEnabled: false })

      await auditService.auditDelete({
        entityType: 'TestEntity',
        entityId: 'entity-123',
        entity: { id: 'entity-123', name: 'Test' },
        userId: 'user-123',
      })

      expect(mockLogDebug).toHaveBeenCalledWith(
        'Audit disabled for entity type',
        expect.any(Object)
      )
    })
  })

  describe('error handling', () => {
    it('should never throw and always return void', async () => {
      // Even with invalid params, should not throw
      await expect(
        auditService.auditCreate({
          entityType: '',
          entityId: '',
          entity: {},
          userId: '',
        })
      ).resolves.toBeUndefined()

      await expect(
        auditService.auditUpdate({
          entityType: '',
          entityId: '',
          entityBefore: {},
          entityAfter: {},
          userId: '',
        })
      ).resolves.toBeUndefined()

      await expect(
        auditService.auditDelete({
          entityType: '',
          entityId: '',
          entity: {},
          userId: '',
        })
      ).resolves.toBeUndefined()
    })
  })
})
