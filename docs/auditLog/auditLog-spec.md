# Audit Logging System Specification

## Overview

Implement a robust, decoupled audit logging system that tracks all entity changes without storing audit data within the entity itself. The system should be pluggable, allowing different storage strategies, and should never cause primary operations to fail.

**Goal:** Remove the `auditTrail` array from `AuditableEntity` in `base-service.ts` and replace it with a separate audit logging system.

---

## Current State

The existing `base-service.ts` defines:

- `AuditableEntity` with embedded `auditTrail: AuditEntry[]`
- `buildAuditEntry()` function that tracks changes in-entity
- This approach couples audit data with business entities

**To be removed:**

```typescript
export interface AuditEntry {
  modifiedBy: string
  modifiedAt: string
  changes: Record<string, { before: unknown; after: unknown }>
}

export interface AuditableEntity extends BaseEntity {
  auditTrail: AuditEntry[]  // ❌ Remove this
}

export function buildAuditEntry<T extends BaseEntity>(...) { ... }  // ❌ Remove this
```

**To be kept:**

```typescript
export interface BaseEntity {
  id: string
  version: number
  active: boolean
  createdAt: string
  updatedAt: string
}
```

---

## Requirements

### 1. Audit Log Schema

Create a separate `AuditLog` entity stored independently from business entities.

**Schema:**

```typescript
interface AuditLog {
  id: string // UUID
  entityId: string // ID of the entity being audited
  operation: AuditOperation // CREATE | UPDATE | DELETE
  userId: string // User who performed the action
  timestamp: string // ISO 8601 timestamp
  changes: ChangeRecord[] // Array of individual field changes
  snapshotBefore: Record<string, any> | null // Full entity state before operation
  snapshotAfter: Record<string, any> | null // Full entity state after operation
  metadata?: AuditMetadata // Optional context (IP, request ID, etc.)
}

// Note: entityType is determined by the table name, not stored in the record
// Table naming: {entityType}-audit-logs (DynamoDB) or {entity_type}_audit_logs (PostgreSQL)

enum AuditOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

interface ChangeRecord {
  path: string // Dot notation path (e.g., "address.city", "items[0].quantity")
  oldValue: any // Previous value (null for CREATE)
  newValue: any // New value (null for DELETE)
  valueType: string // Type of value for better querying
}

interface AuditMetadata {
  requestId?: string
  ipAddress?: string
  userAgent?: string
  source?: string // e.g., "api", "admin-portal", "batch-job"
}
```

---

### 2. Pluggable Audit Writer Strategy

Create an interface-based system allowing multiple audit storage strategies.

**Interface:**

```typescript
interface IAuditWriter {
  write(auditLog: AuditLog, tableName: string): Promise<void>
  writeBatch(auditLogs: AuditLog[], tableName: string): Promise<void>
}
```

**Implementations:**

1. **DynamoDBWriter** - Direct write to entity-specific DynamoDB audit table
2. **PostgresWriter** - Direct write to entity-specific PostgreSQL audit table
3. **SQSWriter** - Async processing via SQS queue (includes entityType in message)
4. **CompositeWriter** - Write to multiple destinations
5. **NoOpWriter** - Testing/disabled state

---

### 3. Change Detection Utility

Build a deep comparison utility that generates detailed change records.

**Features:**

- Deep comparison of nested objects
- Array change detection with index paths
- Primitive, object, and array support
- Configurable field exclusions (automatically exclude: `version`, `updatedAt`, `createdAt`, `active`)
- Type-aware comparisons
- Null/undefined handling

**Function Signature:**

```typescript
interface ChangeDetectionOptions {
  excludeFields?: string[] // Additional fields to ignore beyond defaults
  includeUnchanged?: boolean // Include fields that didn't change
  maxDepth?: number // Prevent infinite recursion
}

// Default exclusions match BaseEntity system fields
const DEFAULT_EXCLUDED_FIELDS = ['version', 'updatedAt', 'createdAt', 'active']

function detectChanges(
  before: Record<string, any>,
  after: Record<string, any>,
  options?: ChangeDetectionOptions
): ChangeRecord[]
```

