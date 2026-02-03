/**
 * DynamoDB Audit Writer
 *
 * Writes audit logs to per-entity DynamoDB tables.
 * Table naming convention: {entityType}-audit-logs (e.g., invoice-audit-logs)
 */

import { PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { IAuditWriter } from './audit-writer.interface.js'
import type { AuditLog } from '../types.js'
import { getDynamoDB } from '../../../db/dynamodb.js'
import { error as logError, debug } from '../../logger.js'

export interface DynamoDBWriterOptions {
  /** Optional TTL in seconds for auto-expiring old audit logs */
  ttlSeconds?: number
}

/**
 * DynamoDBWriter - writes audit logs to per-entity DynamoDB tables
 *
 * Table schema expected per entity:
 * - id (String): Partition key
 * - timestamp (String): Sort key for time-based queries
 * - GSI on entityId + timestamp for entity-specific queries
 */
export class DynamoDBWriter implements IAuditWriter {
  readonly type = 'dynamodb'
  private readonly ttlSeconds?: number

  constructor(options?: DynamoDBWriterOptions) {
    this.ttlSeconds = options?.ttlSeconds
  }

  async write(auditLog: AuditLog, tableName: string): Promise<void> {
    try {
      const item = this.buildItem(auditLog)
      const client = getDynamoDB()

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      )

      debug('Audit log written to DynamoDB', {
        event: 'AuditDynamoDBWrite',
        metadata: {
          auditId: auditLog.id,
          tableName,
          entityId: auditLog.entityId,
          operation: auditLog.operation,
        },
      })
    } catch (err) {
      logError('Failed to write audit log to DynamoDB', {
        event: 'AuditDynamoDBError',
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
      const client = getDynamoDB()

      // DynamoDB BatchWriteItem supports max 25 items per request
      const batches = this.chunkArray(auditLogs, 25)

      for (const batch of batches) {
        const requests = batch.map((log) => ({
          PutRequest: {
            Item: this.buildItem(log),
          },
        }))

        await client.send(
          new BatchWriteCommand({
            RequestItems: {
              [tableName]: requests,
            },
          })
        )
      }

      debug('Batch audit logs written to DynamoDB', {
        event: 'AuditDynamoDBBatchWrite',
        metadata: { count: auditLogs.length, tableName },
      })
    } catch (err) {
      logError('Failed to write batch audit logs to DynamoDB', {
        event: 'AuditDynamoDBBatchError',
        metadata: {
          count: auditLogs.length,
          tableName,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  private buildItem(auditLog: AuditLog): Record<string, unknown> {
    const item: Record<string, unknown> = {
      id: auditLog.id,
      entityId: auditLog.entityId,
      operation: auditLog.operation,
      userId: auditLog.userId,
      timestamp: auditLog.timestamp,
      changes: auditLog.changes,
      snapshotBefore: auditLog.snapshotBefore,
      snapshotAfter: auditLog.snapshotAfter,
      metadata: auditLog.metadata,
    }

    // Add TTL if configured
    if (this.ttlSeconds) {
      const ttlDate = new Date()
      ttlDate.setSeconds(ttlDate.getSeconds() + this.ttlSeconds)
      item.ttl = Math.floor(ttlDate.getTime() / 1000)
    }

    return item
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
