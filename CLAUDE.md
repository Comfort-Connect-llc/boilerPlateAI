CLAUDE.md
md

architecture.md
md

attached are architecture.md file for a boilerplate API that our org is developing and a Claude.md file that specifies claude code related rules to be followed for a similar boilerplate for frontend. Look at the Claude.md content shared as a reference and give refined well organized content that I can use for my Claude.md for boiler plate API using the architecture content provided

12:59 PM
I'll examine both files to create a refined Claude.md for your API boilerplate.

Viewed 2 files
Now I'll create a refined Claude.md for your API boilerplate:

Created a file, read a file
I've created a refined Claude.md for your API boilerplate. The document:

Structure:

Mirrors the frontend reference format for consistency
Includes the same session protocol and critical rules sections
Adapted all patterns to API/backend development
Key Customizations:

Layered architecture guidance (Routes → Controllers → Services → Data)
Dual database strategy (DynamoDB + PostgreSQL) as architectural decision
Request context pattern instead of frontend state management
Auth0 integration with permission patterns
Event-driven architecture with SNS
Comprehensive code patterns for routes, controllers, services, schemas
AWS-specific considerations (CloudWatch, SSM, S3)
Backend testing patterns (unit + integration)
Maintained from Reference:

Same tone and organization style
Critical rules structure (15 numbered sections)
Conventional commits, git safety, file size guidelines
Anti-patterns table format
Session protocol at the top
The document is production-ready and maintains consistency with your frontend boilerplate while being specifically tailored for API development.

Claude
Document · MD

Want to be notified when Claude responds?

Claude is AI and can make mistakes. Please double-check responses.
Claude · MD
Copy

# CLAUDE.md - API Boilerplate

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

> **Session Protocol**:
>
> 1. **START**: Read `.ai/progress.md` for current milestone status
> 2. **CHECK**: Read `.ai/decisions.md` before proposing architectural changes
> 3. **WORK**: Follow patterns in this file
> 4. **END**: Update `.ai/progress.md` before finishing

---

## Overview

This is a **production-ready Node.js/TypeScript API boilerplate** for building domain-specific microservices with:

- **Node.js 20+** with TypeScript (strict mode)
- **Express.js** (HTTP layer)
- **DynamoDB** (primary write store) + **PostgreSQL** (read replica)
- **Auth0** (authentication & authorization)
- **Prisma ORM** (PostgreSQL)
- **AWS Services** (S3, SNS, SSM, CloudWatch)
- **Zod** (runtime validation)
- **Winston** (structured logging)
- **Vitest** (testing)

### Architecture

**Layered design with clear separation:**

- Routes → Controllers → Services → Data Layer
- Dual database strategy (DynamoDB + PostgreSQL)
- Event-driven with SNS
- Request context pattern (AsyncLocalStorage)

---

## Critical Rules for AI Agents

### 1. NO ASSUMPTIONS - ASK QUESTIONS

**NEVER assume or hallucinate information.** If you are uncertain about:

- API response formats or database schemas
- Business logic or domain rules
- Auth0 configuration or permission names
- AWS resource ARNs or configurations
- Database table names or field mappings
- Event names or payload structures
- Existing utilities or helper functions

**STOP and ASK the user for clarification.** It is always better to ask than to make an incorrect assumption that wastes time or introduces bugs.

### 2. DO NOT READ OR LOG SENSITIVE DATA

- **NEVER** read, display, or log `.env` files or environment variable values
- **NEVER** include actual secrets, API keys, AWS credentials, or Auth0 secrets in code or output
- **NEVER** log sensitive user data (PII, passwords, tokens)
- When referencing env vars, use placeholder examples only (e.g., `your-secret-here`)
- If you need to verify configuration, ask the user to confirm it's set correctly

### 3. CONFIRM BEFORE BREAKING CHANGES

**Always get explicit user confirmation before:**

- Deleting files or directories
- Renaming or moving files (especially in `src/modules/`)
- Modifying database schemas (DynamoDB tables or Prisma schema)
- Changing API contracts (request/response formats)
- Updating critical dependencies (Express, Prisma, AWS SDK)
- Modifying middleware order or error handling
- Changing authentication/authorization logic
- Any destructive git operations

### 4. CHECK BEFORE CREATING ANYTHING

**Before creating ANYTHING new, search the codebase first:**