---

### 4. Audit Service

Central service coordinating audit operations.

**Responsibilities:**

- Accept audit requests
- Invoke change detection
- Route to appropriate writer(s)
- Handle errors gracefully
- Support configuration per entity type

**Interface:**

```typescript
interface AuditServiceConfig {
  enabled: boolean
  writer: IAuditWriter
  excludeFields?: string[]
  includeSnapshots?: boolean // Store full before/after snapshots
}

interface IAuditService {
  auditCreate(params: {
    entityType: string
    entityId: string
    entity: Record<string, any>
    userId: string
    metadata?: AuditMetadata
  }): Promise<void>

  auditUpdate(params: {
    entityType: string
    entityId: string
    entityBefore: Record<string, any>
    entityAfter: Record<string, any>
    userId: string
    metadata?: AuditMetadata
  }): Promise<void>

  auditDelete(params: {
    entityType: string
    entityId: string
    entity: Record<string, any>
    userId: string
    metadata?: AuditMetadata
  }): Promise<void>
}
```

---

### 5. Service Layer Integration

Modify service methods to capture audit information WITHOUT storing it in the entity.

**Pattern:**

```typescript
// BEFORE (storing audit in entity - to be removed)
async function updateInvoice(id: string, updates: UpdateInput) {
  const current = await getItem({ tableName, key: { id } })

  const updated = {
    ...current,
    ...updates,
    auditLog: [...current.auditLog, newAuditEntry], // ❌ Remove this
  }

  await updateItem({ tableName, key: { id }, updates: updated })
}

// AFTER (separate audit logging)
async function updateInvoice(id: string, updates: UpdateInput) {
  const userId = getUserId()
  const requestId = getRequestId()

  // 1. Get current state
  const entityBefore = await getItem({ tableName, key: { id } })

  // 2. Perform update
  const entityAfter = {
    ...entityBefore,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  await updateItem({ tableName, key: { id }, updates: entityAfter })

  // 3. Audit the change (non-blocking)
  await auditService.auditUpdate({
    entityType: 'Invoice',
    entityId: id,
    entityBefore,
    entityAfter,
    userId,
    metadata: { requestId, source: 'api' },
  })

  return entityAfter
}
```

---

### 6. Configuration

Provide configuration per entity type with sensible defaults.

**Structure:**

```typescript
interface AuditConfig {
  globalEnabled: boolean
  defaultWriter: 'dynamodb' | 'postgres' | 'sqs' | 'noop'
  defaultExcludeFields: string[] // Applied to all entities (e.g., BaseEntity fields)

  entities: {
    [entityType: string]: {
      enabled: boolean
      tableName: string // Specific table name for this entity
      writer?: 'dynamodb' | 'postgres' | 'sqs' | 'composite'
      excludeFields?: string[] // Additional exclusions beyond defaults
      includeSnapshots?: boolean
    }
  }

  // Writer configs now include tableNamePrefix for auto-generation
  writers: {
    dynamodb?: {
      tableNamePrefix?: string // Default: '' (use entity config tableName as-is)
    }
    postgres?: {
      tableNamePrefix?: string // Default: '' (use entity config tableName as-is)
    }
    sqs?: { queueUrl: string }
  }
}
```

**Example:**

