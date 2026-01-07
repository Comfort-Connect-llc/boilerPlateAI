# Creating a New Module

This guide walks you through creating a new domain module using the boilerplate's established patterns.

## Overview

Each module represents a domain entity (e.g., `users`, `invoices`, `products`) and follows a consistent structure:

```
src/modules/your-domain/
├── your-domain.schema.ts      # Zod validation schemas
├── your-domain.service.ts     # Business logic
├── your-domain.controller.ts  # HTTP handlers
└── your-domain.routes.ts      # Route definitions
```

## Step-by-Step Guide

### 1. Copy the Example Module

The `_example-entity` module serves as a template:

```bash
cd src/modules
cp -r _example-entity your-domain
cd your-domain
```

### 2. Rename Files

Replace `entity` with your domain name:

```bash
mv entity.schema.ts your-domain.schema.ts
mv entity.service.ts your-domain.service.ts
mv entity.controller.ts your-domain.controller.ts
mv entity.routes.ts your-domain.routes.ts
rm README.md  # Remove the template README
```

### 3. Define Your Schema

Edit `your-domain.schema.ts`:

```typescript
import { z } from '../../lib/validation.js'

// Base entity schema
export const yourDomainSchema = z.object({
  id: z.string().uuid(),
  // Add your domain-specific fields
  name: z.string().min(1).max(255),
  status: z.enum(['active', 'pending', 'completed']),
  amount: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  // Standard fields
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type YourDomain = z.infer<typeof yourDomainSchema>

// Create input schema (fields needed to create)
export const createYourDomainSchema = z.object({
  name: z.string().min(1).max(255),
  status: z.enum(['active', 'pending', 'completed']).default('pending'),
  amount: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export type CreateYourDomainInput = z.infer<typeof createYourDomainSchema>

// Update input schema (fields that can be updated)
export const updateYourDomainSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(['active', 'pending', 'completed']).optional(),
  amount: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export type UpdateYourDomainInput = z.infer<typeof updateYourDomainSchema>

// List query schema
export const listYourDomainQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  orderBy: z.enum(['name', 'createdAt', 'amount']).default('createdAt'),
  orderDirection: z.enum(['asc', 'desc']).default('desc'),
  active: z.coerce.boolean().default(true),
  status: z.enum(['active', 'pending', 'completed']).optional(), // Domain-specific filter
})

export type ListYourDomainQuery = z.infer<typeof listYourDomainQuerySchema>

// ID param schema
export const yourDomainIdParamSchema = z.object({
  id: z.string().uuid(),
})
```

### 4. Define Prisma Model

Add to `prisma/schema.prisma`:

```prisma
model YourDomain {
  id         String   @id @default(uuid()) @db.Uuid
  name       String
  status     String   // or use enum
  amount     Decimal? @db.Decimal(10, 2)
  metadata   Json?
  version    Int      @default(1)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  auditTrail Json[]   @default([]) @map("audit_trail")

  // Add relations if needed
  // relatedItems RelatedItem[]

  @@index([status])
  @@index([active])
  @@map("your_domains")
}
```

Run migration:

```bash
npx prisma migrate dev --name add_your_domain
```

### 5. Implement Service Layer

Edit `your-domain.service.ts`:

