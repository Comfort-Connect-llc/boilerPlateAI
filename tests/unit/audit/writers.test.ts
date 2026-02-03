import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoOpWriter } from '../../../src/lib/audit/writers/noop-writer.js'
import { CompositeWriter } from '../../../src/lib/audit/writers/composite-writer.js'
import type { AuditLog } from '../../../src/lib/audit/types.js'
import { AuditOperation } from '../../../src/lib/audit/types.js'

// Mock logger
vi.mock('../../../src/lib/logger.js', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

function createMockAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'audit-123',
    entityId: 'entity-456',
    operation: AuditOperation.UPDATE,
    userId: 'user-789',
    timestamp: new Date().toISOString(),
    changes: [
      { path: 'name', oldValue: 'Old', newValue: 'New', valueType: 'string' },
    ],
    snapshotBefore: { name: 'Old' },
    snapshotAfter: { name: 'New' },
    metadata: { requestId: 'req-123' },
    ...overrides,
  }
}

describe('Audit Writers', () => {
  describe('NoOpWriter', () => {
    it('should have type "noop"', () => {
      const writer = new NoOpWriter()
      expect(writer.type).toBe('noop')
    })

    it('should accept write calls without error', async () => {
      const writer = new NoOpWriter()
      const auditLog = createMockAuditLog()

      await expect(writer.write(auditLog, 'test-audit-logs')).resolves.toBeUndefined()
    })

    it('should accept writeBatch calls without error', async () => {
      const writer = new NoOpWriter()
      const auditLogs = [createMockAuditLog(), createMockAuditLog()]

      await expect(writer.writeBatch(auditLogs, 'test-audit-logs')).resolves.toBeUndefined()
    })
  })

  describe('CompositeWriter', () => {
    it('should have type "composite"', () => {
      const writer = new CompositeWriter({ writers: [] })
      expect(writer.type).toBe('composite')
    })

    it('should delegate to all child writers with tableName', async () => {
      const mockWriter1 = {
        type: 'mock1',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }
      const mockWriter2 = {
        type: 'mock2',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }

      const composite = new CompositeWriter({
        writers: [mockWriter1, mockWriter2],
      })
      const auditLog = createMockAuditLog()
      const tableName = 'invoice-audit-logs'

      await composite.write(auditLog, tableName)

      expect(mockWriter1.write).toHaveBeenCalledWith(auditLog, tableName)
      expect(mockWriter2.write).toHaveBeenCalledWith(auditLog, tableName)
    })

    it('should delegate batch writes to all child writers with tableName', async () => {
      const mockWriter1 = {
        type: 'mock1',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }
      const mockWriter2 = {
        type: 'mock2',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }

      const composite = new CompositeWriter({
        writers: [mockWriter1, mockWriter2],
      })
      const auditLogs = [createMockAuditLog(), createMockAuditLog()]
      const tableName = 'invoice-audit-logs'

      await composite.writeBatch(auditLogs, tableName)

      expect(mockWriter1.writeBatch).toHaveBeenCalledWith(auditLogs, tableName)
      expect(mockWriter2.writeBatch).toHaveBeenCalledWith(auditLogs, tableName)
    })

    it('should continue if one writer fails', async () => {
      const mockWriter1 = {
        type: 'mock1',
        write: vi.fn().mockRejectedValue(new Error('Writer 1 failed')),
        writeBatch: vi.fn().mockRejectedValue(new Error('Writer 1 failed')),
      }
      const mockWriter2 = {
        type: 'mock2',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }

      const composite = new CompositeWriter({
        writers: [mockWriter1, mockWriter2],
        continueOnError: true,
      })
      const auditLog = createMockAuditLog()

      // Should not throw
      await expect(composite.write(auditLog, 'test-audit-logs')).resolves.toBeUndefined()

      // Both writers should be called
      expect(mockWriter1.write).toHaveBeenCalled()
      expect(mockWriter2.write).toHaveBeenCalled()
    })

    it('should return list of writers via getWriters', () => {
      const mockWriter1 = {
        type: 'mock1',
        write: vi.fn(),
        writeBatch: vi.fn(),
      }
      const mockWriter2 = {
        type: 'mock2',
        write: vi.fn(),
        writeBatch: vi.fn(),
      }

      const composite = new CompositeWriter({
        writers: [mockWriter1, mockWriter2],
      })

      const writers = composite.getWriters()
      expect(writers).toHaveLength(2)
    })

    it('should handle empty batch', async () => {
      const mockWriter = {
        type: 'mock',
        write: vi.fn().mockResolvedValue(undefined),
        writeBatch: vi.fn().mockResolvedValue(undefined),
      }

      const composite = new CompositeWriter({ writers: [mockWriter] })

      await composite.writeBatch([], 'test-audit-logs')

      // Should not call child writer for empty batch
      expect(mockWriter.writeBatch).not.toHaveBeenCalled()
    })
  })
})