```typescript
const auditConfig: AuditConfig = {
  globalEnabled: true,
  defaultWriter: 'dynamodb',

  // Default exclusions for all entities (BaseEntity system fields)
  defaultExcludeFields: ['version', 'updatedAt', 'createdAt', 'active'],

  entities: {
    Invoice: {
      enabled: true,
      tableName: 'invoice-audit-logs', // DynamoDB table name
      excludeFields: ['lastEmailSentAt'],
      includeSnapshots: true,
    },
    User: {
      enabled: true,
      tableName: 'user-audit-logs', // Separate table for users
      excludeFields: ['password', 'passwordHash', 'lastLoginAt'],
      includeSnapshots: false,
      writer: 'composite',
    },
    Order: {
      enabled: true,
      tableName: 'order-audit-logs',
      includeSnapshots: true,
    },
    TempSession: {
      enabled: false,
      tableName: 'temp-session-audit-logs', // Required even if disabled
    },
  },

  writers: {
    dynamodb: { tableNamePrefix: '' }, // Use tableName from entity config
    postgres: { tableNamePrefix: '' }, // Optionally add prefix like 'prod_'
    sqs: { queueUrl: process.env.AUDIT_QUEUE_URL },
  },
}
```

---

### 7. Error Handling Strategy

**Principles:**

- **Audit failures MUST NOT break primary operations**
- Log audit errors separately with high visibility
- Support retry mechanisms for transient failures
- Dead letter queue for persistent failures (SQS writer)

**Implementation:**

```typescript
class AuditService implements IAuditService {
  async auditUpdate(params: AuditUpdateParams): Promise<void> {
    try {
      // Skip if disabled for this entity type
      if (!this.isEnabled(params.entityType)) {
        return
      }

      // Detect changes
      const changes = detectChanges(
        params.entityBefore,
        params.entityAfter,
        this.getOptions(params.entityType)
      )

      // Skip if no changes
      if (changes.length === 0) {
        return
      }

      // Create audit log
      const auditLog: AuditLog = {
        id: crypto.randomUUID(),
        entityId: params.entityId,
        operation: AuditOperation.UPDATE,
        userId: params.userId,
        timestamp: new Date().toISOString(),
        changes,
        snapshotBefore: this.shouldIncludeSnapshots(params.entityType) ? params.entityBefore : null,
        snapshotAfter: this.shouldIncludeSnapshots(params.entityType) ? params.entityAfter : null,
        metadata: params.metadata,
      }

      // Get table name for this entity type
      const tableName = this.getTableName(params.entityType)

      // Write audit log to entity-specific table
      await this.writer.write(auditLog, tableName)
    } catch (error) {
      // Log error but don't throw - audit failure shouldn't break operation
      logger.error('Audit logging failed', {
        event: 'AuditFailure',
        metadata: {
          entityType: params.entityType,
          entityId: params.entityId,
          operation: 'UPDATE',
          error: error.message,
        },
      })

      // Optional: Send to monitoring/alerting system
      // await alerting.sendAlert('AuditFailure', { error, params })
    }
  }
}
```

---

### 8. Database Schema

**IMPORTANT: One audit table per entity type** (e.g., `invoice_audit_logs`, `user_audit_logs`)

**DynamoDB Table Naming:**

- Pattern: `{entityType}-audit-logs` (lowercase, kebab-case)
- Examples: `invoice-audit-logs`, `user-audit-logs`, `order-audit-logs`

**DynamoDB Schema:**

```typescript
// Table: {entityType}-audit-logs (e.g., invoice-audit-logs)
{
  id: string(PK) // Partition key: audit log ID
  entityId_timestamp: string(SK) // Sort key: "{entityId}#2026-02-03T10:00:00Z"
  entityId: string // Entity ID (for querying)
  operation: string // CREATE | UPDATE | DELETE
  userId: string
  timestamp: string
  changes: Array<ChangeRecord>
  snapshotBefore: object
  snapshotAfter: object
  metadata: object
  ttl: number(optional) // Auto-expire old audit logs
}

// GSI: entityId-timestamp-index
// PK: entityId, SK: timestamp
// Use: Query all audits for a specific entity instance
```

**PostgreSQL Table Naming:**

- Pattern: `{entity_type}_audit_logs` (lowercase, snake_case)
- Examples: `invoice_audit_logs`, `user_audit_logs`, `order_audit_logs`

**PostgreSQL Schema:**

