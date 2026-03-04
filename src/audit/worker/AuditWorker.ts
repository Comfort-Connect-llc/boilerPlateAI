import { v4 as uuid } from 'uuid'
import { getEnv } from '../../config/env.js'
import { detectChanges } from '../core/ChangeDetector.js'
import { handleSnapshot } from '../core/SnapshotHandler.js'
import { insertAuditLog } from '../core/AuditRepository.js'
import type { IQueue, QueueMessage } from '../queue/IQueue.js'
import type { AuditEvent } from '../core/AuditLog.model.js'
import { logger } from '../../lib/logger/index.js'

const POLL_WAIT_SECONDS = 20
const BATCH_SIZE = 10
const IDLE_SLEEP_MS = 5000

/**
 * Background worker that polls SQS for audit events and writes them to Postgres.
 * Always runs but only processes when AUDIT_MODE === 'async'.
 * Uses long-polling (20s) to minimize API calls.
 */
export class AuditWorker {
  private running = false
  private queue: IQueue

  constructor(queue: IQueue) {
    this.queue = queue
  }

  start(): void {
    if (this.running) return
    this.running = true
    logger.info('Audit worker started')
    void this.loop()
  }

  stop(): void {
    this.running = false
    logger.info('Audit worker stopping')
  }

  isRunning(): boolean {
    return this.running && getEnv().AUDIT_MODE === 'async'
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const env = getEnv()

        if (env.AUDIT_MODE !== 'async') {
          await this.sleep(IDLE_SLEEP_MS)
          continue
        }

        if (!env.AUDIT_QUEUE_URL) {
          logger.warn('Audit worker: AUDIT_QUEUE_URL not configured')
          await this.sleep(IDLE_SLEEP_MS)
          continue
        }

        const messages = await this.queue.receiveMessages(env.AUDIT_QUEUE_URL, {
          maxMessages: BATCH_SIZE,
          waitTimeSeconds: POLL_WAIT_SECONDS,
        })

        if (messages.length === 0) continue

        await Promise.allSettled(
          messages.map((msg) => this.processMessage(msg, env.AUDIT_QUEUE_URL!))
        )
      } catch (err) {
        logger.error('Audit worker loop error', {
          error: err instanceof Error ? err.message : String(err),
        })
        await this.sleep(IDLE_SLEEP_MS)
      }
    }
  }

  private async processMessage(message: QueueMessage, queueUrl: string): Promise<void> {
    try {
      const event = JSON.parse(message.body) as AuditEvent & {
        snapshotBeforeS3Key?: string | null
        snapshotAfterS3Key?: string | null
      }

      const auditId = uuid()

      const changes = detectChanges(
        event.snapshotBefore as Record<string, unknown> | null,
        event.snapshotAfter as Record<string, unknown> | null
      )

      let snapshotBefore = event.snapshotBefore
      let snapshotBeforeS3Key = event.snapshotBeforeS3Key ?? null
      let snapshotAfter = event.snapshotAfter
      let snapshotAfterS3Key = event.snapshotAfterS3Key ?? null

      // Only process snapshots that weren't already uploaded to S3 by the async service
      if (snapshotBefore && !snapshotBeforeS3Key) {
        const result = await handleSnapshot(
          snapshotBefore,
          { domain: event.domain, entityId: event.entityId, auditId, snapshotType: 'before' }
        )
        snapshotBefore = result.inline
        snapshotBeforeS3Key = result.s3Key
      }

      if (snapshotAfter && !snapshotAfterS3Key) {
        const result = await handleSnapshot(
          snapshotAfter,
          { domain: event.domain, entityId: event.entityId, auditId, snapshotType: 'after' }
        )
        snapshotAfter = result.inline
        snapshotAfterS3Key = result.s3Key
      }

      await insertAuditLog({
        id: auditId,
        domain: event.domain,
        entityId: event.entityId,
        operation: event.operation,
        performedBy: event.performedBy,
        performedAt: new Date(event.performedAt),
        changes,
        snapshotBefore,
        snapshotBeforeS3Key,
        snapshotAfter,
        snapshotAfterS3Key,
        metadata: (event.metadata as Record<string, unknown>) ?? null,
      })

      await this.queue.deleteMessage(queueUrl, message.receiptHandle)
    } catch (err) {
      logger.error('Audit worker: failed to process message', {
        messageId: message.messageId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
