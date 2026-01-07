# Complete Implementation Checklist

## Overview
This document lists ALL changes needed to transform boilerPlateAI into a production-ready, secure, maintainable boilerplate based on best practices and your requirements.

**Principles:**
- ✅ Simplicity over complexity
- ✅ Security first (SSM, not .env in S3)
- ✅ Auth0 native features (no custom RBAC)
- ✅ True placeholders (minimal business logic)
- ✅ Observability built-in
- ✅ Maintainability and scalability

**Estimated Total Time:** 8-10 hours

---

## Phase 1: Security & Configuration (Critical)

### 1.1 SSM Parameter Store Integration
**Priority:** P0 - Security Critical
**Time:** 2-3 hours

**New Files:**
- [ ] `src/config/ssmLoader.ts` - SSM parameter loading logic
  - Load from multiple paths with precedence
  - Decrypt SecureString parameters
  - Handle pagination
  - Error handling for missing paths

**Modified Files:**
- [ ] `src/config/env.ts`
  - Add `bootstrap()` async function
  - Load from SSM in non-local environments
  - Merge SSM + process.env (env vars override)
  - Make config immutable after bootstrap
  - Keep sync `loadEnv()` for local/test
  - Add `SERVICE_NAME` to schema
  - Add `AUTH0_ISSUER_BASE_URL` to schema

- [ ] `src/server.ts`
  - Call `await bootstrap()` before starting server
  - Handle bootstrap errors gracefully
  - Log configuration source (SSM vs .env)

- [ ] `tests/setup.ts`
  - Force `NODE_ENV=test`
  - Use sync `loadEnv()` for tests
  - Add test environment overrides

- [ ] `package.json`
  - Add `@aws-sdk/client-ssm` dependency

**Documentation:**
- [ ] Create `docs/ssm-setup.md` - Guide for setting up SSM parameters
- [ ] Update `README.md` - Add SSM configuration section
- [ ] Add `.env.example` - Show all required variables

**Verification:**
- [ ] Local dev works with .env file
- [ ] Tests work with loadEnv()
- [ ] SSM loading works in dev environment
- [ ] Proper error messages for missing parameters
- [ ] Configuration is immutable after bootstrap

---

### 1.2 M2M Token Management
**Priority:** P0 - Required for Microservices
**Time:** 2 hours

**New Files:**
- [ ] `src/auth/m2mClient.ts` - M2M token manager
  - Auto-refresh with 5-minute buffer
  - Token caching
  - Prevent concurrent refresh requests
  - Structured logging
  - Error handling

- [ ] `src/lib/internalApiClient.ts` - Internal API HTTP client
  - Auto-inject M2M token
  - Propagate request ID for tracing
  - Timeout handling
  - Convenience methods (get, post, put, patch, delete)
  - Structured error responses

**Modified Files:**
- [ ] `src/config/env.ts`
  - Add `AUTH0_M2M_CLIENT_ID` (optional)
  - Add `AUTH0_M2M_CLIENT_SECRET` (optional)

- [ ] `.env.example`
  - Add M2M credentials example

**Documentation:**
- [ ] Update `docs/authentication.md` - Add M2M section
- [ ] Add code examples for calling internal APIs

**Verification:**
- [ ] M2M token fetched successfully
- [ ] Token cached and reused
- [ ] Auto-refresh works before expiry
- [ ] Handles Auth0 errors gracefully
- [ ] Internal API client works with token
- [ ] Request ID propagated correctly

---

### 1.3 Simple Auth0 RBAC (Remove Custom Permissions)
**Priority:** P0 - Simplification Required
**Time:** 1.5 hours

**New Files:**
- [ ] `src/middleware/rbac.ts` - Simple role-based access control
  - `requireRole(role | roles[])` - OR logic
  - `requireAllRoles(roles[])` - AND logic
  - Get roles from Auth0 JWT claims
  - Clear error messages

**Modified Files:**
- [ ] `src/middleware/auth.ts`
  - Remove `requirePermissions()`
  - Remove `requireAnyPermission()`
  - Remove `requireClaim()`
  - Keep only JWT validation
  - Add `populateUserContext()` middleware
  - Extract roles/claims to user context

- [ ] `src/lib/request-context.ts` (see Phase 2.1)

**Removed Files:**
- [ ] None (just remove functions, keep file)

**Documentation:**
- [ ] Update `docs/authentication.md` - Replace permissions with roles
- [ ] Add Auth0 setup guide (how to add roles to JWT)
- [ ] Update example module routes to use `requireRole()`