```sql
-- Create one table per entity type
CREATE TABLE {entity_type}_audit_logs (
  id UUID PRIMARY KEY,
  entity_id VARCHAR(100) NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
  user_id VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changes JSONB NOT NULL,
  snapshot_before JSONB,
  snapshot_after JSONB,
  metadata JSONB
);

-- Indexes per table
CREATE INDEX idx_{entity_type}_audit_entity ON {entity_type}_audit_logs(entity_id, timestamp DESC);
CREATE INDEX idx_{entity_type}_audit_user ON {entity_type}_audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_{entity_type}_audit_timestamp ON {entity_type}_audit_logs(timestamp DESC);

-- GIN index for JSONB queries
CREATE INDEX idx_{entity_type}_audit_changes ON {entity_type}_audit_logs USING GIN (changes);

-- Example: invoice_audit_logs table
CREATE TABLE invoice_audit_logs (
  id UUID PRIMARY KEY,
  entity_id VARCHAR(100) NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
  user_id VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changes JSONB NOT NULL,
  snapshot_before JSONB,
  snapshot_after JSONB,
  metadata JSONB
);
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure

- [ ] Create audit log types and interfaces (`src/lib/audit/types.ts`)
- [ ] Implement change detection utility (`src/lib/audit/change-detection.ts`)
- [ ] Create IAuditWriter interface (`src/lib/audit/writers/audit-writer.interface.ts`)

### Phase 2: Writers

- [ ] Implement DynamoDBWriter (`src/lib/audit/writers/dynamodb-writer.ts`)
- [ ] Implement PostgresWriter (`src/lib/audit/writers/postgres-writer.ts`)
- [ ] Implement SQSWriter (`src/lib/audit/writers/sqs-writer.ts`)
- [ ] Implement NoOpWriter (`src/lib/audit/writers/noop-writer.ts`)
- [ ] Implement CompositeWriter (`src/lib/audit/writers/composite-writer.ts`)

### Phase 3: Audit Service

- [ ] Create AuditService class (`src/lib/audit/audit-service.ts`)
- [ ] Implement configuration loading (`src/lib/audit/audit-config.ts`)
- [ ] Add dependency injection setup
- [ ] Add error handling and logging

### Phase 4: Integration

**Remove deprecated audit code from base-service.ts:**

- [ ] Remove `AuditEntry` interface
- [ ] Remove `AuditableEntity` interface
- [ ] Remove `buildAuditEntry()` function
- [ ] Update all entities that extended `AuditableEntity` to extend `BaseEntity` only
- [ ] Remove `auditTrail` field from entity type definitions

**Update service layer:**

- [ ] Update all service methods (create, update, delete) to use new audit system
- [ ] Remove code that pushes to `auditTrail` arrays
- [ ] Add audit service calls after successful operations
- [ ] Update DynamoDB schemas (remove auditTrail field)
- [ ] Update PostgreSQL schemas (remove audit_trail columns if present)

### Phase 5: Testing

- [ ] Unit tests for change detection
- [ ] Unit tests for each writer implementation
- [ ] Unit tests for AuditService
- [ ] Integration tests for service layer audit calls
- [ ] Test error handling (audit failures don't break operations)
- [ ] Performance tests (ensure minimal overhead)

### Phase 6: Migration

- [ ] Identify all entities currently using `AuditableEntity`
- [ ] Create migration script to extract existing `auditTrail` arrays from entities
- [ ] Transform old `AuditEntry` format to new `AuditLog` schema
- [ ] Migrate historical audit data to new audit table(s)
- [ ] Deploy audit log infrastructure (DynamoDB table, SQS queue if using async)
- [ ] Validate migration with test data
- [ ] Remove `auditTrail` field from entity items in DynamoDB (optional cleanup)

---

## Integration with Existing Base Service

### Changes to base-service.ts

**Remove these exports (deprecated):**

```typescript
// ❌ Remove - audit data no longer stored in entities
export interface AuditEntry { ... }
export interface AuditableEntity extends BaseEntity { ... }
export function buildAuditEntry<T extends BaseEntity>(...) { ... }
```

**Keep these (still valid):**

```typescript
// ✅ Keep - core entity structure unchanged
export interface BaseEntity {
  id: string
  version: number        // Still used for optimistic locking
  active: boolean        // Still used for soft deletes
  createdAt: string
  updatedAt: string
}

