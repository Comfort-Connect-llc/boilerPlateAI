# Node.js API Boilerplate

A production-ready, **domain-agnostic** Node.js TypeScript API boilerplate designed for building single-domain microservices (e.g., billing API, user API, inventory API).

**This is a template, not a specific application.** When creating a new API, you'll add your domain-specific business logic while leveraging all the pre-built infrastructure.

## What's Included

### Infrastructure (Ready to Use)
- ✅ **Auth0 Integration** - JWT authentication with RBAC permissions
- ✅ **Dual Database Strategy** - DynamoDB (fast writes) + PostgreSQL (complex queries)
- ✅ **Request Context** - AsyncLocalStorage for request-scoped data (no prop drilling)
- ✅ **Error Handling** - Consistent error responses with proper status codes
- ✅ **Validation** - Zod schemas with runtime type checking
- ✅ **Logging** - Winston with structured JSON, CloudWatch transport, and sensitive data redaction; `LOG_LEVEL` (fatal, error, warn, info, debug) controls what is sent to console and CloudWatch
- ✅ **AWS Services** - S3 (file storage), SNS (events), SSM (config). Bootstrap loads from `/shared/common/` and `/api/{serviceName}/`; `config.get()` supports `SSM_FETCH_TYPE` **static** (cached only) or **dynamic** (fetch from SSM via stored paths)
- ✅ **Health Checks** - Liveness and readiness probes
- ✅ **Security** - Helmet, CORS, input validation, rate limiting ready
- ✅ **Audit Logging** - Optional, per-domain audit trail with sync/async modes (see [Architecture](./docs/architecture.md#audit-logging))
- ✅ **Testing** - Vitest with mock helpers and examples
- ✅ **TypeScript** - Strict mode with full type safety

### What You Need to Add
- 🔧 **Your Domain Logic** - Business rules specific to your service
- 🔧 **Your Data Models** - Prisma schema and Zod validation schemas
- 🔧 **Your Routes** - API endpoints for your domain
- 🔧 **Your Tests** - Domain-specific test cases

## Quick Start

### 1. Clone the Boilerplate

```bash
git clone <your-repo-url> my-api
cd my-api
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your values (Auth0, AWS, Database)
```

**Always set the service name for startup:** Edit `src/config/constants.ts` and set `DEFAULT_SERVICE_NAME` to your API name (e.g. `'billing'`, `'users'`). This is used for logging, SSM paths, and CloudWatch when env is not yet initialized.

### 3. Create Your First Module

See [Creating a New Module](./docs/creating-new-module.md) for detailed instructions.

**Quick version:**

```bash
# Copy the example entity template
cd src/modules
cp -r _example-entity billing  # Replace 'billing' with your domain

# Update the files with your domain logic
# See docs/creating-new-module.md for step-by-step guide
```

### 4. Define Your Database Schema

Edit `prisma/schema.prisma`:

```prisma
model Invoice {
  id         String   @id @default(uuid()) @db.Uuid
  amount     Decimal  @db.Decimal(10, 2)
  status     String
  version    Int      @default(1)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("invoices")
}
```

```bash
npx prisma migrate dev --name init
```

### 5. Run the API

```bash
npm run dev
```

Your API is now running at `http://localhost:3000`!

## Project Structure

```
├── docs/                           # Documentation
│   ├── creating-new-module.md      # Step-by-step module guide
│   └── architecture.md             # Design decisions
├── src/
│   ├── config/                     # ✅ Ready to use
│   │   ├── env.ts                  # Bootstrap, getEnv, config.get, SSM_FETCH_TYPE
│   │   ├── aws.ts                  # AWS client config
│   │   └── ssmLoader.ts            # loadFromSSM, getSSMParam, paramPaths
│   ├── db/                         # ✅ Ready to use
│   │   ├── prisma.ts               # PostgreSQL client
│   │   └── dynamodb.ts             # DynamoDB utilities
│   ├── audit/                      # ✅ Audit logging (optional)
│   ├── lib/                        # ✅ Ready to use
│   │   ├── base-service.ts         # Service interfaces & helpers
│   │   ├── pagination.ts           # Pagination utilities
│   │   ├── query-builder.ts        # Query building helpers
│   │   ├── logger/                 # Structured logging
│   │   ├── errors.ts               # Error handling
│   │   ├── request-context.ts      # Request-scoped context
│   │   ├── validation.ts           # Validation middleware
│   │   ├── s3.ts                   # S3 operations
│   │   ├── sns.ts                  # Event publishing
│   │   └── http-client.ts          # Internal service calls
│   ├── middleware/                 # ✅ Ready to use
│   │   ├── auth.ts                 # Auth0 JWT + RBAC
│   │   └── error-handler.ts        # Global error handler
│   ├── modules/                    # 🔧 Add your modules here
│   │   ├── _example-entity/        # 📚 Template/reference
│   │   └── health/                 # ✅ Health checks
│   ├── app.ts                      # ✅ Express app (ready)
│   └── index.ts                    # ✅ Entry point (ready)
├── prisma/
│   └── schema.prisma               # 🔧 Define your models here
├── tests/
│   ├── setup.ts                    # ✅ Test helpers
│   ├── unit/                       # Unit tests
│   └── integration/                # API tests
└── scripts/                        # Utility scripts
```

**Legend:**
- ✅ = Ready to use as-is
- 🔧 = Customize for your domain
- 📚 = Reference/template

## Core Concepts

### Config & SSM

At startup, `bootstrap()` loads config from SSM (`/shared/common/`, `/api/{serviceName}/`), merges with `process.env`, validates with Zod, and caches it. SSM param names and their full paths are stored for use by `config.get()`.

- **`getEnv()`** – Synchronous access to the bootstrapped, frozen config.
- **`config.get(paramName)`** – Async getter. Behavior depends on `SSM_FETCH_TYPE`:
  - **`static`**: Returns only from cached config; no SSM calls.
  - **`dynamic`** (default): Fetches from SSM via `getSSMParam` using the path stored at bootstrap (only for params loaded from SSM). Values are always read fresh from SSM.

Use `loadEnv()` in tests to bypass SSM. See [SSM Setup](./docs/ssm-setup.md) for path layout and IAM.

### Dual Database Strategy

**Why two databases?**

- **DynamoDB** = Primary write store (fast, optimistic locking, audit trails)
- **PostgreSQL** = Read replica (complex queries, pagination, search)

Every entity is:
1. Written to DynamoDB first (source of truth)
2. Synced to PostgreSQL immediately (for querying)

**When to simplify:** Use only PostgreSQL if you don't need extreme write performance.

### Request Context (No Prop Drilling)

Access request-scoped data anywhere without passing parameters:

```typescript
import { getUser, getRequestId, getUserPermissions } from './lib/request-context.js'

// Available anywhere in the request lifecycle
const user = getUser()              // Current user from JWT
const requestId = getRequestId()    // For distributed tracing
const permissions = getUserPermissions()
```

### Event-Driven Integration

Publish domain events to SNS for async workflows:

```typescript
await publishEvent(
  env.SNS_TOPIC_ARN_BILLING,
  'billing.invoice.created',
  { invoiceId: invoice.id }
)
```

Other services can subscribe to your events without tight coupling.

## Documentation

- 📘 **[Creating a New Module](./docs/creating-new-module.md)** - Step-by-step guide
- 🏗️ **[Architecture](./docs/architecture.md)** - Design decisions and patterns (includes logging with Winston/CloudWatch)
- 🔐 **[SSM Setup](./docs/ssm-setup.md)** - SSM paths (`/shared/common/`, `/api/{serviceName}/`), `SSM_FETCH_TYPE`, `config.get` (static vs dynamic)
- 📚 **[Example Module](./src/modules/_example-entity/README.md)** - Reference implementation

## Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Run production build
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run test         # Run all tests with Vitest
npm run test:watch   # Run tests in watch mode

# Database
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio (database GUI)
npm run db:seed      # Seed database (if you create a seed file)
```

## Health Checks

The boilerplate includes production-ready health check endpoints:

- `GET /health` - Full health check (PostgreSQL + DynamoDB connectivity)
- `GET /health/live` - Liveness probe (app is running)
- `GET /health/ready` - Readiness probe (app can accept traffic)

## Common Use Cases

### Example 1: Building a Billing API

```bash
# 1. Copy template
cp -r src/modules/_example-entity src/modules/invoices

# 2. Define Prisma model
# Add to prisma/schema.prisma:
# model Invoice { ... }

# 3. Update schemas, service, controller, routes
# Replace 'entity' with 'invoice' throughout

# 4. Register routes in src/app.ts
# app.use('/api/v1/invoices', invoiceRoutes)

# 5. Add permissions to Auth0
# - read:invoices
# - write:invoices
# - delete:invoices
```

### Example 2: Building a User Management API

```bash
# Same process, but for users
cp -r src/modules/_example-entity src/modules/users

# Add business logic like:
# - Email verification
# - Password hashing
# - Profile management
# - Role assignment
```

## Key Features Explained

### ✅ Optimistic Locking

Prevents race conditions with version-based concurrency control:

```typescript
// Automatically fails if version changed between read and write
await updateItem({
  id: 'abc-123',
  version: 5,  // Must match current version
  updates: { status: 'completed' }
})
```

### ✅ Audit Logging (Optional)

Track every create, update, and delete with who/when/what changed. Audit data lives in separate per-domain Postgres tables, keeping your business entities clean:

```typescript
import { getAuditService } from '../../audit/index.js'

getAuditService()?.audit({
  domain: 'invoices',
  entityId: invoice.id,
  operation: 'UPDATE',
  performedBy: user?.id ?? 'system',
  snapshotBefore: existing,
  snapshotAfter: updated,
})
```

Enable with `AUDIT_ENABLED=true`. Supports sync (direct write) and async (SQS → worker) modes. See [Architecture - Audit Logging](./docs/architecture.md#audit-logging) for details.

### ✅ Permission-Based Authorization

Fine-grained access control on every endpoint:

```typescript
router.delete(
  '/:id',
  requirePermissions('delete:invoices'),  // Only users with this permission
  controller.deleteInvoice
)
```

### ✅ Type-Safe Validation

Runtime validation with automatic TypeScript types:

```typescript
const schema = z.object({
  amount: z.number().positive(),
  email: z.string().email(),
})

type Input = z.infer<typeof schema>  // TypeScript type auto-generated
```

## Production Checklist

Before deploying to production:

- [ ] Configure Auth0 with production tenant
- [ ] Set up AWS resources (DynamoDB tables, S3 buckets, SNS topics)
- [ ] Configure environment variables in SSM Parameter Store (paths: `/shared/common/`, `/api/{serviceName}/`). Set `SSM_FETCH_TYPE` to `static` or `dynamic`; dynamic fetches via stored param paths on `config.get()`
- [ ] Set up PostgreSQL database (RDS recommended)
- [ ] Run database migrations
- [ ] Configure logging: CloudWatch log group `/comfort-connect/{NODE_ENV}/{SERVICE_NAME}`; set `LOG_LEVEL` (e.g. `info`, `debug`) in SSM or env
- [ ] Set up monitoring and alerts
- [ ] Configure CORS for your frontend domain
- [ ] Review and adjust rate limits
- [ ] Enable HTTPS (use ALB or CloudFront)
- [ ] Set up CI/CD pipeline
- [ ] Add automated tests to CI
- [ ] Configure backup and disaster recovery

## Support & Contributing

- **Issues**: Report bugs or request features via GitHub Issues
- **Docs**: See the `/docs` folder for detailed guides
- **Example**: Check `src/modules/_example-entity` for reference

## License

MIT
