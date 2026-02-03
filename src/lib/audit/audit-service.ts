/**
 * Audit Service
 *
 * Central service coordinating audit operations.
 * Handles change detection, writer selection, and error handling.
 * Supports per-entity audit tables.
 *
 * Key principle: Audit failures NEVER break primary operations.
 */

import { v4 as uuid } from 'uuid'
import type {
  IAuditService,
  AuditCreateParams,
  AuditUpdateParams,
  AuditDeleteParams,
  AuditLog,
} from './types.js'
import { AuditOperation as AuditOp } from './types.js'
import type { IAuditWriter } from './writers/audit-writer.interface.js'
import { detectChanges, detectCreateChanges, detectDeleteChanges } from './change-detection.js'
import {
  getAuditConfig,
  isAuditEnabled,
  getEntityWriter,
  getTableName,
  getExcludedFields,
  shouldIncludeSnapshots,
} from './audit-config.js'
import { DynamoDBWriter } from './writers/dynamodb-writer.js'
import { PostgresWriter } from './writers/postgres-writer.js'
import { SQSWriter } from './writers/sqs-writer.js'
import { NoOpWriter } from './writers/noop-writer.js'
import { CompositeWriter } from './writers/composite-writer.js'
import { error as logError, warn, debug } from '../logger.js'

/**
 * Get or create a writer instance for the given type
 */
function createWriter(writerType: string): IAuditWriter {
  const config = getAuditConfig()

  switch (writerType) {
    case 'dynamodb':
      return new DynamoDBWriter()

    case 'postgres':
      return new PostgresWriter({
        schema: config.writers.postgres?.schema,
      })

    case 'sqs':
      if (!config.writers.sqs?.queueUrl) {
        warn('SQS writer configured but no queue URL provided, using noop', {
          event: 'AuditConfigWarning',
        })
        return new NoOpWriter()
      }
      return new SQSWriter({
        queueUrl: config.writers.sqs.queueUrl,
      })

    case 'composite':
      // Create a composite writer with DynamoDB and SQS
      const writers: IAuditWriter[] = []
      writers.push(new DynamoDBWriter())
      if (config.writers.sqs?.queueUrl) {
        writers.push(new SQSWriter({ queueUrl: config.writers.sqs.queueUrl }))
      }
      return new CompositeWriter({ writers })

    case 'noop':
    default:
      return new NoOpWriter()
  }
}

// Cache writers to avoid recreating them
const writerCache = new Map<string, IAuditWriter>()

function getWriter(writerType: string): IAuditWriter {
  if (!writerCache.has(writerType)) {
    writerCache.set(writerType, createWriter(writerType))
  }
  return writerCache.get(writerType)!
}

/**
 * Clear writer cache (useful for testing or config changes)
 */
export function clearWriterCache(): void {
  writerCache.clear()
}

/**
 * Audit Service Implementation
 *
 * Provides methods to audit CREATE, UPDATE, and DELETE operations.
 * All methods are fail-safe - they log errors but never throw.
 */
