import { v4 as uuid } from 'uuid'
import type { IAuditService, AuditParams } from './IAuditService.js'
import { detectChanges } from './ChangeDetector.js'
import { handleSnapshot } from './SnapshotHandler.js'
import { insertAuditLog } from './AuditRepository.js'
import { logger } from '../../lib/logger/index.js'

/**
 * Synchronous audit service.
 * After a DynamoDB update succeeds, immediately writes the audit log to Postgres.
 * Best-effort: if audit fails, logs error but doesn't fail the operation.
 */
export class SyncAuditService implements IAuditService {
  async audit(params: AuditParams): Promise<void> {
    try {
      const auditId = uuid()
      const performedAt = new Date()

      const changes = detectChanges(
        params.snapshotBefore as Record<string, unknown> | null,
        params.snapshotAfter as Record<string, unknown> | null
      )

      const [beforeResult, afterResult] = await Promise.all([
        handleSnapshot(
          params.snapshotBefore,
          { domain: params.domain, entityId: params.entityId, auditId, snapshotType: 'before' }
        ),
        handleSnapshot(
          params.snapshotAfter,
          { domain: params.domain, entityId: params.entityId, auditId, snapshotType: 'after' }
        ),
      ])

      await insertAuditLog({
        id: auditId,
        domain: params.domain,
        entityId: params.entityId,
        operation: params.operation,
        performedBy: params.performedBy,
        performedAt,
        changes,
        snapshotBefore: beforeResult.inline,
        snapshotBeforeS3Key: beforeResult.s3Key,
        snapshotAfter: afterResult.inline,
        snapshotAfterS3Key: afterResult.s3Key,
        metadata: params.metadata ?? null,
      })
    } catch (err) {
      logger.error('Sync audit failed', {
        domain: params.domain,
        entityId: params.entityId,
        operation: params.operation,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
