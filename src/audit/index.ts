// Core types
export { type AuditChange, type AuditLogEntry, type AuditEvent } from './core/AuditLog.model.js'
export { type IAuditService, type AuditParams } from './core/IAuditService.js'

// Services
export { SyncAuditService } from './core/SyncAuditService.js'
export { AsyncAuditService } from './core/AsyncAuditService.js'

// Utilities
export { detectChanges } from './core/ChangeDetector.js'
export { handleSnapshot, type SnapshotResult, type SnapshotMetadata } from './core/SnapshotHandler.js'

// Repository
export { insertAuditLog, ensureAuditTable } from './core/AuditRepository.js'

// Queue
export { type IQueue, type QueueMessage, type ReceiveOptions } from './queue/IQueue.js'
export { SQSQueue } from './queue/SQSQueue.js'

// Worker
export { AuditWorker } from './worker/AuditWorker.js'

// Factory helper
export { createAuditService } from './createAuditService.js'

// Service accessor (for use from domain services)
export { registerAuditService, getAuditService } from './auditServiceAccessor.js'