| Creating               | Check These Locations First                                        |
| ---------------------- | ------------------------------------------------------------------ |
| Utility function       | `src/lib/`, `src/modules/{domain}/{domain}.service.ts`             |
| Database function      | `src/db/dynamodb.ts`, `src/db/prisma.ts`                           |
| Middleware             | `src/middleware/`                                                  |
| Error type             | `src/lib/errors.ts`                                                |
| Validation schema      | `src/modules/{domain}/{domain}.schema.ts`, `src/lib/validation.ts` |
| Type/Interface         | `src/types/`, `src/modules/{domain}/{domain}.types.ts`             |
| Event definition       | `src/lib/events.ts`                                                |
| Test helper            | `tests/setup.ts`, `tests/helpers.ts`                               |
| Architectural decision | `.ai/decisions.md`                                                 |

**The rule:** If similar code exists, extend or reuse it. **DO NOT create duplicate functionality.**

**Search process:**

1. Search the codebase for similar implementations
2. Check the locations in the table above
3. Look for patterns in existing modules (especially `_example-entity`)
4. **Ask the user** if unsure whether something exists

### 5. MODULE STRUCTURE

**Understand the module organization:**

Each domain module follows this structure:

```
src/modules/{domain}/
├── {domain}.routes.ts      # Route definitions
├── {domain}.controller.ts  # HTTP request/response handling
├── {domain}.service.ts     # Business logic
├── {domain}.schema.ts      # Zod validation schemas
├── {domain}.types.ts       # TypeScript types
└── README.md               # Module documentation
```

**Always maintain this structure** when creating new modules or modifying existing ones.

### 6. NO UNNECESSARY FILES OR DOCUMENTATION

- **DO NOT** create README files for every directory
- **DO NOT** create documentation files (\*.md) unless explicitly requested
- **DO NOT** create example files or boilerplate unless needed
- **DO NOT** add CHANGELOG, CONTRIBUTING, or similar files unless asked
- Keep the codebase lean - only add what's necessary
- Module READMEs are acceptable for documenting domain-specific logic

### 7. MINIMAL COMMENTS ONLY

- **DO NOT** add excessive comments or JSDoc for obvious code
- Add comments ONLY when:
  - Logic is complex and non-obvious (e.g., business rules, algorithms)
  - There's a workaround or hack that needs explanation
  - Database schema decisions require context
  - AWS service limitations need documentation
- Keep comments short and actionable
- Remove TODO comments after completing the task

### 8. CODE QUALITY & CLEANUP

**After making any code changes, always run:**

```bash
npm run lint        # Check for ESLint issues
npm run format      # Format with Prettier
npm run typecheck   # Verify TypeScript
```

**Clean up:**

- Remove unused imports, variables, and functions
- Delete commented-out code (use git history instead)
- Remove console.log statements used for debugging
- Don't leave dead code paths or experimental code
- Ensure no `any` types remain (use `unknown` or proper types)

### 9. DUAL DATABASE STRATEGY (FINAL DECISION)

| Component           | Technology     | Purpose                                       |
| ------------------- | -------------- | --------------------------------------------- |
| Primary Write Store | **DynamoDB**   | Fast writes, optimistic locking, audit trails |
| Read Replica        | **PostgreSQL** | Complex queries, full-text search, reporting  |
| ORM                 | **Prisma**     | PostgreSQL operations only                    |

**Write flow:**

1. Write to DynamoDB first (source of truth)
2. Immediately sync to PostgreSQL
3. If sync fails, log error and retry (eventual consistency)

**Read flow:**

- Simple ID lookups → DynamoDB
- Complex queries/filters → PostgreSQL

**This is a final architectural decision. Do not suggest alternatives.**

### 10. GIT SAFETY GUARDRAILS

**Safe by default:**

- Always run `git status` / `git diff` / `git log` before any git operations
- Push only when user explicitly asks
- Branch changes require user consent
- No amend unless explicitly asked

**Forbidden without explicit consent:**

- `git reset --hard`
- `git clean -fd`
- `git checkout .` or `git restore .`
- `git push --force`

**Best practices:**

- Don't delete/rename unexpected files; stop and ask first
- No repo-wide search/replace scripts; keep edits small and reviewable
- For big diffs: `git --no-pager diff --color=never`
- Ship small, focused commits
- Use `git mv` instead of `mv` for tracked files

### 11. FILE SIZE & CODE ORGANIZATION

