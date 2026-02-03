/**
 * Audit Logging System Types
 *
 * Core types and interfaces for the decoupled audit logging system.
 * Audit data is stored separately from business entities.
 */

/**
 * Audit operation types
 */
export enum AuditOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Individual field change record
 */
export interface ChangeRecord {
  /** Dot notation path (e.g., "address.city", "items[0].quantity") */
  path: string
  /** Previous value (null for CREATE) */
  oldValue: unknown
  /** New value (null for DELETE) */
  newValue: unknown
  /** Type of value for better querying */
  valueType: string
}

/**
 * Optional metadata for audit context
 */
export interface AuditMetadata {
  /** Request ID for tracing */
  requestId?: string
  /** Client IP address */
  ipAddress?: string
  /** User agent string */
  userAgent?: string
  /** Source of the change (e.g., "api", "admin-portal", "batch-job") */
  source?: string
  /** Additional custom metadata */
  [key: string]: unknown
}

/**
 * Main audit log entity
 * Note: entityType is not stored in the audit log itself - it's determined by the table name
 */
export interface AuditLog {
  /** Unique audit log ID (UUID) */
  id: string
  /** ID of the entity being audited */
  entityId: string
  /** Operation type */
  operation: AuditOperation
  /** User ID who performed the action */
  userId: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Array of individual field changes */
  changes: ChangeRecord[]
  /** Full entity state before operation (null for CREATE) */
  snapshotBefore: Record<string, unknown> | null
  /** Full entity state after operation (null for DELETE) */
  snapshotAfter: Record<string, unknown> | null
  /** Optional context metadata */
  metadata?: AuditMetadata
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
  /** Additional fields to ignore beyond defaults */
  excludeFields?: string[]
  /** Include fields that didn't change (default: false) */
  includeUnchanged?: boolean
  /** Maximum recursion depth to prevent infinite loops (default: 10) */
  maxDepth?: number
}

/**
 * Configuration for audit service per entity type
 */
export interface EntityAuditConfig {
  /** Whether auditing is enabled for this entity type */
  enabled: boolean
  /** Override writer for this entity (uses default if not specified) */
  writer?: 'dynamodb' | 'postgres' | 'sqs' | 'composite' | 'noop'
  /** Custom table name for this entity (defaults to {entityType}-audit-logs for DynamoDB, {entity_type}_audit_logs for Postgres) */
  tableName?: string
  /** Additional fields to exclude beyond defaults */
  excludeFields?: string[]
  /** Whether to include full before/after snapshots */
  includeSnapshots?: boolean
}

/**
 * Writer configuration
 */
export interface WriterConfig {
  dynamodb?: {
    /** Table prefix for DynamoDB (e.g., "myapp" -> "myapp-invoice-audit-logs") */
    tablePrefix?: string
  }
  postgres?: {
    /** Schema name for PostgreSQL tables (defaults to "public") */
    schema?: string
  }
  sqs?: {
    queueUrl: string
  }
}

/**
 * Global audit configuration
 */
export interface AuditConfig {
  /** Global enable/disable flag */
  globalEnabled: boolean
  /** Default writer implementation */
  defaultWriter: 'dynamodb' | 'postgres' | 'sqs' | 'composite' | 'noop'
  /** Fields excluded from all audits (BaseEntity system fields) */
  defaultExcludeFields: string[]
  /** Per-entity configuration */
  entities: Record<string, EntityAuditConfig>
  /** Writer-specific configuration */
  writers: WriterConfig
}

/**
 * Parameters for auditing a CREATE operation
 */
export interface AuditCreateParams {
  entityType: string
  entityId: string
  entity: Record<string, unknown>
  userId: string
  metadata?: AuditMetadata
}

/**
 * Parameters for auditing an UPDATE operation
 */
export interface AuditUpdateParams {
  entityType: string
  entityId: string
  entityBefore: Record<string, unknown>
  entityAfter: Record<string, unknown>
  userId: string
  metadata?: AuditMetadata
}

/**
 * Parameters for auditing a DELETE operation
 */
export interface AuditDeleteParams {
  entityType: string
  entityId: string
  entity: Record<string, unknown>
  userId: string
  metadata?: AuditMetadata
}

/**
 * Audit service interface
 */
export interface IAuditService {
  /**
   * Record a CREATE operation audit
   */
  auditCreate(params: AuditCreateParams): Promise<void>

  /**
   * Record an UPDATE operation audit
   */
  auditUpdate(params: AuditUpdateParams): Promise<void>

  /**
   * Record a DELETE operation audit
   */
  auditDelete(params: AuditDeleteParams): Promise<void>
}

/**
 * Default fields to exclude from audit (BaseEntity system fields)
 */
export const DEFAULT_EXCLUDED_FIELDS = ['version', 'updatedAt', 'createdAt', 'active']
