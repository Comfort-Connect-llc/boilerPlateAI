/**
 * No-Op Audit Writer
 *
 * A writer that does nothing - useful for testing and when audit is disabled.
 */

import type { IAuditWriter } from './audit-writer.interface.js'
import type { AuditLog } from '../types.js'
import { debug } from '../../logger.js'

/**
 * NoOpWriter - does nothing
 * Useful for:
 * - Testing without real persistence
 * - Disabled audit scenarios
 * - Development environments where audit isn't needed
 */
export class NoOpWriter implements IAuditWriter {
  readonly type = 'noop'

  async write(auditLog: AuditLog, tableName: string): Promise<void> {
    debug('NoOpWriter: Skipped audit log', {
      event: 'AuditNoOp',
      metadata: {
        tableName,
        entityId: auditLog.entityId,
        operation: auditLog.operation,
      },
    })
  }

  async writeBatch(auditLogs: AuditLog[], tableName: string): Promise<void> {
    debug('NoOpWriter: Skipped batch audit logs', {
      event: 'AuditNoOpBatch',
      metadata: { count: auditLogs.length, tableName },
    })
  }
}