export interface CrudService<...> { ... }
export const PermissionPatterns = { ... }
```

### Migration Example

**Before (using AuditableEntity):**

```typescript
// src/modules/invoices/invoices.types.ts
import { AuditableEntity } from '../../lib/base-service.js'

export interface Invoice extends AuditableEntity {
  customerId: string
  amount: number
  description: string
  // auditTrail is inherited from AuditableEntity
}

// src/modules/invoices/invoices.service.ts
import { buildAuditEntry } from '../../lib/base-service.js'

export async function updateInvoice(id: string, updates: UpdateInput) {
  const current = await getItem({ tableName, key: { id } })

  // ❌ Old way: build and append audit entry to entity
  const auditEntry = buildAuditEntry(getUserId(), current, updates)

  const updated = {
    ...current,
    ...updates,
    auditTrail: [...current.auditTrail, auditEntry], // ❌ Remove
    updatedAt: new Date().toISOString(),
  }

  await updateItem({ tableName, key: { id }, updates: updated })
  return updated
}
```

**After (using separate AuditService):**

```typescript
// src/modules/invoices/invoices.types.ts
import { BaseEntity } from '../../lib/base-service.js'

export interface Invoice extends BaseEntity {
  // ✅ Changed
  customerId: string
  amount: number
  description: string
  // No auditTrail field
}

// src/modules/invoices/invoices.service.ts
import { auditService } from '../../lib/audit'
import { getUserId, getRequestId } from '../../lib/request-context'