```typescript
import { getPrisma } from '../../db/prisma.js'
import {
  createItem,
  getItemOrThrow,
  updateItem,
  softDeleteItem,
  getTableName,
  type BaseEntity,
} from '../../db/dynamodb.js'
import { notFound, conflict } from '../../lib/errors.js'
import { publishEvent } from '../../lib/sns.js'
import { getUser } from '../../lib/request-context.js'
import { logger } from '../../lib/logger.js'
import { buildAuditEntry } from '../../lib/base-service.js'
import { createPaginatedResponse, getPaginationSkipTake } from '../../lib/pagination.js'
import { buildWhereClause, buildOrderByClause } from '../../lib/query-builder.js'
import type {
  CreateYourDomainInput,
  UpdateYourDomainInput,
  ListYourDomainQuery,
} from './your-domain.schema.js'
import { getEnv } from '../../config/env.js'

// DynamoDB entity type
interface YourDomainEntity extends BaseEntity {
  name: string
  status: string
  amount?: number
  metadata?: Record<string, unknown>
  auditTrail: AuditEntry[]
}

interface AuditEntry {
  modifiedBy: string
  modifiedAt: string
  changes: Record<string, { before: unknown; after: unknown }>
}

const TABLE_NAME = getTableName('your-domains')

// Event types for this domain
export const YourDomainEvents = {
  CREATED: 'your-domain.created',
  UPDATED: 'your-domain.updated',
  DELETED: 'your-domain.deleted',
} as const

// Create
export async function createYourDomain(
  input: CreateYourDomainInput
): Promise<YourDomainEntity> {
  const prisma = getPrisma()

  // Add business validation here
  // Example: Check for duplicates
  // const existing = await prisma.yourDomain.findUnique({ where: { name: input.name } })
  // if (existing) throw conflict(`YourDomain with name ${input.name} already exists`)

  // Create in DynamoDB (primary)
  const entity = await createItem<YourDomainEntity>({
    tableName: TABLE_NAME,
    item: {
      name: input.name,
      status: input.status,
      amount: input.amount,
      metadata: input.metadata,
      auditTrail: [],
      active: true,
    },
  })

  // Sync to PostgreSQL (read replica)
  await prisma.yourDomain.create({
    data: {
      id: entity.id,
      name: entity.name,
      status: entity.status,
      amount: entity.amount,
      metadata: entity.metadata,
      version: entity.version,
      active: entity.active,
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    },
  })

  // Publish event
  const env = getEnv()
  await publishEvent(
    env.SNS_TOPIC_ARN_YOUR_DOMAIN, // Add this to env schema
    YourDomainEvents.CREATED,
    { id: entity.id, name: entity.name }
  )

  logger.info({ id: entity.id }, 'YourDomain created')

  return entity
}

// Get by ID
export async function getYourDomain(id: string): Promise<YourDomainEntity> {
  const entity = await getItemOrThrow<YourDomainEntity>({
    tableName: TABLE_NAME,
    id,
  })
  return entity
}

// List with pagination
export async function listYourDomain(query: ListYourDomainQuery) {
  const prisma = getPrisma()
  const { page, pageSize, search, orderBy, orderDirection, active, status } = query

  // Build where clause
  const where = {
    ...buildWhereClause({ search, active }, ['name']),
    ...(status && { status }),
  }

  // Build order by
  const orderByClause = buildOrderByClause(orderBy, orderDirection)

  // Pagination
  const { skip, take } = getPaginationSkipTake(page, pageSize)

  // Execute queries in parallel
  const [items, total] = await Promise.all([
    prisma.yourDomain.findMany({
      where,
      orderBy: orderByClause,
      skip,
      take,
    }),
    prisma.yourDomain.count({ where }),
  ])

  // Map to entity type
  const entities = items.map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    amount: item.amount ? Number(item.amount) : undefined,
    metadata: item.metadata as Record<string, unknown> | undefined,
    version: item.version,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    auditTrail: (item.auditTrail as AuditEntry[]) || [],
  }))

  return createPaginatedResponse(entities, total, page, pageSize)
}

// Update
export async function updateYourDomain(
  id: string,
  input: UpdateYourDomainInput
): Promise<YourDomainEntity> {
  const prisma = getPrisma()
  const user = getUser()

  // Get existing
  const existing = await getItemOrThrow<YourDomainEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Add business validation here

  // Build audit entry
  const auditEntry = buildAuditEntry(user?.sub ?? 'system', existing, input)

  // Update in DynamoDB with optimistic locking
  const updated = await updateItem<YourDomainEntity>({
    tableName: TABLE_NAME,
    id,
    version: existing.version,
    updates: {
      ...input,
      auditTrail: [...existing.auditTrail, auditEntry],
    },
  })

  // Sync to PostgreSQL
  await prisma.yourDomain.update({
    where: { id },
    data: {
      name: updated.name,
      status: updated.status,
      amount: updated.amount,
      metadata: updated.metadata,
      version: updated.version,
      updatedAt: new Date(updated.updatedAt),
      auditTrail: updated.auditTrail,
    },
  })

  // Publish event
  const env = getEnv()
  await publishEvent(
    env.SNS_TOPIC_ARN_YOUR_DOMAIN,
    YourDomainEvents.UPDATED,
    { id, changes: auditEntry.changes }
  )

  logger.info({ id }, 'YourDomain updated')

  return updated
}

// Delete (soft delete)
export async function deleteYourDomain(id: string): Promise<void> {
  const prisma = getPrisma()

  const existing = await getItemOrThrow<YourDomainEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Soft delete in DynamoDB
  await softDeleteItem({
    tableName: TABLE_NAME,
    id,
    version: existing.version,
  })

  // Soft delete in PostgreSQL
  await prisma.yourDomain.update({
    where: { id },
    data: { active: false },
  })

  // Publish event
  const env = getEnv()
  await publishEvent(env.SNS_TOPIC_ARN_YOUR_DOMAIN, YourDomainEvents.DELETED, { id })

  logger.info({ id }, 'YourDomain deleted')
}
```

