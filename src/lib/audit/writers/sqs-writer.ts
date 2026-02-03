/**
 * SQS Audit Writer
 *
 * Sends audit logs to an SQS queue for async processing.
 * Useful for high-throughput scenarios or when audit processing
 * should be decoupled from the main application.
 *
 * NOTE: Requires @aws-sdk/client-sqs to be installed:
 *   npm install @aws-sdk/client-sqs
 */

import type { IAuditWriter } from './audit-writer.interface.js'
import type { AuditLog } from '../types.js'
import { error as logError, debug, warn } from '../../logger.js'

export interface SQSWriterOptions {
  queueUrl: string
  /** Optional message group ID for FIFO queues */
  messageGroupId?: string
}

// Dynamic import for SQS client (allows graceful handling when not installed)
let SQSClient: any = null
let SendMessageCommand: any = null
let SendMessageBatchCommand: any = null
let sqsClient: any = null
let sqsAvailable = false

async function loadSQSClient(): Promise<boolean> {
  if (SQSClient !== null) {
    return sqsAvailable
  }

  try {
    // Use string variable to prevent TypeScript from resolving the module at compile time
    const sqsModuleName = '@aws-sdk/client-sqs'
    const sqsModule = await import(/* @vite-ignore */ sqsModuleName)
    SQSClient = sqsModule.SQSClient
    SendMessageCommand = sqsModule.SendMessageCommand
    SendMessageBatchCommand = sqsModule.SendMessageBatchCommand
    sqsAvailable = true

    // Import AWS config
    const { getAWSClientConfig } = await import('../../../config/aws.js')
    sqsClient = new SQSClient(getAWSClientConfig())

    return true
  } catch {
    warn('SQS client not available - @aws-sdk/client-sqs not installed', {
      event: 'AuditSQSUnavailable',
    })
    sqsAvailable = false
    return false
  }
}

/**
 * SQS message payload structure
 * Includes tableName so the consumer knows where to persist the audit log
 */
interface SQSAuditMessage {
  auditLog: AuditLog
  tableName: string
}

/**
 * SQSWriter - sends audit logs to SQS for async processing
 *
 * Benefits:
 * - Decouples audit processing from main application
 * - Supports high-throughput scenarios
 * - Enables retry and dead-letter queue patterns
 * - Consumer can write to multiple storage backends
 *
 * Requires: npm install @aws-sdk/client-sqs
 */
export class SQSWriter implements IAuditWriter {
  readonly type = 'sqs'
  private readonly queueUrl: string
  private readonly messageGroupId?: string

  constructor(options: SQSWriterOptions) {
    this.queueUrl = options.queueUrl
    this.messageGroupId = options.messageGroupId
  }

  async write(auditLog: AuditLog, tableName: string): Promise<void> {
    try {
      const available = await loadSQSClient()
      if (!available) {
        logError('SQS writer not available - package not installed', {
          event: 'AuditSQSError',
          metadata: { auditId: auditLog.id },
        })
        return
      }

      const message: SQSAuditMessage = { auditLog, tableName }

      const params: Record<string, unknown> = {
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          tableName: {
            DataType: 'String',
            StringValue: tableName,
          },
          operation: {
            DataType: 'String',
            StringValue: auditLog.operation,
          },
        },
      }

      // For FIFO queues
      if (this.messageGroupId) {
        params.MessageGroupId = this.messageGroupId
        params.MessageDeduplicationId = auditLog.id
      }

      await sqsClient.send(new SendMessageCommand(params))

      debug('Audit log sent to SQS', {
        event: 'AuditSQSSend',
        metadata: {
          auditId: auditLog.id,
          tableName,
          entityId: auditLog.entityId,
          operation: auditLog.operation,
        },
      })
    } catch (err) {
      logError('Failed to send audit log to SQS', {
        event: 'AuditSQSError',
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
      const available = await loadSQSClient()
      if (!available) {
        logError('SQS writer not available - package not installed', {
          event: 'AuditSQSBatchError',
          metadata: { count: auditLogs.length },
        })
        return
      }

      // SQS SendMessageBatch supports max 10 messages per request
      const batches = this.chunkArray(auditLogs, 10)

      for (const batch of batches) {
        const entries = batch.map((log, index) => {
          const message: SQSAuditMessage = { auditLog: log, tableName }

          const entry: Record<string, unknown> = {
            Id: `${index}`,
            MessageBody: JSON.stringify(message),
            MessageAttributes: {
              tableName: {
                DataType: 'String',
                StringValue: tableName,
              },
              operation: {
                DataType: 'String',
                StringValue: log.operation,
              },
            },
          }

          // For FIFO queues
          if (this.messageGroupId) {
            entry.MessageGroupId = this.messageGroupId
            entry.MessageDeduplicationId = log.id
          }

          return entry
        })

        await sqsClient.send(
          new SendMessageBatchCommand({
            QueueUrl: this.queueUrl,
            Entries: entries,
          })
        )
      }

      debug('Batch audit logs sent to SQS', {
        event: 'AuditSQSBatchSend',
        metadata: { count: auditLogs.length, tableName },
      })
    } catch (err) {
      logError('Failed to send batch audit logs to SQS', {
        event: 'AuditSQSBatchError',
        metadata: {
          count: auditLogs.length,
          tableName,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
