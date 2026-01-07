# Example Entity Module

This is a **reference implementation** of a complete CRUD module. Use this as a template when creating new domain entities for your API.

## DO NOT USE THIS MODULE IN PRODUCTION

This module is intentionally named `_example-entity` to indicate it's a template, not production code. When creating a new API:

1. **Copy this folder** to your new domain name (e.g., `billing`, `users`, `products`)
2. **Rename all files** replacing `entity` with your domain name
3. **Update the code** with your business logic
4. **Register routes** in `src/app.ts`

## What This Module Demonstrates

### 1. Schema Layer (`entity.schema.ts`)
- Zod schemas for validation
- Type inference for TypeScript safety
- Input/output type definitions
- Query parameter schemas with defaults

### 2. Service Layer (`entity.service.ts`)
- **Dual Database Pattern**: DynamoDB (primary) + PostgreSQL (read replica)
- **Optimistic Locking**: Version-based concurrency control
- **Audit Trail**: Complete change history tracking
- **Event Publishing**: SNS events for async integration
- **Business Logic**: All domain rules in service layer

### 3. Controller Layer (`entity.controller.ts`)
- HTTP request/response mapping
- Async error handling with wrapper
- Consistent response format
- HTTP status code management

### 4. Routes Layer (`entity.routes.ts`)
- Route-level validation
- Permission-based authorization
- RESTful endpoint patterns
- Middleware composition

## How to Create a New Module

### Step 1: Copy the Template

```bash
cp -r src/modules/_example-entity src/modules/YOUR_DOMAIN
cd src/modules/YOUR_DOMAIN
```

### Step 2: Rename Files

```bash
mv entity.schema.ts YOUR_DOMAIN.schema.ts
mv entity.service.ts YOUR_DOMAIN.service.ts
mv entity.controller.ts YOUR_DOMAIN.controller.ts
mv entity.routes.ts YOUR_DOMAIN.routes.ts
rm README.md  # Remove this file
```

### Step 3: Update Schema (`YOUR_DOMAIN.schema.ts`)

Replace the entity schema with your domain fields:

```typescript
export const yourDomainSchema = z.object({
  id: z.string().uuid(),
  // Add your domain-specific fields here
  // Example: amount: z.number().positive()
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type YourDomain = z.infer<typeof yourDomainSchema>
```

### Step 4: Define Your Prisma Model

Add to `prisma/schema.prisma`:

```prisma
model YourDomain {
  id        String   @id @db.Uuid
  // Add your fields
  version   Int      @default(1)
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  auditTrail Json?   @map("audit_trail")

  @@map("your_domains")
}
```

Then run:
```bash
npx prisma migrate dev --name add_your_domain
```

### Step 5: Update Service Logic (`YOUR_DOMAIN.service.ts`)

1. Update the `TABLE_NAME` constant
2. Define your entity interface
3. Implement business-specific validation
4. Update event types (if using SNS)
5. Customize the CRUD operations for your domain

### Step 6: Update Controller & Routes

1. Replace all references to `account` with your domain
2. Update permission names (e.g., `read:accounts` → `read:your-domain`)
3. Adjust validation schemas if needed

### Step 7: Register Routes in `src/app.ts`

```typescript
import yourDomainRoutes from './modules/YOUR_DOMAIN/YOUR_DOMAIN.routes.js'

// In the app factory
app.use('/api/v1/your-domain', yourDomainRoutes)
```

### Step 8: Add Environment Variables (if needed)

If your module needs specific config:

```bash
# In .env
SNS_TOPIC_ARN_YOUR_DOMAIN=arn:aws:sns:...
YOUR_DOMAIN_SPECIFIC_CONFIG=value
```

Update `src/config/env.ts` to validate these.

### Step 9: Write Tests

Copy test patterns from `tests/integration/` and update for your domain.

## Key Patterns to Follow

### Dual Database Strategy

- **DynamoDB (Primary)**: Fast writes, optimistic locking, audit trails
- **PostgreSQL (Read Replica)**: Complex queries, pagination, full-text search

Always write to DynamoDB first, then sync to PostgreSQL.

### Optimistic Locking

Always pass the `version` when updating:

```typescript
const updated = await updateItem<YourEntity>({
  tableName: TABLE_NAME,
  id,
  version: existing.version, // Prevents race conditions
  updates: { ...yourUpdates }
})
```

### Audit Trails

Track all changes with who/when/what:

```typescript
const auditEntry: AuditEntry = {
  modifiedBy: user?.sub ?? 'system',
  modifiedAt: new Date().toISOString(),
  changes: { fieldName: { before: oldValue, after: newValue } }
}
```

### Event Publishing

Publish domain events for async integration:

```typescript
await publishEvent(YourEventType.CREATED, {
  entityId: entity.id,
  // ... relevant data
})
```

### Permission Naming Convention

Use this pattern for permissions:
- `read:your-domain` - List and get operations
- `write:your-domain` - Create and update operations
- `delete:your-domain` - Delete operations

## Common Customizations

### Different Database Strategy

If you only need one database, remove the sync code:

```typescript
// Keep only DynamoDB OR only PostgreSQL
// Remove the sync logic in create/update/delete
```

### No Audit Trail

Remove `auditTrail` field and related logic if not needed.

### Custom Query Patterns

Extend `listYourDomain` with domain-specific filters:

```typescript
const where = {
  active,
  status: query.status, // Custom filter
  amount: { gte: query.minAmount }, // Custom range
}
```

### Relationships

Add relations in Prisma and handle cascades:

```prisma
model Parent {
  id       String  @id
  children Child[]
}

model Child {
  id       String @id
  parentId String
  parent   Parent @relation(fields: [parentId], references: [id])
}
```

## Best Practices

1. **Keep Service Layer Pure**: No HTTP concerns in services
2. **Validate Early**: Use Zod schemas at route level
3. **Log Meaningful Events**: Use structured logging
4. **Handle Errors Gracefully**: Use ApiError types
5. **Test Thoroughly**: Cover happy path and error cases
6. **Document Permissions**: List required permissions in API docs

## Questions?

Refer to:
- `docs/creating-new-module.md` - Step-by-step guide
- `docs/architecture.md` - Design decisions
- Main `README.md` - Project overview