**Verification:**
- [ ] Roles extracted from JWT correctly
- [ ] `requireRole('admin')` works
- [ ] `requireRole(['user', 'admin'])` works (OR)
- [ ] `requireAllRoles(['user', 'manager'])` works (AND)
- [ ] Unauthorized errors returned correctly
- [ ] Error messages show required vs actual roles

---

## Phase 2: Observability & Maintainability

### 2.1 Enhanced Request Context
**Priority:** P1 - High
**Time:** 1 hour

**Modified Files:**
- [ ] `src/lib/request-context.ts`
  - Expand context interface to include user
  - Add `setUser()` function
  - Add `getUser()` function
  - Add `setContextValue()` for custom data
  - Add `getContextValue()` for custom data

- [ ] `src/middleware/auth.ts`
  - Call `setUser()` after JWT validation
  - Populate user context with id, email, roles, companyId

**User Context Interface:**
```typescript
interface UserContext {
  id: string;           // Auth0 sub
  email?: string;
  roles?: string[];
  companyId?: string;
  // Add other claims as needed
}
```

**Documentation:**
- [ ] Update `docs/architecture.md` - Explain context pattern
- [ ] Add examples of using `getUser()` in services

**Verification:**
- [ ] User context set correctly in auth middleware
- [ ] `getUser()` returns correct data
- [ ] Context available in nested function calls
- [ ] Context cleared between requests
- [ ] Works with async operations

---

### 2.2 Request Metrics & Timing
**Priority:** P1 - High
**Time:** 1 hour

**New Files:**
- [ ] `src/middleware/metrics.ts` - Request timing and metrics
  - Measure request duration
  - Log on request completion
  - Include method, path, status, duration
  - Include request ID
  - Structured logging format

**Modified Files:**
- [ ] `src/app.ts`
  - Add metrics middleware to pipeline
  - Place after context middleware
  - Place before routes

**Documentation:**
- [ ] Update `docs/architecture.md` - Add metrics section

**Verification:**
- [ ] Request duration logged correctly
- [ ] All requests measured (success and error)
- [ ] Logs include request ID
- [ ] Performance data available for analysis
- [ ] No performance impact on requests

---

### 2.3 Enhanced Health Checks
**Priority:** P1 - High
**Time:** 30 minutes

**Modified Files:**
- [ ] `src/routes/health.routes.ts`
  - Add system metrics (memory usage, uptime)
  - Add dependency status (DB, external APIs)
  - Keep existing liveness/readiness endpoints
  - Add detailed health endpoint

