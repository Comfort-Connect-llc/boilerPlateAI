import { getEnv } from '../config/env.js'
import type { IAuditService } from './core/IAuditService.js'
import { SyncAuditService } from './core/SyncAuditService.js'
import { AsyncAuditService } from './core/AsyncAuditService.js'
import { SQSQueue } from './queue/SQSQueue.js'
import type { IQueue } from './queue/IQueue.js'
import { logger } from '../lib/logger/index.js'

/**
 * Creates the appropriate audit service based on configuration.
 * Returns null if auditing is disabled.
 */
export function createAuditService(overrides?: {
  queue?: IQueue
}): IAuditService | null {
  const env = getEnv()

  if (!env.AUDIT_ENABLED) {
    logger.info('Audit logging is disabled')
    return null
  }

  if (env.AUDIT_MODE === 'async') {
    const queue = overrides?.queue ?? new SQSQueue()
    logger.info('Audit service initialized in async mode')
    return new AsyncAuditService(queue)
  }

  logger.info('Audit service initialized in sync mode')
  return new SyncAuditService()
}