- **Keep files under ~300 lines of code**
- If a file exceeds 300 LOC, split by concern:
  - Controllers: keep related endpoints together, split by sub-resource
  - Services: split by business capability or entity lifecycle
  - Schemas: split by operation type (create, update, list)
- Prefer small, focused edits over large refactors

### 12. CONVENTIONAL COMMITS

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

| Prefix      | Use When                                 |
| ----------- | ---------------------------------------- |
| `feat:`     | New feature or endpoint                  |
| `fix:`      | Bug fix                                  |
| `refactor:` | Code change (no new feature, no bug fix) |
| `perf:`     | Performance improvement                  |
| `test:`     | Adding or fixing tests                   |
| `chore:`    | Maintenance (dependencies, config)       |
| `docs:`     | Documentation only                       |

**Examples:**

- `feat: add invoice payment endpoint`
- `fix: correct tax calculation logic`
- `refactor: extract audit logging to helper`

### 13. DEPENDENCY MANAGEMENT

**Before adding a new dependency, verify:**

1. **Active maintenance** - Recent commits/releases (within 6 months)
2. **Community adoption** - npm weekly downloads, GitHub stars
3. **Security** - No critical vulnerabilities (`npm audit`)
4. **TypeScript support** - Has types or `@types/*` package
5. **AWS SDK compatibility** - Check version compatibility

**Prefer:**

- Official AWS SDKs for AWS services
- Well-documented packages
- Packages with minimal dependencies
- Packages used in Express/Node.js ecosystem

**Think twice before adding:**

- Large utility libraries (Lodash) - implement only what you need
- ORM alternatives - stick with Prisma for PostgreSQL
- Alternative validation libraries - stick with Zod

### 14. CI & VERIFICATION

- Verify your changes work end-to-end; if blocked, state what's missing
- When adding features, add tests (unit + integration)
- When fixing bugs, add regression tests
- CI must be green before considering work complete
- If CI fails, fix it—don't skip or ignore

### 15. ARCHITECTURAL DECISIONS LOG

**Location:** `.ai/decisions.md`

**When to READ decisions.md:**

- Before proposing a technology change or new library
- Before suggesting a different approach to an existing pattern
- When asking "why is it done this way?"
- Before starting work on architectural changes

**When to ADD to decisions.md:**

- After any architectural decision is made (new library, pattern, AWS service)
- After choosing between multiple valid approaches
- After significant database schema decisions
- After the user confirms a technology choice

**Rules:**

- **Append-only** - Never edit or delete past decisions
- Include: Context, Options considered, Decision, Rationale
- Date format: `[YYYY-MM-DD]`

**Example entry:**

```markdown
### [2026-02-03] Choice of Event Bus

**Context**: Need to publish domain events for async workflows

**Options**:

1. AWS EventBridge - Native AWS, flexible routing
2. AWS SNS - Simple pub/sub, lower latency
3. SQS only - Simpler, but no fan-out

**Decision**: AWS SNS

**Rationale**:

- Lower latency than EventBridge for simple pub/sub
- Native fan-out to multiple consumers
- Simpler than EventBridge for our use case
- Mature SDK support
```

---

## Code Patterns & Best Practices

### Layered Architecture

**Follow this layer separation strictly:**

```
Routes → Controllers → Services → Data Layer
```

**Routes Layer** (`{domain}.routes.ts`):

- Define endpoints with path and HTTP method
- Apply middleware (auth, validation)
- Keep logic minimal (routing only)

**Controllers Layer** (`{domain}.controller.ts`):

- Extract data from HTTP request (body, params, query)
- Call service layer functions
- Format HTTP responses
- Handle HTTP-specific concerns (status codes)

**Services Layer** (`{domain}.service.ts`):

- Implement all business logic
- Coordinate database operations
- Publish domain events
- Remain HTTP-agnostic (reusable from CLI, queues, etc.)

**Data Layer** (`db/dynamodb.ts`, `db/prisma.ts`):

- Database-specific operations only
- No business logic

### Creating a New Module

**Step 1:** Create module directory structure:

```bash
mkdir -p src/modules/{domain}
touch src/modules/{domain}/{domain}.routes.ts
touch src/modules/{domain}/{domain}.controller.ts
touch src/modules/{domain}/{domain}.service.ts
touch src/modules/{domain}/{domain}.schema.ts
touch src/modules/{domain}/{domain}.types.ts
```

**Step 2:** Use the example module as a template:

