# SSM Parameter Store Implementation

## Why SSM is Critical (Not Optional)

### The .env Security Problem

**Current approach (storing .env in S3):**
```
❌ Secrets in S3 bucket (even if private)
❌ Must download to local for deploys
❌ Can be accidentally exposed
❌ No audit trail
❌ Rotation requires updating files everywhere
❌ Easy to commit to git by mistake
```

**SSM Parameter Store approach:**
```
✅ Encrypted at rest with KMS
✅ Encrypted in transit (TLS)
✅ IAM-based access control
✅ CloudTrail audit logs
✅ Version history
✅ Centralized rotation
✅ No files to lose
✅ Environment-specific automatic
```

### Real-World Example

**Without SSM (risky):**
```bash
# Developer workflow
1. Download .env from S3
2. Run application with .env file
3. Hope .env doesn't leak
4. Secret rotation = update S3, redeploy everywhere
```

**With SSM (secure):**
```bash
# Developer workflow
1. App starts
2. Fetches from SSM (encrypted, audited)
3. No files to leak
4. Secret rotation = update SSM parameter once, restart apps
```

---

## Implementation

### 1. Create SSM Loader

```typescript
// src/config/ssmLoader.ts
import { SSMClient, GetParametersByPathCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from '../lib/logger.js';
import { getAWSClientConfig } from './aws.js';

export interface SSMLoaderOptions {
  serviceName?: string;
  environment?: string;
  region?: string;
  customPaths?: string[];
}

export interface SSMLoadResult {
  config: Record<string, string>;
  flagNames: string[];
  flagPaths: Map<string, string>;
}

/**
 * Load configuration from AWS SSM Parameter Store.
 *
 * Loading order (last wins):
 * 1. Shared path: /shared/common/
 * 2. Service-specific path: /api/{serviceName}/
 * 3. Custom paths (in order provided)
 *
 * Parameters under /api/{serviceName}/flags/ are dynamic flags (fetched on-demand via config.get()).
 *
 * Example SSM structure:
 *   /api/boilerplate/
 *     - DB_HOST
 *     - STRIPE_SECRET_KEY
 *   /api/boilerplate/flags/
 *     - FEATURE_X_ENABLED
 *   /shared/common/
 *     - AWS_REGION
 *     - LOG_LEVEL
 *
 * @param options - Configuration options
 * @returns SSMLoadResult with config, flagNames, and flagPaths
 */
export async function loadFromSSM(
  options: SSMLoaderOptions = {}
): Promise<SSMLoadResult> {
  const {
    serviceName = process.env.SERVICE_NAME || 'boilerplate',
    region = process.env.AWS_REGION || 'us-east-1',
    customPaths = [],
  } = options;

  logger.info('Loading configuration from SSM Parameter Store', {
    serviceName,
    customPaths,
  });

  const awsConfig = getAWSClientConfig();
  const client = new SSMClient(awsConfig);
  const config: Record<string, string> = {};
  const flagNames: string[] = [];
  const flagPaths = new Map<string, string>();
  const paths = [`/shared/common/`, `/api/${serviceName}/`, ...customPaths];
  const flagsPath = `/api/${serviceName}/flags/`;

  for (const path of paths) {
    try {
      const params = await loadParametersFromPath(client, path, path === `/api/${serviceName}/` ? flagsPath : undefined);
      Object.assign(config, params);
      logger.info('Loaded parameters from SSM path', { path, parameterCount: Object.keys(params).length });
    } catch (error) {
      logger.warn('Failed to load from SSM path (may not exist)', {
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  try {
    const flagParams = await loadParametersFromPathWithFullPaths(client, flagsPath);
    for (const fullPath of Object.keys(flagParams)) {
      const flagName = extractKeyFromPath(fullPath, flagsPath);
      flagNames.push(flagName);
      flagPaths.set(flagName, fullPath);
    }
  } catch {
    // Flags path may not exist
  }

  logger.info('Completed loading from SSM Parameter Store', {
    totalParameters: Object.keys(config).length,
    flagCount: flagNames.length,
  });

  return { config, flagNames, flagPaths };
}

/**
 * Load all parameters from a specific SSM path. Optionally exclude a subpath (e.g. flags).
 */
async function loadParametersFromPath(
  client: SSMClient,
  path: string,
  excludePathPrefix?: string
): Promise<Record<string, string>> {
  // ... GetParametersByPathCommand, skip params where param.Name starts with excludePathPrefix
  return parameters;
}

/**
 * getSSMParam(parameterName, region?) - Fetches a single parameter by full path (e.g. /api/boilerplate/flags/FEATURE_X_ENABLED).
 */

/**
 * Extract parameter key from full SSM path.
 *
 * Examples:
 *   /api/boilerplate/DB_HOST -> DB_HOST
 *   /shared/common/LOG_LEVEL -> LOG_LEVEL
 *   /custom/path/to/API_KEY -> API_KEY
 *
 * @param fullPath - Full parameter path
 * @param basePath - Base path to remove
 * @returns Parameter key
 */
function extractKeyFromPath(fullPath: string, basePath: string): string {
  // Remove base path and get the last segment
  const withoutBase = fullPath.replace(basePath, '');
  const segments = withoutBase.split('/').filter(Boolean);

  // For nested paths, join with underscores and uppercase
  // Example: /db/host -> DB_HOST
  return segments.join('_').toUpperCase();
}
```

