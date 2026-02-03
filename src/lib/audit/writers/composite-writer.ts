/**
 * Composite Audit Writer
 *
 * Writes audit logs to multiple writers simultaneously.
 * Useful when you need to persist to multiple backends
 * (e.g., DynamoDB for fast lookups + SQS for async processing).
 */

import type { IAuditWriter } from './audit-writer.interface.js'
import type { AuditLog } from '../types.js'
import { error as logError, debug } from '../../logger.js'

export interface CompositeWriterOptions {
  /** Writers to delegate to */
  writers: IAuditWriter[]
  /** Whether to continue if one writer fails (default: true) */
  continueOnError?: boolean
}

/**
 * CompositeWriter - delegates to multiple writers
 *
 * All write operations are executed in parallel.
 * If any writer fails, the error is logged but other writers continue.
 */
export class CompositeWriter implements IAuditWriter {
  readonly type = 'composite'
  private readonly writers: IAuditWriter[]

  constructor(options: CompositeWriterOptions) {
    this.writers = options.writers
    // continueOnError option is reserved for future use
  }

  async write(auditLog: AuditLog, tableName: string): Promise<void> {
    const results = await Promise.allSettled(
      this.writers.map((writer) => writer.write(auditLog, tableName))
    )

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )

    if (failures.length > 0) {
      logError('Some composite writers failed', {
        event: 'AuditCompositePartialFailure',
        metadata: {
          auditId: auditLog.id,
          tableName,
          totalWriters: this.writers.length,
          failedWriters: failures.length,
          errors: failures.map((f) => f.reason?.message || 'Unknown'),
        },
      })
    }

    debug('Composite write completed', {
      event: 'AuditCompositeWrite',
      metadata: {
        auditId: auditLog.id,
        tableName,
        totalWriters: this.writers.length,
        successfulWriters: this.writers.length - failures.length,
      },
    })
  }

  async writeBatch(auditLogs: AuditLog[], tableName: string): Promise<void> {
    if (auditLogs.length === 0) return

    const results = await Promise.allSettled(
      this.writers.map((writer) => writer.writeBatch(auditLogs, tableName))
    )

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )

    if (failures.length > 0) {
      logError('Some composite writers failed for batch', {
        event: 'AuditCompositeBatchPartialFailure',
        metadata: {
          count: auditLogs.length,
          tableName,
          totalWriters: this.writers.length,
          failedWriters: failures.length,
          errors: failures.map((f) => f.reason?.message || 'Unknown'),
        },
      })
    }

    debug('Composite batch write completed', {
      event: 'AuditCompositeBatchWrite',
      metadata: {
        count: auditLogs.length,
        tableName,
        totalWriters: this.writers.length,
        successfulWriters: this.writers.length - failures.length,
      },
    })
  }

  /**
   * Get list of underlying writers
   */
  getWriters(): IAuditWriter[] {
    return [...this.writers]
  }
}
