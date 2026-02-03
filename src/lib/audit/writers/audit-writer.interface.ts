/**
 * Audit Writer Interface
 *
 * Defines the contract for pluggable audit log storage strategies.
 * All writers must implement this interface for consistent behavior.
 */

import type { AuditLog } from '../types.js'

/**
 * Interface for audit log writers
 *
 * Writers are responsible for persisting audit logs to their respective
 * storage backends (DynamoDB, PostgreSQL, SQS, etc.)
 *
 * All implementations should:
 * - Handle errors gracefully (never throw)
 * - Log failures for observability
 * - Support both single and batch writes
 */
export interface IAuditWriter {
  /**
   * Write a single audit log entry
   *
   * @param auditLog - The audit log to persist
   * @param tableName - The target table name for this audit log
   * @throws Should not throw - failures should be logged internally
   */
  write(auditLog: AuditLog, tableName: string): Promise<void>

  /**
   * Write multiple audit log entries in batch
   *
   * @param auditLogs - Array of audit logs to persist
   * @param tableName - The target table name for these audit logs
   * @throws Should not throw - failures should be logged internally
   */
  writeBatch(auditLogs: AuditLog[], tableName: string): Promise<void>

  /**
   * Get the writer type identifier
   */
  readonly type: string
}