**Health Check Response:**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  timestamp: string,
  uptime: number,
  memory: {
    used: number,
    total: number,
    percentage: number
  },
  dependencies: {
    postgresql: { status: 'up' | 'down', responseTime: number },
    dynamodb: { status: 'up' | 'down', responseTime: number }
  }
}
```

**Documentation:**
- [ ] Update `docs/health-checks.md` - Document all endpoints

**Verification:**
- [ ] `/health` returns detailed status
- [ ] `/health/live` returns 200 when app is running
- [ ] `/health/ready` checks DB connectivity
- [ ] Response times measured accurately
- [ ] Works when dependencies are down

---

## Phase 3: Code Quality & Placeholders

### 3.1 Convert Example Module to True Placeholder
**Priority:** P0 - Critical for Boilerplate
**Time:** 2 hours

**Renamed/Restructured:**
- [ ] Rename `src/modules/accounts/` → `src/modules/_example/`
  - `account.service.ts` → `example.service.ts`
  - `account.controller.ts` → `example.controller.ts`
  - `account.routes.ts` → `example.routes.ts`
  - `account.schemas.ts` → `example.schemas.ts`

**Modified Files:**
- [ ] `src/modules/_example/example.service.ts`
  - Remove ALL business logic
  - Keep method signatures as examples
  - Add TODO comments
  - Add inline pattern examples (commented)
  - Show: error handling, context usage, DB operations, events

- [ ] `src/modules/_example/example.controller.ts`
  - Minimal implementation
  - Show request/response pattern
  - Show error handling pattern
  - Return 501 Not Implemented

- [ ] `src/modules/_example/example.routes.ts`
  - Keep route definitions as examples
  - Show RBAC usage
  - Show validation usage
  - Add comments explaining patterns

- [ ] `src/modules/_example/example.schemas.ts`
  - Keep as minimal Zod schema examples
  - Show validation patterns
  - Add comments

- [ ] `src/app.ts`
  - Update import path
  - Add comment that example routes should be removed

**Documentation:**
- [ ] Update `docs/creating-new-module.md`
  - Show how to copy and modify _example
  - Explain placeholder patterns
  - Add step-by-step guide

**Verification:**
- [ ] Example module shows patterns clearly
- [ ] No actual business logic remains
- [ ] Easy to delete or copy
- [ ] Comments explain what to replace
- [ ] Routes return 501 (not implemented)

---

### 3.2 Improve Error Handling
**Priority:** P1 - Medium
**Time:** 30 minutes

**Modified Files:**
- [ ] `src/lib/errors.ts`
  - Ensure `isOperational` flag is used correctly
  - Verify factory functions (notFound, badRequest, etc.)
  - Add JSDoc comments

- [ ] `src/middleware/error-handler.ts`
  - Sanitize stack traces (limit depth to 10 lines)
  - Ensure requestId always included
  - Test with various error types

**Documentation:**
- [ ] Update `docs/error-handling.md` - Explain operational vs programmer errors

**Verification:**
- [ ] Stack traces limited in non-production
- [ ] Request ID in all error responses
- [ ] Operational errors logged as warnings
- [ ] Programmer errors logged as errors
- [ ] Clean error responses (no internal details in prod)

---

### 3.3 Code Documentation & Examples
**Priority:** P2 - Medium
**Time:** 1 hour

**New Files:**
- [ ] `docs/ssm-setup.md` - SSM parameter store setup guide
- [ ] `docs/m2m-authentication.md` - M2M token usage guide
- [ ] `docs/rbac-setup.md` - Auth0 role configuration guide

**Modified Files:**
- [ ] `README.md`
  - Add quick start guide
  - Add SSM configuration section
  - Add deployment section
  - Add environment variables table
  - Link to all documentation

- [ ] `docs/architecture.md`
  - Update with SSM pattern
  - Update with RBAC pattern
  - Add context management section
  - Add metrics section

- [ ] `docs/creating-new-module.md`
  - Update to show _example module
  - Add ElectroDB examples (even though not using)
  - Update for new RBAC pattern

- [ ] `.env.example`
  - Complete example with all variables
  - Add comments explaining each variable
  - Group by category

**Documentation Checklist:**
- [ ] Every feature has documentation
- [ ] Clear examples for common tasks
- [ ] Deployment guide included
- [ ] Troubleshooting section added
- [ ] API response examples shown

---

## Phase 4: Testing & Validation

### 4.1 Update Tests for New Features
**Priority:** P1 - High
**Time:** 2 hours

**Modified Files:**
- [ ] `tests/setup.ts`
  - Update for async bootstrap
  - Add SSM mocking
  - Add M2M client mocking

- [ ] `tests/helpers.ts`
  - Update mock user to include roles (not permissions)
  - Add mock M2M token
  - Add context helpers

**New Test Files:**
- [ ] `tests/unit/config/ssmLoader.test.ts`
  - Test SSM parameter loading
  - Test path precedence
  - Test error handling

- [ ] `tests/unit/auth/m2mClient.test.ts`
  - Test token fetching
  - Test caching
  - Test auto-refresh
  - Test error handling

- [ ] `tests/unit/middleware/rbac.test.ts`
  - Test role checking (single role)
  - Test role checking (multiple roles OR)
  - Test role checking (multiple roles AND)
  - Test unauthorized responses

- [ ] `tests/integration/health.test.ts`
  - Test all health endpoints
  - Test with DB up/down
  - Test metrics accuracy

**Modified Test Files:**
- [ ] Update all existing tests to use roles instead of permissions
- [ ] Update auth middleware tests
- [ ] Update example module tests (if kept)

**Verification:**
- [ ] All tests pass
- [ ] Coverage > 80%
- [ ] Integration tests work
- [ ] Mock setup documented

---

## Phase 5: Developer Experience

### 5.1 Development Scripts & Tools
**Priority:** P2 - Medium
**Time:** 30 minutes

**Modified Files:**
- [ ] `package.json`
  - Add `dev:local` script (uses .env)
  - Add `dev:ssm` script (tests SSM loading)
  - Add `test:watch` script
  - Add `test:coverage` script
  - Organize scripts by category

**New Files:**
- [ ] `scripts/setup-local.sh` - Local development setup
- [ ] `scripts/check-ssm-params.ts` - Verify SSM parameters exist

**Verification:**
- [ ] Scripts work on macOS and Linux
- [ ] Clear error messages
- [ ] Documentation for each script

---

### 5.2 Linting & Code Quality
**Priority:** P2 - Low
**Time:** 30 minutes

**Modified Files:**
- [ ] `.eslintrc.js`
  - Ensure rules align with patterns
  - No warnings for TODO comments
  - Consistent import ordering

- [ ] `tsconfig.json`
  - Verify strict mode enabled
  - Check paths configuration

**Verification:**
- [ ] No linting errors
- [ ] Code formatted consistently
- [ ] Import order consistent

---

## Complete File Checklist

### New Files to Create (9 files)
- [ ] `src/config/ssmLoader.ts`
- [ ] `src/auth/m2mClient.ts`
- [ ] `src/lib/internalApiClient.ts`
- [ ] `src/middleware/rbac.ts`
- [ ] `src/middleware/metrics.ts`
- [ ] `docs/ssm-setup.md`
- [ ] `docs/m2m-authentication.md`
- [ ] `docs/rbac-setup.md`
- [ ] `scripts/check-ssm-params.ts`

### Files to Modify (20+ files)
- [ ] `src/config/env.ts`
- [ ] `src/server.ts`
- [ ] `src/app.ts`
- [ ] `src/middleware/auth.ts`
- [ ] `src/lib/request-context.ts`
- [ ] `src/lib/errors.ts`
- [ ] `src/middleware/error-handler.ts`
- [ ] `src/routes/health.routes.ts`
- [ ] `src/modules/_example/example.service.ts` (renamed)
- [ ] `src/modules/_example/example.controller.ts` (renamed)
- [ ] `src/modules/_example/example.routes.ts` (renamed)
- [ ] `src/modules/_example/example.schemas.ts` (renamed)
- [ ] `package.json`
- [ ] `README.md`
- [ ] `.env.example`
- [ ] `docs/architecture.md`
- [ ] `docs/creating-new-module.md`
- [ ] `tests/setup.ts`
- [ ] `tests/helpers.ts`
- [ ] All test files

### Files to Rename (4 files)
- [ ] `src/modules/accounts/` → `src/modules/_example/`
- [ ] `account.service.ts` → `example.service.ts`
- [ ] `account.controller.ts` → `example.controller.ts`
- [ ] `account.routes.ts` → `example.routes.ts`
- [ ] `account.schemas.ts` → `example.schemas.ts`

### Dependencies to Add
- [ ] `@aws-sdk/client-ssm`

---

## Implementation Order (Recommended)

### Step 1: Foundation (Security & Config)
1. SSM Parameter Store (1.1)
2. Update environment config (1.1)
3. Update server startup (1.1)

### Step 2: Authentication
4. M2M token management (1.2)
5. Internal API client (1.2)
6. Simple RBAC (1.3)
7. Remove custom permissions (1.3)

### Step 3: Observability
8. Enhanced request context (2.1)
9. Request metrics (2.2)
10. Enhanced health checks (2.3)

### Step 4: Code Quality
11. Convert example module (3.1)
12. Improve error handling (3.2)
13. Update documentation (3.3)

### Step 5: Testing & Polish
14. Update tests (4.1)
15. Development scripts (5.1)
16. Linting & code quality (5.2)

---

## Success Criteria

### Security ✅
- [ ] No .env files in S3
- [ ] All secrets in SSM Parameter Store
- [ ] Encrypted at rest (SecureString)
- [ ] IAM-based access control
- [ ] CloudTrail audit logs

### Simplicity ✅
- [ ] No ElectroDB (keep simple DynamoDB helpers)
- [ ] No custom RBAC (Auth0 roles only)
- [ ] No unnecessary middleware
- [ ] Clean, readable code
- [ ] Minimal abstractions

### Maintainability ✅
- [ ] Clear placeholder code
- [ ] Good documentation
- [ ] Type-safe throughout
- [ ] Standard patterns
- [ ] Easy to extend

### Performance ✅
- [ ] Direct AWS SDK calls
- [ ] Token caching
- [ ] Efficient logging
- [ ] No bloated middleware
- [ ] Request timing metrics

### Observability ✅
- [ ] Structured logging
- [ ] Request ID tracing
- [ ] User context in logs
- [ ] Health checks
- [ ] Performance metrics

---

## Estimated Timeline

| Phase | Time |
|-------|------|
| Phase 1: Security & Configuration | 5-6 hours |
| Phase 2: Observability | 2.5 hours |
| Phase 3: Code Quality | 3.5 hours |
| Phase 4: Testing | 2 hours |
| Phase 5: Developer Experience | 1 hour |
| **Total** | **14-15 hours** |

**With breaks and testing:** ~2 working days

---

## Ready to Start?

This is the complete scope of work. All changes align with your priorities:
- Simplicity
- Code maintainability
- Performance for scaling
- Observability

No unnecessary complexity, no over-engineering, just production-ready best practices.

Shall I proceed with implementation?