```bash
cp -r src/modules/_example-entity src/modules/{domain}
# Then customize each file
```

**Step 3:** Register routes in `src/index.ts`:

```typescript
import { router as domainRouter } from './modules/{domain}/{domain}.routes.js'
app.use('/api/v1/{domain}', domainRouter)
```

### Routes Pattern

```typescript
// src/modules/invoices/invoices.routes.ts
import { Router } from 'express'
import { requirePermissions } from '../../middleware/auth.js'
import { validate } from '../../lib/validation.js'
import * as controller from './invoices.controller.js'
import * as schema from './invoices.schema.js'

const router = Router()

// List invoices (requires read permission)
router.get(
  '/',
  requirePermissions('read:invoices'),
  validate({ query: schema.listInvoicesSchema }),
  controller.listInvoices
)

// Create invoice (requires write permission)
router.post(
  '/',
  requirePermissions('write:invoices'),
  validate({ body: schema.createInvoiceSchema }),
  controller.createInvoice
)

// Get invoice by ID
router.get(
  '/:id',
  requirePermissions('read:invoices'),
  validate({ params: schema.invoiceIdSchema }),
  controller.getInvoice
)

// Update invoice
router.patch(
  '/:id',
  requirePermissions('write:invoices'),
  validate({
    params: schema.invoiceIdSchema,
    body: schema.updateInvoiceSchema,
  }),
  controller.updateInvoice
)

// Delete invoice
router.delete(
  '/:id',
  requirePermissions('delete:invoices'),
  validate({ params: schema.invoiceIdSchema }),
  controller.deleteInvoice
)

export { router }
```

### Controller Pattern

```typescript
// src/modules/invoices/invoices.controller.ts
import { asyncHandler } from '../../lib/async-handler.js'
import * as invoiceService from './invoices.service.js'
import type { CreateInvoiceInput, UpdateInvoiceInput } from './invoices.types.js'
import httpStatus from 'http-status'

export const createInvoice = asyncHandler(async (req, res) => {
  const input: CreateInvoiceInput = req.body
  const invoice = await invoiceService.createInvoice(input)

  res.status(httpStatus.CREATED).json({
    message: 'Invoice created successfully',
    data: invoice,
  })
})

export const listInvoices = asyncHandler(async (req, res) => {
  const { page, pageSize, status } = req.query
  const result = await invoiceService.listInvoices({ page, pageSize, status })

  res.status(httpStatus.OK).json({
    message: 'Invoices retrieved successfully',
    data: result.items,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
    },
  })
})

export const getInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params
  const invoice = await invoiceService.getInvoiceById(id)

  res.status(httpStatus.OK).json({
    message: 'Invoice retrieved successfully',
    data: invoice,
  })
})

export const updateInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params
  const input: UpdateInvoiceInput = req.body
  const invoice = await invoiceService.updateInvoice(id, input)

  res.status(httpStatus.OK).json({
    message: 'Invoice updated successfully',
    data: invoice,
  })
})

export const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params
  await invoiceService.deleteInvoice(id)

  res.status(httpStatus.NO_CONTENT).send()
})
```

### Service Pattern