---

### 2. Environment Config (`src/config/env.ts`)

**Bootstrap order:**
1. Load `.env` via `dotenv`
2. Load from SSM (`loadFromSSM` → `config`, `flagNames`, `flagPaths`); on failure, fall back to env only
3. Merge with `process.env` (env vars override SSM)
4. Validate with Zod schema and freeze

**Runtime config:** Use `config.get(paramName)` for async lookup. If the key is a known flag (under `/api/{serviceName}/flags/`), it is fetched from SSM on-demand; otherwise the value comes from the cached env.

**Sync load:** `loadEnv(overrides)` bypasses SSM and loads only from `process.env` (used in tests/local).

---

### 3. Server Startup (`src/index.ts`)

Entry point calls `bootstrap()` first (loads dotenv then SSM, merges, validates), then `getEnv()` and `createApp()`. Graceful shutdown closes the HTTP server and disconnects Prisma. Uses `logger` and `fatal` from `src/lib/logger.js`.

---

### 4. Update Tests

```typescript
// tests/setup.ts
import { loadEnv } from '../src/config/env';

// Tests typically bypass SSM and load only from env + overrides
process.env.NODE_ENV = 'test';

loadEnv({
  // Test overrides
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  AUTH0_DOMAIN: 'test.auth0.com',
  // ... other test values
});
```

---

## Setting Up SSM Parameters

### 1. Using AWS Console

```
1. Go to AWS Systems Manager → Parameter Store
2. Create parameters:

   Name: /api/boilerplate/DB_HOST
   Type: SecureString (for secrets) or String
   Value: prod-db.rds.amazonaws.com

   Name: /api/boilerplate/AUTH0_CLIENT_SECRET
   Type: SecureString
   Value: your-secret-value

   Name: /shared/common/LOG_LEVEL
   Type: String
   Value: info

   (Optional) Dynamic flags: /api/boilerplate/flags/FEATURE_X_ENABLED
```

### 2. Using AWS CLI

```bash
# Create secure string (encrypted)
aws ssm put-parameter \
  --name "/api/boilerplate/DB_PASSWORD" \
  --value "super-secret-password" \
  --type "SecureString" \
  --description "Production database password"

# Create regular string
aws ssm put-parameter \
  --name "/api/boilerplate/DB_HOST" \
  --value "prod-db.rds.amazonaws.com" \
  --type "String"

# Shared parameter
aws ssm put-parameter \
  --name "/shared/common/AWS_REGION" \
  --value "us-east-1" \
  --type "String"
```

### 3. Using Terraform (Recommended)

