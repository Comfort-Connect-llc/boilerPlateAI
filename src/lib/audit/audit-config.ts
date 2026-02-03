/**
 * Audit Configuration
 *
 * Manages audit logging configuration with sensible defaults.
 * Supports per-entity audit tables.
 */

import type {
  AuditConfig,
  EntityAuditConfig,
} from './types.js'
import { getEnv } from '../../config/env.js'

/**
 * Default audit configuration
 */
export function getDefaultAuditConfig(): AuditConfig {
  let tablePrefix = ''
  let queueUrl = ''

  try {
    const env = getEnv()
    tablePrefix = env.DYNAMODB_TABLE_PREFIX
  } catch {
    // Config not loaded yet, use defaults
  }

  return {
    globalEnabled: true,
    defaultWriter: 'dynamodb',
    defaultExcludeFields: ['version', 'updatedAt', 'createdAt', 'active'],
    entities: {},
    writers: {
      dynamodb: { tablePrefix },
      postgres: { schema: 'public' },
      sqs: { queueUrl },
    },
  }
}

let cachedConfig: AuditConfig | null = null

/**
 * Get the current audit configuration
 */
export function getAuditConfig(): AuditConfig {
  if (!cachedConfig) {
    cachedConfig = getDefaultAuditConfig()
  }
  return cachedConfig
}

/**
 * Set/update the audit configuration
 *
 * @param config - Partial config to merge with existing
 */
export function setAuditConfig(config: Partial<AuditConfig>): void {
  const current = getAuditConfig()
  cachedConfig = {
    ...current,
    ...config,
    entities: {
      ...current.entities,
      ...config.entities,
    },
    writers: {
      ...current.writers,
      ...config.writers,
    },
  }
}

/**
 * Configure a specific entity type's audit settings
 *
 * @param entityType - The entity type name (e.g., "Invoice", "User")
 * @param config - Entity-specific audit configuration
 */
export function configureEntityAudit(
  entityType: string,
  config: EntityAuditConfig
): void {
  const current = getAuditConfig()
  cachedConfig = {
    ...current,
    entities: {
      ...current.entities,
      [entityType]: config,
    },
  }
}

/**
 * Check if auditing is enabled for an entity type
 */
export function isAuditEnabled(entityType: string): boolean {
  const config = getAuditConfig()

  if (!config.globalEnabled) {
    return false
  }

  const entityConfig = config.entities[entityType]
  if (entityConfig) {
    return entityConfig.enabled
  }

  // Default to enabled if not explicitly configured
  return true
}

/**
 * Get the writer type for an entity
 */
export function getEntityWriter(
  entityType: string
): 'dynamodb' | 'postgres' | 'sqs' | 'composite' | 'noop' {
  const config = getAuditConfig()
  const entityConfig = config.entities[entityType]

  if (entityConfig?.writer) {
    return entityConfig.writer
  }

  return config.defaultWriter
}

/**
 * Get the table name for an entity type
 *
 * Table naming conventions:
 * - DynamoDB: {prefix}-{entity-type}-audit-logs (e.g., myapp-invoice-audit-logs)
 * - PostgreSQL: {entity_type}_audit_logs (e.g., invoice_audit_logs)
 *
 * @param entityType - The entity type (e.g., "Invoice", "User")
 * @param writerType - The writer type (dynamodb, postgres, etc.)
 * @returns The table name to use
 */
export function getTableName(
  entityType: string,
  writerType: 'dynamodb' | 'postgres' | 'sqs' | 'composite' | 'noop'
): string {
  const config = getAuditConfig()
  const entityConfig = config.entities[entityType]

  // Use custom table name if configured
  if (entityConfig?.tableName) {
    return entityConfig.tableName
  }

  // Generate table name based on writer type
  const normalizedEntityType = entityType.toLowerCase()

  switch (writerType) {
    case 'dynamodb': {
      const prefix = config.writers.dynamodb?.tablePrefix
      return prefix
        ? `${prefix}-${normalizedEntityType}-audit-logs`
        : `${normalizedEntityType}-audit-logs`
    }
    case 'postgres': {
      // PostgreSQL uses snake_case
      return `${normalizedEntityType}_audit_logs`
    }
    case 'sqs':
    case 'composite':
    case 'noop':
    default:
      // For SQS/composite, use DynamoDB naming convention as default
      const dynamoPrefix = config.writers.dynamodb?.tablePrefix
      return dynamoPrefix
        ? `${dynamoPrefix}-${normalizedEntityType}-audit-logs`
        : `${normalizedEntityType}-audit-logs`
  }
}

/**
 * Get fields to exclude from audit for an entity type
 */
export function getExcludedFields(entityType: string): string[] {
  const config = getAuditConfig()
  const entityConfig = config.entities[entityType]

  const defaultFields = config.defaultExcludeFields
  const entityFields = entityConfig?.excludeFields ?? []

  return [...new Set([...defaultFields, ...entityFields])]
}

/**
 * Check if snapshots should be included for an entity type
 */
export function shouldIncludeSnapshots(entityType: string): boolean {
  const config = getAuditConfig()
  const entityConfig = config.entities[entityType]

  // Default to true if not explicitly configured
  return entityConfig?.includeSnapshots ?? true
}

/**
 * Reset configuration to defaults (useful for testing)
 */
export function resetAuditConfig(): void {
  cachedConfig = null
}
