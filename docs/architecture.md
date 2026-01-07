# Architecture Documentation

This document explains the design decisions, patterns, and best practices used in this boilerplate.

## Table of Contents

1. [Overview](#overview)
2. [Layered Architecture](#layered-architecture)
3. [Dual Database Strategy](#dual-database-strategy)
4. [Request Context Pattern](#request-context-pattern)
5. [Authentication & Authorization](#authentication--authorization)
6. [Error Handling](#error-handling)
7. [Validation Strategy](#validation-strategy)
8. [Logging](#logging)
9. [Event-Driven Architecture](#event-driven-architecture)
10. [Testing Strategy](#testing-strategy)

---

## Overview

This boilerplate is designed for building **domain-specific microservices** that follow production-ready patterns:

- **Single Responsibility**: Each API handles one domain (e.g., billing, accounts, users)
- **Scalability**: Dual database strategy for optimal read/write performance
- **Observability**: Structured logging, request tracking, audit trails
- **Security**: Auth0 integration with RBAC, input validation, security headers
- **Maintainability**: Clear separation of concerns, consistent patterns

**Technology Stack:**
- Node.js v20+ with TypeScript
- Express.js for HTTP layer
- DynamoDB (primary writes) + PostgreSQL (read replica)
- Auth0 for authentication
- AWS services (S3, SNS, SSM)
- Prisma ORM for PostgreSQL
- Vitest for testing

---

## Layered Architecture

### Layer Responsibilities

```
┌─────────────────────────────────────┐
│   Routes Layer (HTTP Binding)       │  ← Define endpoints, validation, auth
├─────────────────────────────────────┤
│   Controller Layer (HTTP Mapping)   │  ← Map HTTP to service calls
├─────────────────────────────────────┤
│   Service Layer (Business Logic)    │  ← Business rules, orchestration
├─────────────────────────────────────┤
│   Data Layer (Persistence)          │  ← Database operations
└─────────────────────────────────────┘
```

### 1. Routes Layer

**Responsibility:** Define API endpoints, apply middleware

**Location:** `src/modules/{domain}/{domain}.routes.ts`

```typescript
router.post(
  '/',
  requirePermissions('write:invoices'),        // Authorization
  validate({ body: createInvoiceSchema }),     // Validation
  invoiceController.createInvoice              // Handler
)
```

**Why:** Keeps HTTP concerns separate, makes it easy to add/remove middleware

### 2. Controller Layer

**Responsibility:** Convert HTTP requests to service calls, format responses

**Location:** `src/modules/{domain}/{domain}.controller.ts`

```typescript
export const createInvoice = asyncHandler(async (req, res) => {
  const input: CreateInvoiceInput = req.body          // Extract
  const invoice = await invoiceService.create(input)   // Call service

  res.status(httpStatus.CREATED).json({                // Format response
    message: 'Invoice created successfully',
    data: invoice,
  })
})
```

**Why:** Service layer stays HTTP-agnostic, can be reused from CLI, queues, etc.

### 3. Service Layer

**Responsibility:** Business logic, orchestration, database operations

**Location:** `src/modules/{domain}/{domain}.service.ts`

```typescript
export async function createInvoice(input: CreateInvoiceInput) {
  // Business validation
  if (input.amount < 0) throw badRequest('Amount must be positive')

  // Write to primary DB
  const invoice = await createItem({ tableName, item: input })

  // Sync to read replica
  await prisma.invoice.create({ data: invoice })

  // Publish event
  await publishEvent(topic, 'invoice.created', { id: invoice.id })

  return invoice
}
```

**Why:** Business logic is testable without HTTP layer, reusable across contexts

### 4. Data Layer

**Responsibility:** Database-specific operations

**Location:** `src/db/dynamodb.ts`, `src/db/prisma.ts`

**Why:** Abstracts database implementation, makes it easy to swap/mock

---

## Dual Database Strategy

### Why Two Databases?

**DynamoDB (Primary Write Store):**
- ✅ Fast writes with single-digit millisecond latency
- ✅ Built-in optimistic locking (version attribute)
- ✅ Audit trail storage (JSON arrays)
- ✅ Horizontal scalability
- ❌ Limited query capabilities
- ❌ No full-text search

**PostgreSQL (Read Replica):**
- ✅ Complex queries with JOINs
- ✅ Full-text search
- ✅ Pagination and sorting
- ✅ Analytics and reporting
- ❌ Slower for high-volume writes
- ❌ Vertical scaling limitations

### Data Flow

```
┌──────────┐         ┌────────────┐         ┌────────────┐
│  Client  │────────▶│  Service   │────────▶│  DynamoDB  │
└──────────┘         │   Layer    │         │  (Primary) │
                     └────────────┘         └────────────┘
                           │                       │
                           │                       │ Sync
                           │                       ▼
                           │                 ┌────────────┐
                           └────────────────▶│ PostgreSQL │
                                             │  (Replica) │
                                             └────────────┘
```

**Write Path:**
1. Write to DynamoDB first (source of truth)
2. Immediately sync to PostgreSQL
3. If PostgreSQL sync fails, log error and retry (eventual consistency)

**Read Path:**
- **Simple lookups by ID**: Read from DynamoDB
- **Complex queries**: Read from PostgreSQL (pagination, search, filters)

### Trade-offs

**Pros:**
- Best of both worlds: fast writes + complex queries
- Natural disaster recovery (two copies of data)
- Can rebuild PostgreSQL from DynamoDB if needed

**Cons:**
- Eventual consistency risk (mitigated by synchronous sync)
- Increased infrastructure complexity
- Need to maintain two schemas

**When to simplify:**
- If you only need simple CRUD, use PostgreSQL only
- If you need extreme write performance, use DynamoDB only

---

## Request Context Pattern

### The Problem

Passing `userId`, `requestId`, and other request-scoped data through every function is tedious:

```typescript
// ❌ Prop drilling
function createInvoice(input, userId, requestId) {
  const invoice = saveInvoice(input, userId, requestId)
  sendNotification(invoice, userId, requestId)
}
```

### The Solution: AsyncLocalStorage

**Location:** `src/lib/request-context.ts`

```typescript
// ✅ Access context anywhere without passing parameters
function createInvoice(input) {
  const userId = getUserId()              // From context
  const requestId = getRequestId()        // From context

  const invoice = saveInvoice(input)      // No params needed
  sendNotification(invoice)
}
```

### How It Works

1. **Middleware sets context** on every request:
```typescript
app.use(requestContextMiddleware)
```

2. **Context is accessible** throughout the request lifecycle:
```typescript
const user = getUser()
const logger = getLogger()
```

3. **Automatically cleaned up** after request completes

### Benefits

- No prop drilling
- Cleaner function signatures
- Automatic request ID propagation
- Thread-safe (uses Node.js AsyncLocalStorage)

---

## Authentication & Authorization

### Auth0 Integration

**Flow:**
```
Client ──token──▶ Express ──verify──▶ Auth0 ──claims──▶ Request Context
```

1. Client includes JWT in `Authorization: Bearer {token}` header
2. Middleware validates JWT with Auth0
3. User claims extracted and stored in request context
4. Permission checks on each route

### Permission Model

**Route-level authorization:**

```typescript
router.post(
  '/invoices',
  requirePermissions('write:invoices'),  // Requires ALL permissions
  handler
)

router.get(
  '/admin',
  requireAnyPermission('admin:billing', 'admin:system'),  // Requires ANY
  handler
)
```

**Service-level authorization:**

```typescript
function deleteInvoice(id: string) {
  if (!hasPermission('delete:invoices')) {
    throw forbidden('Insufficient permissions')
  }
  // ... delete logic
}
```

### Permission Naming Convention

Use the pattern: `{action}:{resource}`

- `read:invoices` - List and view invoices
- `write:invoices` - Create and update invoices
- `delete:invoices` - Delete invoices
- `admin:billing` - Full access to billing domain

**Helper:**

```typescript
import { PermissionPatterns } from './lib/base-service.js'

PermissionPatterns.read('invoices')   // 'read:invoices'
PermissionPatterns.write('invoices')  // 'write:invoices'
```

---

## Error Handling

### ApiError Class

**Location:** `src/lib/errors.ts`

All errors extend `ApiError`:

```typescript
class ApiError extends Error {
  statusCode: number
  isOperational: boolean  // true = expected error, false = bug
  details?: unknown
}
```

### Error Factory Functions

```typescript
throw notFound('Invoice not found')           // 404
throw badRequest('Invalid amount')            // 400
throw unauthorized('Invalid credentials')     // 401
throw forbidden('Insufficient permissions')   // 403
throw conflict('Invoice already paid')        // 409
```

### Global Error Handler

**Location:** `src/middleware/error-handler.ts`

Catches all errors and formats consistent responses:

```json
{
  "error": {
    "message": "Invoice not found",
    "statusCode": 404,
    "details": { "invoiceId": "123" }
  }
}
```

**Logging:**
- Operational errors (4xx) → `logger.warn()`
- System errors (5xx) → `logger.error()` with stack trace

---

## Validation Strategy

### Zod for Runtime Validation

**Why Zod:**
- Runtime type checking (TypeScript only checks compile-time)
- Type inference (no duplicate types)
- Composable schemas
- Great error messages

### Validation Middleware

**Location:** `src/lib/validation.ts`

```typescript
router.post(
  '/invoices',
  validate({
    params: invoiceIdSchema,      // URL params
    query: listQuerySchema,       // Query string
    body: createInvoiceSchema,    // Request body
  }),
  handler
)
```

### Common Patterns

**Reusable schemas:**

```typescript
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

export const uuidSchema = z.string().uuid()
```

**Schema composition:**

```typescript
export const listInvoicesSchema = paginationSchema.extend({
  status: z.enum(['paid', 'pending', 'overdue']).optional(),
  minAmount: z.coerce.number().positive().optional(),
})
```

---

## Logging

### Structured Logging with Pino

**Location:** `src/lib/logger.ts`

**Why Pino:**
- Extremely fast (asynchronous logging)
- JSON output for log aggregation (CloudWatch, ELK)
- Automatic request context binding
- Sensitive data redaction

### Usage

```typescript
// Basic logging
logger.info('Invoice created')
logger.error({ err }, 'Failed to process payment')

// With context
logger.info({ invoiceId, amount }, 'Invoice paid')

// Automatic redaction
logger.info({ password: 'secret123' })
// Output: { password: '[REDACTED]' }
```

### Request Logging

Automatically logs all HTTP requests:

```json
{
  "req": {
    "method": "POST",
    "url": "/api/v1/invoices",
    "id": "req-abc123"
  },
  "res": {
    "statusCode": 201
  },
  "responseTime": 45,
  "msg": "request completed"
}
```

---

## Event-Driven Architecture

### SNS for Domain Events

**Why events:**
- Decouple services
- Enable async workflows
- Support multiple consumers
- Audit trail

### Publishing Events

```typescript
await publishEvent(
  env.SNS_TOPIC_ARN_BILLING,
  BillingEvents.INVOICE_CREATED,
  { invoiceId: invoice.id, customerId: invoice.customerId }
)
```

### Event Naming

Use the pattern: `{domain}.{entity}.{action}`

```typescript
export const BillingEvents = {
  INVOICE_CREATED: 'billing.invoice.created',
  INVOICE_PAID: 'billing.invoice.paid',
  PAYMENT_FAILED: 'billing.payment.failed',
}
```

### Event Payload

Include:
- Entity ID(s)
- Minimum data needed for consumers
- Timestamp (automatic)
- Request ID (automatic for tracing)

**Don't include:**
- Full entity payload (consumers should fetch if needed)
- Sensitive data (PII, secrets)

---

## Testing Strategy

### Test Pyramid

```
        ┌──────────┐
        │    E2E   │  ← Few, critical flows
        ├──────────┤
        │Integration│  ← HTTP API tests
        ├──────────┤
        │   Unit   │  ← Most tests here
        └──────────┘
```

### Unit Tests

Test individual functions in isolation:

```typescript
describe('calculateTax', () => {
  it('should calculate 10% tax', () => {
    expect(calculateTax(100)).toBe(10)
  })
})
```

### Integration Tests

Test full request/response flow:

```typescript
it('should create invoice', async () => {
  const response = await request(app)
    .post('/api/v1/invoices')
    .send({ amount: 100, customerId: '123' })

  expect(response.status).toBe(201)
  expect(response.body.data).toHaveProperty('id')
})
```

### Test Helpers

**Location:** `tests/setup.ts`

```typescript
const mockUser = createMockAuthUser({ permissions: ['write:invoices'] })
const mockEntity = createMockEntity({ amount: 100 })
const mockPagination = createMockPaginatedResponse([item1, item2], 50)
```

---

## Design Principles

1. **Convention over Configuration**: Follow established patterns
2. **Fail Fast**: Validate early, fail loudly
3. **Single Source of Truth**: DynamoDB is authoritative
4. **Observability First**: Log everything important
5. **Security by Default**: Auth on all routes (except health checks)
6. **Backward Compatibility**: Version APIs, don't break consumers

---

## When to Deviate

These patterns are guidelines, not rules. Deviate when:

- **Performance requirements** demand different architecture
- **Business complexity** requires different organization
- **Team expertise** suggests better patterns
- **Domain characteristics** don't fit the model

Always document architectural decisions in ADRs (Architecture Decision Records).

---

## Further Reading

- [Creating a New Module](./creating-new-module.md)
- [Module README](../src/modules/_example-entity/README.md)
- Project README (overview and quick start)
