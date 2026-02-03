# Architectural Decisions Log

This file documents significant architectural decisions made during development.
Entries are append-only and should include context, options considered, decision, and rationale.

---

### [2026-02-03] Decoupled Audit Logging System

**Context**: The existing audit system stored audit trail data directly within business entities (AuditableEntity with embedded auditTrail array). This approach had several drawbacks:
- Entities grew unbounded as audit history accumulated
- Audit data coupled with business logic
- Performance impact when fetching entities with large audit trails
- Difficult to query audit history across entity types

**Options Considered**:

1. **Keep embedded audit trail** - Continue storing auditTrail[] within entities
   - Pros: Simple, no migration needed
   - Cons: Unbounded growth, tight coupling, query limitations

2. **Separate audit table with synchronous writes** - Write to audit table during the same transaction
   - Pros: Consistency guaranteed
   - Cons: Performance impact, failure coupling

3. **Separate audit system with async writes (chosen)** - Write to audit table after primary operation, with fail-safe design
   - Pros: Decoupled, performant, queryable, scalable
   - Cons: Eventual consistency, slightly more complex

**Decision**: Implement a decoupled audit logging system with the following characteristics:
- Audit data stored in separate storage (DynamoDB table and/or PostgreSQL table)
- Pluggable writer interface supporting multiple backends
- Fail-safe design where audit failures never break primary operations
- Deep change detection for nested objects and arrays
- Per-entity configuration for enabling/disabling, field exclusions, snapshots

**Rationale**:
- **Separation of Concerns**: Business entities remain focused on business data
- **Storage Efficiency**: Entities stay small regardless of change history
- **Flexibility**: Easy to query all audits across entity types
- **Performance**: No need to fetch/update large audit arrays
- **Scalability**: Audit data can use different storage/retention policies
- **Observability**: Clear logging of audit operations and failures

**Implementation Files**:
- `src/lib/audit/` - Core audit logging system
- `prisma/schema.prisma` - AuditLog model
- Removed from `src/lib/base-service.ts`: AuditEntry, AuditableEntity, buildAuditEntry()

---
