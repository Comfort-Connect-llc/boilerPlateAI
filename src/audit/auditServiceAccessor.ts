import type { IAuditService } from './core/IAuditService.js'

let auditServiceInstance: IAuditService | null = null

/**
 * Register the audit service instance during application startup.
 * Called once from index.ts.
 */
export function registerAuditService(service: IAuditService | null): void {
  auditServiceInstance = service
}

/**
 * Get the registered audit service.
 * Returns null if auditing is disabled or not yet initialized.
 */
export function getAuditService(): IAuditService | null {
  return auditServiceInstance
}
