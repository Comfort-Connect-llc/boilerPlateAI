# AGENTS.md - API Boilerplate

> Universal AI agent instructions. Works with Windsurf, Cursor, Codex, Gemini CLI, and other AI tools.
> For detailed instructions, see `CLAUDE.md`.

---

## Session Protocol

1. **START**: Read `.ai/progress.md` for current milestone status
2. **CHECK**: Read `.ai/decisions.md` before proposing architectural changes
3. **WORK**: Follow patterns in this file and `CLAUDE.md`
4. **END**: Update `.ai/progress.md` before finishing

---

## Quick Reference

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run dev`        | Start dev server           |
| `npm run lint`       | Check code quality         |
| `npm run format`     | Format code with Prettier  |
| `npm run typecheck`  | TypeScript type checking   |
| `npm test`           | Run unit tests             |
| `npm run test:watch` | Run tests in watch mode    |

---

## Critical Rules

1. **ASK, don't assume** - If uncertain about business logic, schemas, or AWS config, ask
2. **NO secrets** - Never read/log `.env` files or sensitive data
3. **Check before creating** - Search codebase before adding new modules/functions
4. **DynamoDB + PostgreSQL is FINAL** - Do not suggest alternative databases
5. **Write to DynamoDB first** - Then sync to PostgreSQL (dual database strategy)

---

## Before Creating Anything

Search first. Check these locations:

| Creating       | Check First                                              |
| -------------- | -------------------------------------------------------- |
| Utility        | `src/lib/`, `src/modules/{domain}/{domain}.service.ts`   |
| Middleware     | `src/middleware/`                                        |
| Error type     | `src/lib/errors.ts`                                      |
| Schema         | `src/modules/{domain}/{domain}.schema.ts`, `src/lib/`    |
| Type           | `src/types/`, `src/modules/{domain}/{domain}.types.ts`   |
| DB operation   | `src/db/dynamodb.ts`, `src/db/prisma.ts`                 |
| Event          | `src/lib/events.ts`                                      |
| Test helper    | `tests/setup.ts`, `tests/helpers.ts`                     |
| Architecture   | `.ai/decisions.md`                                       |

Don't duplicate. Extend or reuse existing code.

---

## Module Structure

Every domain module follows this pattern:

```
src/modules/{domain}/
├── {domain}.routes.ts      # Route definitions
├── {domain}.controller.ts  # HTTP handlers
├── {domain}.service.ts     # Business logic
├── {domain}.schema.ts      # Zod validation
├── {domain}.types.ts       # TypeScript types
└── README.md               # Module docs (optional)
```

Use `_example-entity` as a template when creating new modules.

---

## Decisions Log

**Location:** `.ai/decisions.md`

- **Read** before proposing tech changes, new libraries, or architectural patterns
- **Append** after decisions (new AWS service, library, database schema choices)
- Never edit past decisions (append-only)

---

## Git Safety

- Safe by default: `git status`/`diff`/`log` before actions
- Push only when user asks
- No amend unless asked
- Destructive ops forbidden: `reset --hard`, `clean`, `push --force`
- Don't delete/rename unexpected files; stop + ask
- Keep edits small/reviewable; ship small commits
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `chore:`

---

## Code Standards

- Files < 300 LOC; split when larger
- Semantic versioning: `MAJOR.MINOR.PATCH`
- New deps: check maintenance, downloads, security, TypeScript support
- Bugs: add regression test
- CI must be green before handoff
- No `any` types - use `unknown` or proper types

---

## Security

**Never:**
- Log sensitive data (PII, tokens, passwords)
- Hardcode secrets or AWS credentials
- Use `eval()` or dynamic code execution
- Concatenate SQL queries (use Prisma)

**Always:**
- Validate all inputs with Zod
- Use Auth0 middleware on protected routes
- Redact sensitive fields in logs (Winston handles this)
- Run security audits before deploying

**Commands:**

```bash
npm audit              # Check vulnerable deps
npm run lint           # Includes security linting
```

---

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript (strict)
- **Framework**: Express.js
- **Primary DB**: DynamoDB (writes + audit)
- **Read Replica**: PostgreSQL (complex queries)
- **ORM**: Prisma (PostgreSQL only)
- **Auth**: Auth0 (JWT validation + RBAC)
- **Validation**: Zod (runtime schemas)
- **Logging**: Winston (structured + CloudWatch)
- **Events**: AWS SNS (pub/sub)
- **Testing**: Vitest + Supertest

---

## Layered Architecture

**Always follow this separation:**

```
Routes → Controllers → Services → Data Layer
```

- **Routes**: Define endpoints, apply middleware (auth, validation)
- **Controllers**: Extract HTTP data, call services, format responses
- **Services**: Business logic, database ops, event publishing (HTTP-agnostic)
- **Data Layer**: Database-specific operations only

---

## Key Patterns

### Request Context (No Prop Drilling)

```typescript
import { getUserId, getUser, getRequestId } from '../../lib/request-context.js';