```typescript
// src/modules/invoices/invoices.service.ts
import { createItem, getItem, updateItem, deleteItem } from '../../db/dynamodb.js'
import { prisma } from '../../db/prisma.js'
import { publishEvent } from '../../lib/events.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { getUserId } from '../../lib/request-context.js'
import { info } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { Invoice, CreateInvoiceInput, UpdateInvoiceInput } from './invoices.types.js'

const TABLE_NAME = env.DYNAMODB_TABLE_NAME

export async function createInvoice(input: CreateInvoiceInput): Promise {
  const userId = getUserId()

  // Business validation
  if (input.amount <= 0) {
    throw badRequest('Amount must be positive')
  }

  // Create invoice object
  const invoice: Invoice = {
    id: crypto.randomUUID(),
    ...input,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: userId,
  }

  // Write to DynamoDB (primary)
  await createItem({
    tableName: TABLE_NAME,
    item: invoice,
  })

  // Sync to PostgreSQL (read replica)
  await prisma.invoice.create({
    data: invoice,
  })

  // Publish event
  await publishEvent(env.SNS_TOPIC_ARN, 'billing.invoice.created', {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
  })

  info('Invoice created', { event: 'InvoiceCreated', metadata: { invoiceId: invoice.id } })

  return invoice
}

export async function getInvoiceById(id: string): Promise {
  // Simple lookup from DynamoDB
  const invoice = await getItem({
    tableName: TABLE_NAME,
    key: { id },
  })

  if (!invoice) {
    throw notFound('Invoice not found')
  }

  return invoice
}

export async function listInvoices(params: {
  page?: number
  pageSize?: number
  status?: string
}): Promise<PaginatedResponse> {
  const { page = 1, pageSize = 10, status } = params

  // Complex query from PostgreSQL
  const where = status ? { status } : {}

  const [items, totalItems] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.count({ where }),
  ])

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  }
}

export async function updateInvoice(id: string, input: UpdateInvoiceInput): Promise {
  const userId = getUserId()

  // Get current invoice
  const current = await getInvoiceById(id)

  // Business validation
  if (current.status === 'paid' && input.amount) {
    throw badRequest('Cannot change amount of paid invoice')
  }

  // Update invoice
  const updated: Invoice = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  // Write to DynamoDB
  await updateItem({
    tableName: TABLE_NAME,
    key: { id },
    updates: updated,
  })

  // Sync to PostgreSQL
  await prisma.invoice.update({
    where: { id },
    data: updated,
  })

  info('Invoice updated', { event: 'InvoiceUpdated', metadata: { invoiceId: id } })

  return updated
}

export async function deleteInvoice(id: string): Promise {
  // Verify exists
  await getInvoiceById(id)

  // Delete from DynamoDB
  await deleteItem({
    tableName: TABLE_NAME,
    key: { id },
  })

  // Delete from PostgreSQL
  await prisma.invoice.delete({
    where: { id },
  })

  info('Invoice deleted', { event: 'InvoiceDeleted', metadata: { invoiceId: id } })
}
```

### Schema Pattern (Zod)

```typescript
// src/modules/invoices/invoices.schema.ts
import { z } from 'zod'
import { paginationSchema, uuidSchema } from '../../lib/validation.js'

export const invoiceIdSchema = z.object({
  id: uuidSchema,
})

export const createInvoiceSchema = z.object({
  customerId: uuidSchema,
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  dueDate: z.string().datetime(),
})

export const updateInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().min(1).max(500).optional(),
  status: z.enum(['pending', 'paid', 'overdue']).optional(),
})

export const listInvoicesSchema = paginationSchema.extend({
  status: z.enum(['pending', 'paid', 'overdue']).optional(),
})
```

### Types Pattern

```typescript
// src/modules/invoices/invoices.types.ts
export interface Invoice {
  id: string
  customerId: string
  amount: number
  description: string
  status: 'pending' | 'paid' | 'overdue'
  dueDate: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
}

export type CreateInvoiceInput = Omit<
  Invoice,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'createdBy'
>

export type UpdateInvoiceInput = Partial<Pick>
```

### Request Context Pattern

```typescript
// Access context anywhere without prop drilling
import { getUserId, getUser, getRequestId, getLogger } from '../../lib/request-context.js'

export async function createInvoice(input: CreateInvoiceInput) {
  const userId = getUserId() // Current user ID
  const user = getUser() // Full user object
  const requestId = getRequestId() // For tracing
  const logger = getLogger() // Request-scoped logger

  logger.info('Creating invoice', { customerId: input.customerId })

  // ... business logic
}
```

### Error Handling Pattern

```typescript
import { notFound, badRequest, forbidden, conflict } from '../../lib/errors.js'

// Throw operational errors
if (!invoice) {
  throw notFound('Invoice not found')
}

if (amount < 0) {
  throw badRequest('Amount must be positive')
}

if (!hasPermission('delete:invoices')) {
  throw forbidden('Insufficient permissions')
}

if (invoice.status === 'paid') {
  throw conflict('Invoice already paid')
}
```

### Event Publishing Pattern

```typescript
import { publishEvent } from '../../lib/events.js'
import { env } from '../../config/env.js'

// Define event names
export const InvoiceEvents = {
  CREATED: 'billing.invoice.created',
  PAID: 'billing.invoice.paid',
  OVERDUE: 'billing.invoice.overdue',
}

// Publish event
await publishEvent(env.SNS_TOPIC_ARN, InvoiceEvents.CREATED, {
  invoiceId: invoice.id,
  customerId: invoice.customerId,
  amount: invoice.amount,
})
```