export async function updateInvoice(id: string, updates: UpdateInput) {
  const userId = getUserId()
  const requestId = getRequestId()

  // 1. Get current state
  const entityBefore = await getItem({ tableName, key: { id } })

  // 2. Perform update (no audit data in entity)
  const entityAfter = {
    ...entityBefore,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  await updateItem({ tableName, key: { id }, updates: entityAfter })

  // 3. Audit separately (non-blocking)
  await auditService.auditUpdate({
    entityType: 'Invoice',
    entityId: id,
    entityBefore,
    entityAfter,
    userId,
    metadata: { requestId, source: 'api' },
  })

  return entityAfter
}
```

### Benefits of the New Approach

1. **Separation of Concerns**: Business entities don't carry audit data
2. **Storage Efficiency**: Entities remain small, audit data can grow unbounded
3. **Flexibility**: Easy to query audit history independently
4. **Performance**: No need to fetch/update large audit arrays on every change
5. **Scalability**: Audit data can use different storage/retention policies
6. **Queryability**: Can query all audits across entity types easily

---

## Design Principles

1. **Separation of Concerns**: Audit logic completely separate from entity logic
2. **Fail-Safe**: Primary operations never fail due to audit failures
3. **Pluggable**: Easy to swap audit storage strategies
4. **Performant**: Minimal overhead on primary operations
5. **Type-Safe**: Full TypeScript support with strict types
6. **Testable**: All components independently testable
7. **Configurable**: Per-entity configuration with sensible defaults
8. **Observable**: Detailed logging of audit operations and failures

---

## File Structure

```
src/lib/audit/
├── index.ts                           # Public exports
├── types.ts                           # Core types and interfaces
├── audit-service.ts                   # Main audit service
├── audit-config.ts                    # Configuration loading
├── change-detection.ts                # Deep comparison utility
├── writers/
│   ├── audit-writer.interface.ts     # IAuditWriter interface
│   ├── dynamodb-writer.ts            # DynamoDB implementation
│   ├── postgres-writer.ts            # PostgreSQL implementation
│   ├── sqs-writer.ts                 # SQS implementation
│   ├── noop-writer.ts                # No-op implementation
│   └── composite-writer.ts           # Multi-writer implementation
└── __tests__/
    ├── change-detection.test.ts
    ├── audit-service.test.ts
    └── writers/
        ├── dynamodb-writer.test.ts
        └── postgres-writer.test.ts
```

---

## Usage Example

```typescript
// src/modules/invoices/invoices.service.ts
import { auditService } from '../../lib/audit'
import { getUserId, getRequestId } from '../../lib/request-context'

export async function updateInvoice(id: string, updates: UpdateInvoiceInput): Promise<Invoice> {
  const userId = getUserId()
  const requestId = getRequestId()

  // 1. Fetch current state
  const entityBefore = await getItem<Invoice>({
    tableName: env.DYNAMODB_TABLE_NAME,
    key: { id },
  })

  if (!entityBefore) {
    throw notFound('Invoice not found')
  }

  // 2. Perform update
  const entityAfter: Invoice = {
    ...entityBefore,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  await updateItem({
    tableName: env.DYNAMODB_TABLE_NAME,
    key: { id },
    updates: entityAfter,
  })

  // 3. Sync to PostgreSQL
  await prisma.invoice.update({
    where: { id },
    data: entityAfter,
  })

  // 4. Audit the change (non-blocking, never throws)
  await auditService.auditUpdate({
    entityType: 'Invoice',
    entityId: id,
    entityBefore,
    entityAfter,
    userId,
    metadata: { requestId, source: 'api' },
  })

  info('Invoice updated', {
    event: 'InvoiceUpdated',
    metadata: { invoiceId: id },
  })

  return entityAfter
}
```

---

## Action Items Summary

### Immediate Changes Required

1. **base-service.ts**
   - Remove `AuditEntry` interface
   - Remove `AuditableEntity` interface
   - Remove `buildAuditEntry()` function
   - Keep `BaseEntity`, `CrudService`, `PermissionPatterns` as-is

2. **All Entity Type Definitions**
   - Change `extends AuditableEntity` to `extends BaseEntity`
   - Remove `auditTrail: AuditEntry[]` from entity interfaces
   - Remove `auditTrail` from any type definitions

3. **All Service Layer Methods**
   - Remove `buildAuditEntry()` calls
   - Remove code that appends to `auditTrail` arrays
   - Add `auditService.auditCreate/Update/Delete()` calls
   - Capture `entityBefore` state before updates
   - Pass both before/after states to audit service

4. **Database Schemas**
   - DynamoDB: Remove `auditTrail` attribute from item structures
   - PostgreSQL: Remove `audit_trail` columns if present
   - Create new audit log tables (see schema section above)

### Implementation Order

1. ✅ Review and approve this specification
2. Implement Phase 1-3 (Core infrastructure, Writers, AuditService)
3. Test audit system independently with mock data
4. Implement Phase 4 (Integration - update base-service.ts and entities)
5. Implement Phase 5 (Testing - comprehensive test coverage)
6. Implement Phase 6 (Migration - move historical data)
7. Deploy and monitor

---

## Success Criteria

- ✅ `AuditableEntity` and related code removed from base-service.ts
- ✅ All entities extend `BaseEntity` (not `AuditableEntity`)
- ✅ Audit data stored separately from entities
- ✅ All CRUD operations automatically audited
- ✅ Full change history with before/after values
- ✅ Pluggable storage strategies working
- ✅ Zero impact on primary operations if audit fails
- ✅ Configurable per entity type
- ✅ Type-safe implementation
- ✅ Comprehensive test coverage (>80%)
- ✅ Clear migration path from embedded audit logs
- ✅ Performance overhead < 50ms per operation
- ✅ Historical audit data successfully migrated

---

## Non-Goals

- Real-time audit log streaming (use CloudWatch/ELK for this)
- Audit log rollback/restore functionality
- Audit log encryption (handle at storage layer)
- Fine-grained field-level permissions (use entity-level RBAC)
- Historical audit log aggregation/analytics (build separately if needed)
