export interface AuditChange {
  path: string
  oldValue: unknown
  newValue: unknown
}

export interface AuditLogEntry {
  id: string
  domain: string
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  performedBy: string
  performedAt: Date
  changes: AuditChange[]
  snapshotBefore: unknown | null
  snapshotBeforeS3Key: string | null
  snapshotAfter: unknown | null
  snapshotAfterS3Key: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface AuditEvent {
  domain: string
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  performedBy: string
  performedAt: string
  snapshotBefore: unknown | null
  snapshotAfter: unknown | null
  metadata?: Record<string, unknown>
}
