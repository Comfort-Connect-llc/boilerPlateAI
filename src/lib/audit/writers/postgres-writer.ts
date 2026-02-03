/**
 * PostgreSQL Audit Writer
 *
 * Writes audit logs to per-entity PostgreSQL tables using raw SQL.
 * Table naming convention: {entity_type}_audit_logs (e.g., invoice_audit_logs)
 */

import type { IAuditWriter } from './audit-writer.interface.js'
import type { AuditLog } from '../types.js'
import { getPrisma } from '../../../db/prisma.js'
import { error as logError, debug } from '../../logger.js'

export interface PostgresWriterOptions {
  /** Schema name for audit tables (defaults to "public") */
  schema?: string
}

/**
 * PostgresWriter - writes audit logs to per-entity PostgreSQL tables
 *
 * Each entity type has its own audit table following the naming convention:
 * {entity_type}_audit_logs (e.g., invoice_audit_logs, user_audit_logs)
 *
 * Table schema expected per entity:
 * ```sql
 * CREATE TABLE invoice_audit_logs (
 *   id UUID PRIMARY KEY,
 *   entity_id VARCHAR(100) NOT NULL,
 *   operation VARCHAR(20) NOT NULL,
 *   user_id VARCHAR(100) NOT NULL,
 *   timestamp TIMESTAMPTZ NOT NULL,
 *   changes JSONB NOT NULL,
 *   snapshot_before JSONB,
 *   snapshot_after JSONB,
 *   metadata JSONB,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * CREATE INDEX idx_invoice_audit_entity ON invoice_audit_logs(entity_id, timestamp DESC);
 * CREATE INDEX idx_invoice_audit_user ON invoice_audit_logs(user_id, timestamp DESC);
 * ```
 */
export class PostgresWriter implements IAuditWriter {
  readonly type = 'postgres'
  private readonly schema: string

  constructor(options?: PostgresWriterOptions) {
    this.schema = options?.schema ?? 'public'
  }

  async write(auditLog: AuditLog, tableName: string): Promise<void> {
    try {
      const prisma = getPrisma()
      const fullTableName = `"${this.schema}"."${tableName}"`

      await prisma.$executeRawUnsafe(
        `INSERT INTO ${fullTableName} (id, entity_id, operation, user_id, timestamp, changes, snapshot_before, snapshot_after, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        auditLog.id,
        auditLog.entityId,
        auditLog.operation,
        auditLog.userId,
        new Date(auditLog.timestamp),
        JSON.stringify(auditLog.changes),
        auditLog.snapshotBefore ? JSON.stringify(auditLog.snapshotBefore) : null,
        auditLog.snapshotAfter ? JSON.stringify(auditLog.snapshotAfter) : null,
        auditLog.metadata ? JSON.stringify(auditLog.metadata) : null
      )

      debug('Audit log written to PostgreSQL', {
        event: 'AuditPostgresWrite',
        metadata: {
          auditId: auditLog.id,
          tableName,
          entityId: auditLog.entityId,
          operation: auditLog.operation,
        },
      })
    } catch (err) {
      logError('Failed to write audit log to PostgreSQL', {
        event: 'AuditPostgresError',
        metadata: {
          auditId: auditLog.id,
          tableName,
          entityId: auditLog.entityId,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  async writeBatch(auditLogs: AuditLog[], tableName: string): Promise<void> {
    if (auditLogs.length === 0) return

    try {
      const prisma = getPrisma()
      const fullTableName = `"${this.schema}"."${tableName}"`

      // Build batch insert with multiple value sets
      const values: unknown[] = []
      const placeholders: string[] = []

      auditLogs.forEach((log, index) => {
        const offset = index * 9
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, NOW())`
        )
        values.push(
          log.id,
          log.entityId,
          log.operation,
          log.userId,
          new Date(log.timestamp),
          JSON.stringify(log.changes),
          log.snapshotBefore ? JSON.stringify(log.snapshotBefore) : null,
          log.snapshotAfter ? JSON.stringify(log.snapshotAfter) : null,
          log.metadata ? JSON.stringify(log.metadata) : null
        )
      })

      await prisma.$executeRawUnsafe(
        `INSERT INTO ${fullTableName} (id, entity_id, operation, user_id, timestamp, changes, snapshot_before, snapshot_after, metadata, created_at)
         VALUES ${placeholders.join(', ')}`,
        ...values
      )

      debug('Batch audit logs written to PostgreSQL', {
        event: 'AuditPostgresBatchWrite',
        metadata: { count: auditLogs.length, tableName },
      })
    } catch (err) {
      logError('Failed to write batch audit logs to PostgreSQL', {
        event: 'AuditPostgresBatchError',
        metadata: {
          count: auditLogs.length,
          tableName,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }
}