```hcl
# terraform/ssm.tf

# Service-specific parameters (path: /api/{service_name}/)
resource "aws_ssm_parameter" "db_host" {
  name  = "/api/${var.service_name}/DB_HOST"
  type  = "String"
  value = aws_db_instance.main.endpoint
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/api/${var.service_name}/DB_PASSWORD"
  type  = "SecureString"
  value = random_password.db.result
}

resource "aws_ssm_parameter" "auth0_secret" {
  name  = "/api/${var.service_name}/AUTH0_CLIENT_SECRET"
  type  = "SecureString"
  value = var.auth0_client_secret
}

# Shared parameters (path: /shared/common/)
resource "aws_ssm_parameter" "shared_region" {
  name  = "/shared/common/AWS_REGION"
  type  = "String"
  value = var.aws_region
}

resource "aws_ssm_parameter" "shared_log_level" {
  name  = "/shared/common/LOG_LEVEL"
  type  = "String"
  value = var.environment == "production" ? "info" : "debug"
}
```

---

## IAM Permissions

### Minimal Required Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/api/*",
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/shared/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

### For ECS Task Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/api/${ServiceName}/*",
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/shared/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.${AWS::Region}.amazonaws.com"
        }
      }
    }
  ]
}
```

---

## Environment Setup

### Local Development (.env file)

```bash
# .env
NODE_ENV=local
SERVICE_NAME=myservice
PORT=3000

# Auth0
AUTH0_DOMAIN=dev-xxx.auth0.com
AUTH0_AUDIENCE=https://api.example.com
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
AUTH0_ISSUER_BASE_URL=https://dev-xxx.auth0.com

# AWS (for local DynamoDB, S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# DynamoDB
DYNAMODB_TABLE_PREFIX=local
DYNAMODB_ENDPOINT=http://localhost:8000

# S3
S3_BUCKET_NAME=local-bucket
```

### Production (no .env file needed!)

```bash
# Only need these environment variables in ECS/Lambda
NODE_ENV=production
SERVICE_NAME=boilerplate
AWS_REGION=us-east-1

# Everything else loaded from SSM automatically:
# - /api/boilerplate/* (service-specific)
# - /shared/common/* (shared). Dynamic flags: /api/boilerplate/flags/*
```

---

## Migration Path

### Step 1: Add SSM Loader (No Breaking Changes)
- Add `ssmLoader.ts`
- Update `env.ts` to support async bootstrap
- Keep sync `loadEnv()` for backward compatibility

### Step 2: Test Locally
```bash
# Still works with .env
NODE_ENV=local npm run dev
```

### Step 3: Setup SSM Parameters
- Create parameters in AWS Console/CLI/Terraform
- Test in dev environment first

### Step 4: Deploy with SSM
```bash
# ECS/Lambda automatically uses SSM
NODE_ENV=production
# No .env file needed!
```

### Step 5: Remove .env from S3
- Delete .env files from S3
- Update deployment scripts
- No more insecure secret storage!

---

## Benefits Summary

| Aspect | .env in S3 | SSM Parameter Store |
|--------|-----------|---------------------|
| **Security** | ❌ Plain text | ✅ Encrypted (KMS) |
| **Access Control** | ❌ S3 bucket policy | ✅ IAM + resource policies |
| **Audit Trail** | ❌ Limited | ✅ CloudTrail (every access) |
| **Rotation** | ❌ Manual, error-prone | ✅ Update once, apply everywhere |
| **Version History** | ❌ S3 versioning (if enabled) | ✅ Built-in versioning |
| **Leak Risk** | ❌ High (files can be downloaded) | ✅ Low (no files) |
| **Environment Isolation** | ❌ Multiple files | ✅ Path-based |
| **Cost** | ~$0.023/GB | ~$0.05/10K requests (cheaper!) |
| **Developer Experience** | ❌ Download from S3 | ✅ Automatic loading |

---

## Recommendation

**This should be Phase 1, Priority P0** (not Phase 3).

**Why:**
1. **Security Critical** - Fixes major security issue
2. **Low Complexity** - ~200 lines of code
3. **High Value** - Better security, operations, DX
4. **Industry Standard** - AWS best practice
5. **No Breaking Changes** - Local dev still uses .env

**Implementation Time:** ~2-3 hours

Your instinct was correct - SSM is not optional, it's essential for secure secret management.
