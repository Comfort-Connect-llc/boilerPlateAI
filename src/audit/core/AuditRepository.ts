import { getPrisma } from '../../db/prisma.js'
import { logger } from '../../lib/logger/index.js'
import type { AuditChange } from './AuditLog.model.js'

export interface InsertAuditLogParams {
  id: string
  domain: string
  entityId: string
  operation: string
  performedBy: string
  performedAt: Date
  changes: AuditChange[]
  snapshotBefore: unknown | null
  snapshotBeforeS3Key: string | null
  snapshotAfter: unknown | null
  snapshotAfterS3Key: string | null
  metadata: Record<string, unknown> | null
}

/**
 * Writes audit log entries to domain-specific Postgres tables.
 * Uses raw SQL via Prisma since tables are dynamically named ({domain}_audit_log).
 */
export async function insertAuditLog(params: InsertAuditLogParams): Promise<void> {
  const prisma = getPrisma()
  const tableName = `${params.domain}_audit_log`

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${tableName}" (
      id, domain, entity_id, operation, performed_by, performed_at,
      changes, snapshot_before, snapshot_before_s3_key,
      snapshot_after, snapshot_after_s3_key, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11, $12::jsonb)`,
    params.id,
    params.domain,
    params.entityId,
    params.operation,
    params.performedBy,
    params.performedAt,
    JSON.stringify(params.changes),
    params.snapshotBefore ? JSON.stringify(params.snapshotBefore) : null,
    params.snapshotBeforeS3Key,
    params.snapshotAfter ? JSON.stringify(params.snapshotAfter) : null,
    params.snapshotAfterS3Key,
    params.metadata ? JSON.stringify(params.metadata) : null
  )

  logger.debug('Audit log inserted', {
    domain: params.domain,
    entityId: params.entityId,
    operation: params.operation,
  })
}

/**
 * Ensures the domain-specific audit table exists.
 * Call once per domain during application startup or migration.
 */
export async function ensureAuditTable(domain: string): Promise<void> {
  const prisma = getPrisma()
  const tableName = `${domain}_audit_log`

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id UUID PRIMARY KEY,
      domain VARCHAR NOT NULL,
      entity_id VARCHAR NOT NULL,
      operation VARCHAR NOT NULL,
      performed_by VARCHAR NOT NULL,
      performed_at TIMESTAMP NOT NULL,
      changes JSONB NOT NULL,
      snapshot_before JSONB,
      snapshot_before_s3_key VARCHAR,
      snapshot_after JSONB,
      snapshot_after_s3_key VARCHAR,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_${tableName}_entity" ON "${tableName}"(entity_id, performed_at DESC)`
  )

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_${tableName}_performed_by" ON "${tableName}"(performed_by, performed_at DESC)`
  )

  logger.info('Audit table ensured', { tableName })
}