export async function createInvoice(input: CreateInvoiceInput) {
  const userId = getUserId();        // From context
  const requestId = getRequestId();  // For tracing
  // No need to pass these as parameters
}
```

### Error Handling

```typescript
import { notFound, badRequest, forbidden } from '../../lib/errors.js';

if (!invoice) throw notFound('Invoice not found');
if (amount < 0) throw badRequest('Amount must be positive');
if (!hasPermission('delete:invoices')) throw forbidden('Insufficient permissions');
```

### Dual Database Pattern

```typescript
// 1. Write to DynamoDB (source of truth)
await createItem({ tableName, item: invoice });

// 2. Sync to PostgreSQL
await prisma.invoice.create({ data: invoice });

// 3. Publish event
await publishEvent(topic, 'invoice.created', { id: invoice.id });
```

### Validation

```typescript
import { validate } from '../../lib/validation.js';
import { createInvoiceSchema } from './invoices.schema.js';

router.post(
  '/',
  requirePermissions('write:invoices'),
  validate({ body: createInvoiceSchema }),
  controller.createInvoice
);
```

### Logging

```typescript
import { info, warn, error } from '../../lib/logger.js';

info('Invoice created', { event: 'InvoiceCreated', metadata: { invoiceId } });
warn('Rate limit approaching', { event: 'RateLimit', metadata: { remaining } });
error('Payment failed', { event: 'PaymentFailed', metadata: { err } });
```

---

## After Changes

```bash
npm run lint && npm run format && npm run typecheck
```

---

## Environment Variables

**Never commit `.env` files.**

Required vars:
- `NODE_ENV`, `PORT`, `SERVICE_NAME`
- `AWS_REGION`, `DYNAMODB_TABLE_NAME`, `SNS_TOPIC_ARN`
- `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`
- `DATABASE_URL` (PostgreSQL connection string)
- `LOG_LEVEL`

See `.env.example` for full list.

---

## Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

**Pattern:**
- Unit tests for services (business logic)
- Integration tests for API endpoints
- Always test error cases and validation

---

## Common Anti-Patterns

| Don't                          | Do Instead                                    |
| ------------------------------ | --------------------------------------------- |
| Put business logic in routes   | Keep routes thin, logic in services           |
| Write to PostgreSQL only       | Write to DynamoDB first, sync to PostgreSQL   |
| Use `any` type                 | Use `unknown` or define proper types          |
| Skip validation                | Always validate with Zod schemas              |
| Access DB from controllers     | Always go through service layer               |
| Use console.log                | Use Winston logger (info, warn, error)        |
| Hardcode AWS ARNs              | Use environment variables                     |
| Log sensitive data             | Use Winston's redaction (automatic)           |

---

## References

- `CLAUDE.md` - Full instructions and patterns
- `.ai/progress.md` - Current milestone progress
- `.ai/decisions.md` - Architectural decisions log
- `src/modules/_example-entity/` - Reference implementation