class AuditServiceImpl implements IAuditService {
  /**
   * Record a CREATE operation audit
   */
  async auditCreate(params: AuditCreateParams): Promise<void> {
    try {
      const { entityType, entityId, entity, userId, metadata } = params

      // Check if audit is enabled for this entity type
      if (!isAuditEnabled(entityType)) {
        debug('Audit disabled for entity type', {
          event: 'AuditSkipped',
          metadata: { entityType, entityId, operation: 'CREATE' },
        })
        return
      }

      // Get configuration
      const writerType = getEntityWriter(entityType)
      const tableName = getTableName(entityType, writerType)
      const excludeFields = getExcludedFields(entityType)
      const includeSnapshots = shouldIncludeSnapshots(entityType)

      // Detect changes (all fields are new)
      const changes = detectCreateChanges(entity, { excludeFields })

      // Build audit log (entityType is NOT stored - determined by table name)
      const auditLog: AuditLog = {
        id: uuid(),
        entityId,
        operation: AuditOp.CREATE,
        userId,
        timestamp: new Date().toISOString(),
        changes,
        snapshotBefore: null,
        snapshotAfter: includeSnapshots ? entity : null,
        metadata,
      }

      // Write audit log to entity-specific table
      const writer = getWriter(writerType)
      await writer.write(auditLog, tableName)

      debug('Audit CREATE recorded', {
        event: 'AuditCreateSuccess',
        metadata: { auditId: auditLog.id, entityType, entityId, tableName },
      })
    } catch (err) {
      // Log error but don't throw - audit failures shouldn't break operations
      logError('Audit CREATE failed', {
        event: 'AuditCreateError',
        metadata: {
          entityType: params.entityType,
          entityId: params.entityId,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  /**
   * Record an UPDATE operation audit
   */
  async auditUpdate(params: AuditUpdateParams): Promise<void> {
    try {
      const { entityType, entityId, entityBefore, entityAfter, userId, metadata } = params

      // Check if audit is enabled for this entity type
      if (!isAuditEnabled(entityType)) {
        debug('Audit disabled for entity type', {
          event: 'AuditSkipped',
          metadata: { entityType, entityId, operation: 'UPDATE' },
        })
        return
      }

      // Get configuration
      const writerType = getEntityWriter(entityType)
      const tableName = getTableName(entityType, writerType)
      const excludeFields = getExcludedFields(entityType)
      const includeSnapshots = shouldIncludeSnapshots(entityType)

      // Detect changes
      const changes = detectChanges(entityBefore, entityAfter, { excludeFields })

      // Skip if no actual changes
      if (changes.length === 0) {
        debug('No changes detected, skipping audit', {
          event: 'AuditSkipped',
          metadata: { entityType, entityId, reason: 'no_changes' },
        })
        return
      }

      // Build audit log (entityType is NOT stored - determined by table name)
      const auditLog: AuditLog = {
        id: uuid(),
        entityId,
        operation: AuditOp.UPDATE,
        userId,
        timestamp: new Date().toISOString(),
        changes,
        snapshotBefore: includeSnapshots ? entityBefore : null,
        snapshotAfter: includeSnapshots ? entityAfter : null,
        metadata,
      }

      // Write audit log to entity-specific table
      const writer = getWriter(writerType)
      await writer.write(auditLog, tableName)

      debug('Audit UPDATE recorded', {
        event: 'AuditUpdateSuccess',
        metadata: {
          auditId: auditLog.id,
          entityType,
          entityId,
          tableName,
          changeCount: changes.length,
        },
      })
    } catch (err) {
      // Log error but don't throw - audit failures shouldn't break operations
      logError('Audit UPDATE failed', {
        event: 'AuditUpdateError',
        metadata: {
          entityType: params.entityType,
          entityId: params.entityId,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }

  /**
   * Record a DELETE operation audit
   */
  async auditDelete(params: AuditDeleteParams): Promise<void> {
    try {
      const { entityType, entityId, entity, userId, metadata } = params

      // Check if audit is enabled for this entity type
      if (!isAuditEnabled(entityType)) {
        debug('Audit disabled for entity type', {
          event: 'AuditSkipped',
          metadata: { entityType, entityId, operation: 'DELETE' },
        })
        return
      }

      // Get configuration
      const writerType = getEntityWriter(entityType)
      const tableName = getTableName(entityType, writerType)
      const excludeFields = getExcludedFields(entityType)
      const includeSnapshots = shouldIncludeSnapshots(entityType)

      // Detect changes (all fields are removed)
      const changes = detectDeleteChanges(entity, { excludeFields })

      // Build audit log (entityType is NOT stored - determined by table name)
      const auditLog: AuditLog = {
        id: uuid(),
        entityId,
        operation: AuditOp.DELETE,
        userId,
        timestamp: new Date().toISOString(),
        changes,
        snapshotBefore: includeSnapshots ? entity : null,
        snapshotAfter: null,
        metadata,
      }

      // Write audit log to entity-specific table
      const writer = getWriter(writerType)
      await writer.write(auditLog, tableName)

      debug('Audit DELETE recorded', {
        event: 'AuditDeleteSuccess',
        metadata: { auditId: auditLog.id, entityType, entityId, tableName },
      })
    } catch (err) {
      // Log error but don't throw - audit failures shouldn't break operations
      logError('Audit DELETE failed', {
        event: 'AuditDeleteError',
        metadata: {
          entityType: params.entityType,
          entityId: params.entityId,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  }
}

// Export singleton instance
export const auditService: IAuditService = new AuditServiceImpl()
