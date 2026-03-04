export interface AuditParams {
  domain: string
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  performedBy: string
  snapshotBefore: unknown | null
  snapshotAfter: unknown | null
  metadata?: Record<string, unknown>
}

export interface IAuditService {
  audit(params: AuditParams): Promise<void>
}