### 6. Implement Controller

Edit `your-domain.controller.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'
import httpStatus from 'http-status'
import * as yourDomainService from './your-domain.service.js'
import type {
  CreateYourDomainInput,
  UpdateYourDomainInput,
  ListYourDomainQuery,
} from './your-domain.schema.js'

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export const createYourDomain = asyncHandler(async (req: Request, res: Response) => {
  const input: CreateYourDomainInput = req.body
  const entity = await yourDomainService.createYourDomain(input)

  res.status(httpStatus.CREATED).json({
    message: 'YourDomain created successfully',
    data: entity,
  })
})

export const getYourDomain = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const entity = await yourDomainService.getYourDomain(id)

  res.status(httpStatus.OK).json({
    message: 'YourDomain retrieved successfully',
    data: entity,
  })
})

export const listYourDomain = asyncHandler(async (req: Request, res: Response) => {
  const query: ListYourDomainQuery = req.query as unknown as ListYourDomainQuery
  const result = await yourDomainService.listYourDomain(query)

  res.status(httpStatus.OK).json({
    message: 'YourDomain list retrieved successfully',
    data: result.data,
    pagination: result.pagination,
  })
})

export const updateYourDomain = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const input: UpdateYourDomainInput = req.body
  const entity = await yourDomainService.updateYourDomain(id, input)

  res.status(httpStatus.OK).json({
    message: 'YourDomain updated successfully',
    data: entity,
  })
})

export const deleteYourDomain = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  await yourDomainService.deleteYourDomain(id)

  res.status(httpStatus.OK).json({
    message: 'YourDomain deleted successfully',
  })
})
```

### 7. Define Routes

Edit `your-domain.routes.ts`:

```typescript
import { Router } from 'express'
import { validate } from '../../lib/validation.js'
import { requirePermissions } from '../../middleware/auth.js'
import { PermissionPatterns } from '../../lib/base-service.js'
import * as yourDomainController from './your-domain.controller.js'
import {
  createYourDomainSchema,
  updateYourDomainSchema,
  listYourDomainQuerySchema,
  yourDomainIdParamSchema,
} from './your-domain.schema.js'

const router = Router()

const resource = 'your-domain' // Used for permission naming

// List
router.get(
  '/',
  requirePermissions(PermissionPatterns.read(resource)),
  validate({ query: listYourDomainQuerySchema }),
  yourDomainController.listYourDomain
)

// Get by ID
router.get(
  '/:id',
  requirePermissions(PermissionPatterns.read(resource)),
  validate({ params: yourDomainIdParamSchema }),
  yourDomainController.getYourDomain
)

// Create
router.post(
  '/',
  requirePermissions(PermissionPatterns.write(resource)),
  validate({ body: createYourDomainSchema }),
  yourDomainController.createYourDomain
)

// Update
router.put(
  '/:id',
  requirePermissions(PermissionPatterns.write(resource)),
  validate({
    params: yourDomainIdParamSchema,
    body: updateYourDomainSchema,
  }),
  yourDomainController.updateYourDomain
)

// Delete (soft delete)
router.delete(
  '/:id',
  requirePermissions(PermissionPatterns.delete(resource)),
  validate({ params: yourDomainIdParamSchema }),
  yourDomainController.deleteYourDomain
)

export default router
```

