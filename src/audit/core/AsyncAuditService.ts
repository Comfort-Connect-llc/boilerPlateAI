import type { IAuditService, AuditParams } from './IAuditService.js'
import type { AuditEvent } from './AuditLog.model.js'
import { handleSnapshot } from './SnapshotHandler.js'
import { getEnv } from '../../config/env.js'
import type { IQueue } from '../queue/IQueue.js'
import { logger } from '../../lib/logger/index.js'
import { v4 as uuid } from 'uuid'

// Threshold for pre-uploading snapshots before queuing (to avoid SQS message size limits)
const SQS_SAFE_THRESHOLD = 200 * 1024 // 200KB

/**
 * Asynchronous audit service.
 * Publishes audit events to SQS for background processing.
 * For large snapshots, uploads to S3 before queuing to avoid SQS limits.
 * Fire-and-forget: minimal latency impact (~5ms).
 */
export class AsyncAuditService implements IAuditService {
  private queue: IQueue

  constructor(queue: IQueue) {
    this.queue = queue
  }

  async audit(params: AuditParams): Promise<void> {
    try {
      const env = getEnv()

      if (!env.AUDIT_QUEUE_URL) {
        logger.error('AUDIT_QUEUE_URL not configured for async audit mode', {
          domain: params.domain,
          entityId: params.entityId,
        })
        return
      }

      // Check combined snapshot size — if too large, pre-upload to S3
      const beforeJson = params.snapshotBefore ? JSON.stringify(params.snapshotBefore) : ''
      const afterJson = params.snapshotAfter ? JSON.stringify(params.snapshotAfter) : ''
      const totalSize = Buffer.byteLength(beforeJson, 'utf8') + Buffer.byteLength(afterJson, 'utf8')

      let snapshotBefore = params.snapshotBefore
      let snapshotAfter = params.snapshotAfter
      let snapshotBeforeS3Key: string | null = null
      let snapshotAfterS3Key: string | null = null

      if (totalSize > SQS_SAFE_THRESHOLD && env.AUDIT_SNAPSHOT_S3_BUCKET) {
        const auditId = uuid()

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

        snapshotBefore = beforeResult.inline
        snapshotAfter = afterResult.inline
        snapshotBeforeS3Key = beforeResult.s3Key
        snapshotAfterS3Key = afterResult.s3Key
      }

      const event: AuditEvent & {
        snapshotBeforeS3Key?: string | null
        snapshotAfterS3Key?: string | null
      } = {
        domain: params.domain,
        entityId: params.entityId,
        operation: params.operation,
        performedBy: params.performedBy,
        performedAt: new Date().toISOString(),
        snapshotBefore,
        snapshotAfter,
        metadata: params.metadata,
      }

      if (snapshotBeforeS3Key) event.snapshotBeforeS3Key = snapshotBeforeS3Key
      if (snapshotAfterS3Key) event.snapshotAfterS3Key = snapshotAfterS3Key

      await this.queue.publish(env.AUDIT_QUEUE_URL, event)
    } catch (err) {
      logger.error('Async audit publish failed', {
        domain: params.domain,
        entityId: params.entityId,
        operation: params.operation,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