### Logging Pattern

```typescript
import { info, warn, error, debug } from '../../lib/logger.js'

// Structured logging with event names
info('Invoice created', {
  event: 'InvoiceCreated',
  metadata: { invoiceId: invoice.id, customerId: invoice.customerId },
})

warn('Invoice overdue', {
  event: 'InvoiceOverdue',
  metadata: { invoiceId: invoice.id, daysOverdue: 30 },
})

error('Payment failed', {
  event: 'PaymentFailed',
  metadata: { invoiceId: invoice.id, error: err.message },
})

debug('Cache hit', {
  event: 'CacheHit',
  metadata: { key: 'invoice:123' },
})
```

### Testing Pattern

```typescript
// tests/modules/invoices/invoices.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../../src/index.js'
import { createMockAuthUser } from '../../helpers.js'

describe('Invoice API', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
  })

  describe('POST /api/v1/invoices', () => {
    it('should create invoice with valid data', async () => {
      const mockUser = createMockAuthUser({ permissions: ['write:invoices'] })

      const response = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${mockUser.token}`)
        .send({
          customerId: '123e4567-e89b-12d3-a456-426614174000',
          amount: 100.0,
          description: 'Test invoice',
          dueDate: '2026-03-01T00:00:00Z',
        })

      expect(response.status).toBe(201)
      expect(response.body.data).toHaveProperty('id')
      expect(response.body.data.amount).toBe(100.0)
    })

    it('should reject negative amount', async () => {
      const mockUser = createMockAuthUser({ permissions: ['write:invoices'] })

      const response = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${mockUser.token}`)
        .send({
          customerId: '123e4567-e89b-12d3-a456-426614174000',
          amount: -10,
          description: 'Test invoice',
          dueDate: '2026-03-01T00:00:00Z',
        })

      expect(response.status).toBe(400)
    })
  })
})
```

---

## Environment Variables

**Location:** `.env.example` (copy to `.env` for local development)

### Core Configuration

```env
# Server
NODE_ENV=development
PORT=5000
SERVICE_NAME=billing-api

# AWS
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=your-table-name
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:your-topic

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=your-api-audience

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Logging
LOG_LEVEL=info
```

**Never commit `.env` files. Always use placeholder values in documentation.**

---

## Common Tasks

### Adding a New Endpoint

1. Define route in `{domain}.routes.ts`
2. Add validation schema in `{domain}.schema.ts`
3. Create controller function in `{domain}.controller.ts`
4. Implement business logic in `{domain}.service.ts`
5. Add integration test

### Adding Database Operations

**DynamoDB:**

- Use functions from `src/db/dynamodb.ts`
- Always write to DynamoDB first

**PostgreSQL:**

- Use Prisma client from `src/db/prisma.ts`
- Update schema in `prisma/schema.prisma`
- Run migrations: `npx prisma migrate dev`

### Adding New Event Types

1. Define event name in `src/lib/events.ts`
2. Use pattern: `{domain}.{entity}.{action}`
3. Publish from service layer
4. Document event payload structure

### Adding Authentication

**Protect all routes except:**

- Health check (`/health`)
- Metrics (`/metrics`)

**Use middleware:**

```typescript
requirePermissions('write:resource')
requireAnyPermission('admin:system', 'admin:domain')
```

---

## Anti-Patterns to Avoid

| Don't                                     | Do Instead                                            |
| ----------------------------------------- | ----------------------------------------------------- |
| Use `any` type                            | Use `unknown` and type guards, or define proper types |
| Put business logic in controllers         | Keep controllers thin, logic in services              |
| Access database directly from controllers | Always go through service layer                       |
| Skip validation middleware                | Always validate inputs with Zod schemas               |
| Write to PostgreSQL only                  | Write to DynamoDB first, then sync to PostgreSQL      |
| Hardcode AWS ARNs or config               | Use environment variables                             |
| Log sensitive data                        | Redact PII, use Winston's built-in redaction          |
| Skip error handling                       | Wrap async operations, throw ApiError types           |
| Use console.log                           | Use Winston logger (info, warn, error)                |

---

## References

- [Express.js Documentation](https://expressjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Zod Documentation](https://zod.dev/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Auth0 Node.js SDK](https://auth0.com/docs/quickstart/backend/nodejs)
- [Winston Logger](https://github.com/winstonjs/winston)
- [Vitest Documentation](https://vitest.dev/)