### 8. Register Routes

Edit `src/app.ts`:

```typescript
// Add import
import yourDomainRoutes from './modules/your-domain/your-domain.routes.js'

// Register route (inside createApp function)
app.use('/api/v1/your-domain', yourDomainRoutes)
```

### 9. Add Environment Variables

Edit `src/config/env.ts`:

```typescript
const envSchema = z.object({
  // ... existing vars ...

  // Your domain SNS topic
  SNS_TOPIC_ARN_YOUR_DOMAIN: z.string().optional(),
})
```

Update `.env`:

```bash
SNS_TOPIC_ARN_YOUR_DOMAIN=arn:aws:sns:us-east-1:123456789:your-domain-topic
```

### 10. Write Tests

Create `tests/integration/your-domain.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { createMockAuthUser } from '../setup.js'

// Mock service layer
vi.mock('../../src/modules/your-domain/your-domain.service.js', () => ({
  createYourDomain: vi.fn(),
  getYourDomain: vi.fn(),
  listYourDomain: vi.fn(),
  updateYourDomain: vi.fn(),
  deleteYourDomain: vi.fn(),
}))

// Mock auth middleware
vi.mock('../../src/middleware/auth.js', () => ({
  createAuthMiddleware: () => (req: any, res: any, next: any) => next(),
  extractUserContext: (req: any, res: any, next: any) => {
    req.auth = createMockAuthUser({ permissions: ['read:your-domain', 'write:your-domain'] })
    next()
  },
  requirePermissions: () => (req: any, res: any, next: any) => next(),
}))

describe('YourDomain API', () => {
  const app = createApp()

  it('should create a new entity', async () => {
    const response = await request(app)
      .post('/api/v1/your-domain')
      .send({ name: 'Test', status: 'active' })

    expect(response.status).toBe(201)
  })

  // Add more tests...
})
```

### 11. Test Your Module

```bash
# Run tests
npm test

# Start server
npm run dev

# Test endpoints
curl -X POST http://localhost:3000/api/v1/your-domain \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "status": "active"}'
```

## Best Practices

1. **Keep service layer pure** - No HTTP concerns (req/res) in services
2. **Validate early** - Use Zod schemas at the route level
3. **Use optimistic locking** - Always pass version when updating
4. **Add audit trails** - Track who changed what and when
5. **Publish events** - Enable async integration with other services
6. **Log meaningfully** - Use structured logging with context
7. **Test thoroughly** - Cover happy path and error cases
8. **Follow naming conventions** - Use consistent permission patterns

## Common Patterns

### Custom Business Logic

Add domain-specific validation in the service layer:

```typescript
export async function createYourDomain(input: CreateYourDomainInput) {
  // Business validation
  if (input.amount && input.amount > 10000) {
    throw badRequest('Amount cannot exceed 10,000')
  }

  // Check business rules
  if (input.status === 'completed' && !input.amount) {
    throw badRequest('Completed items must have an amount')
  }

  // ... rest of create logic
}
```

### Custom Query Filters

Add domain-specific filters:

```typescript
const where = {
  ...buildWhereClause({ search, active }, ['name', 'description']),
  ...(status && { status }),
  ...(minAmount && { amount: { gte: minAmount } }),
  ...(maxAmount && { amount: { lte: maxAmount } }),
}
```

### Relations

Handle related entities:

```typescript
// In service
const entity = await prisma.yourDomain.findUnique({
  where: { id },
  include: {
    relatedItems: true,
  },
})
```

## Need Help?

- Check the `_example-entity` module for reference
- Review `docs/architecture.md` for design decisions
- Ask questions in team chat
