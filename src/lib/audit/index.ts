/**
 * Audit Logging System
 *
 * A decoupled audit logging system for tracking entity changes.
 * Audit data is stored separately from business entities.
 *
 * @example
 * ```typescript
 * import { auditService } from './lib/audit'
 *
 * // After updating an entity
 * await auditService.auditUpdate({
 *   entityType: 'Invoice',
 *   entityId: invoice.id,
 *   entityBefore: existingInvoice,
 *   entityAfter: updatedInvoice,
 *   userId: getUserId(),
 *   metadata: { requestId: getRequestId(), source: 'api' },
 * })
 * ```
 */

// Core types
export type {
  AuditLog,
  ChangeRecord,
  AuditMetadata,
  AuditConfig,
  EntityAuditConfig,
  WriterConfig,
  ChangeDetectionOptions,
  IAuditService,
  AuditCreateParams,
  AuditUpdateParams,
  AuditDeleteParams,
} from './types.js'

export { AuditOperation, DEFAULT_EXCLUDED_FIELDS } from './types.js'

// Change detection
export {
  detectChanges,
  detectCreateChanges,
  detectDeleteChanges,
} from './change-detection.js'

// Configuration
export {
  getAuditConfig,
  setAuditConfig,
  configureEntityAudit,
  isAuditEnabled,
  getEntityWriter,
  getTableName,
  getExcludedFields,
  shouldIncludeSnapshots,
  resetAuditConfig,
  getDefaultAuditConfig,
} from './audit-config.js'

// Audit service (main entry point)
export { auditService, clearWriterCache } from './audit-service.js'

// Writers (for advanced use cases)
export type { IAuditWriter } from './writers/audit-writer.interface.js'
export { DynamoDBWriter } from './writers/dynamodb-writer.js'
export { PostgresWriter } from './writers/postgres-writer.js'
export { SQSWriter } from './writers/sqs-writer.js'
export { NoOpWriter } from './writers/noop-writer.js'
export { CompositeWriter } from './writers/composite-writer.js'
