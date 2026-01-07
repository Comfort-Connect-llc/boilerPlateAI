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
import { SSMClient, GetParametersByPathCommand, Parameter } from '@aws-sdk/client-ssm';
import { logger } from '../lib/logger';

export interface SSMLoaderOptions {
  serviceName?: string;
  environment?: string;
  region?: string;
  customPaths?: string[];
}

/**
 * Load configuration from AWS SSM Parameter Store.
 *
 * Loading order (last wins):
 * 1. Custom paths (in order provided)
 * 2. Service-specific path: /{serviceName}/{environment}/
 * 3. Shared path: /shared/{environment}/
 *
 * Example SSM structure:
 *   /myservice/production/
 *     - DB_HOST
 *     - STRIPE_SECRET_KEY
 *   /shared/production/
 *     - AWS_REGION
 *     - LOG_LEVEL
 *
 * @param options - Configuration options
 * @returns Object with environment variables from SSM
 */
export async function loadFromSSM(
  options: SSMLoaderOptions = {}
): Promise<Record<string, string>> {
  const {
    serviceName = process.env.SERVICE_NAME || 'boilerplate',
    environment = process.env.NODE_ENV || 'development',
    region = process.env.AWS_REGION || 'us-east-1',
    customPaths = [],
  } = options;

  logger.info({
    serviceName,
    environment,
    region,
    customPaths
  }, 'Loading configuration from SSM Parameter Store');

  const client = new SSMClient({ region });
  const config: Record<string, string> = {};

  // Build paths in order (first = lowest priority)
  const paths = [
    `/shared/${environment}/`,
    `/${serviceName}/${environment}/`,
    ...customPaths,
  ];

  // Load from each path (later paths override earlier)
  for (const path of paths) {
    try {
      const params = await loadParametersFromPath(client, path);
      Object.assign(config, params);

      logger.info({
        path,
        parameterCount: Object.keys(params).length
      }, 'Loaded parameters from SSM path');
    } catch (error) {
      // Path might not exist (e.g., /shared/local/), that's OK
      logger.warn({
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to load from SSM path (may not exist)');
    }
  }

  logger.info({
    totalParameters: Object.keys(config).length
  }, 'Completed loading from SSM Parameter Store');

  return config;
}

/**
 * Load all parameters from a specific SSM path.
 *
 * @param client - SSM client
 * @param path - Parameter path (e.g., /myservice/production/)
 * @returns Object with parameter names and values
 */
async function loadParametersFromPath(
  client: SSMClient,
  path: string
): Promise<Record<string, string>> {
  const parameters: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true, // Decrypt SecureString parameters
      NextToken: nextToken,
    });

    const response = await client.send(command);

    // Process parameters
    if (response.Parameters) {
      for (const param of response.Parameters) {
        const key = extractKeyFromPath(param.Name!, path);
        parameters[key] = param.Value!;
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}

/**
 * Extract parameter key from full SSM path.
 *
 * Examples:
 *   /myservice/production/DB_HOST -> DB_HOST
 *   /shared/production/LOG_LEVEL -> LOG_LEVEL
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

/**
 * Check if SSM should be used based on environment.
 *
 * @returns true if SSM should be loaded
 */
export function shouldUseSSM(): boolean {
  const env = process.env.NODE_ENV;

  // Don't use SSM for local development or tests
  return env !== 'local' && env !== 'test';
}
```

---

### 2. Update Environment Config

```typescript
// src/config/env.ts
import { z } from 'zod';
import { loadFromSSM, shouldUseSSM } from './ssmLoader';
import { logger } from '../lib/logger';

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test', 'local']).default('development'),
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string().default('boilerplate'),

  // Auth0
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_ISSUER_BASE_URL: z.string().url(),

  // Auth0 M2M (for internal API calls)
  AUTH0_M2M_CLIENT_ID: z.string().optional(),
  AUTH0_M2M_CLIENT_SECRET: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),

  // PostgreSQL
  DATABASE_URL: z.string().min(1),

  // DynamoDB
  DYNAMODB_TABLE_PREFIX: z.string().default('boilerplate'),
  DYNAMODB_ENDPOINT: z.string().optional(),

  // S3
  S3_BUCKET_NAME: z.string().min(1),
  S3_PRESIGNED_URL_EXPIRY: z.coerce.number().default(3600),

  // Internal Services
  INTERNAL_DOMAINS: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Bootstrap application configuration.
 *
 * Loading order:
 * 1. Load from SSM (if not local/test)
 * 2. Merge with process.env (env vars override SSM)
 * 3. Validate with Zod schema
 * 4. Freeze and cache
 *
 * This ensures:
 * - Local dev uses .env files (convenience)
 * - Production uses SSM (security)
 * - Environment variables can override SSM (flexibility)
 * - Configuration is immutable after bootstrap
 */
export async function bootstrap(): Promise<Env> {
  if (cachedEnv) {
    logger.warn('Configuration already bootstrapped');
    return cachedEnv;
  }

  logger.info({
    nodeEnv: process.env.NODE_ENV,
    useSSM: shouldUseSSM()
  }, 'Bootstrapping application configuration');

  let config: Record<string, string | undefined> = {};

  // Step 1: Load from SSM (if applicable)
  if (shouldUseSSM()) {
    try {
      const ssmConfig = await loadFromSSM({
        serviceName: process.env.SERVICE_NAME,
        environment: process.env.NODE_ENV,
        region: process.env.AWS_REGION,
      });
      config = { ...ssmConfig };

      logger.info({
        parameterCount: Object.keys(ssmConfig).length
      }, 'Loaded configuration from SSM');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to load from SSM, falling back to environment variables');
    }
  } else {
    logger.info('Skipping SSM (local/test environment)');
  }

  // Step 2: Merge with environment variables (env vars override SSM)
  config = {
    ...config,
    ...process.env,
  };

  // Step 3: Validate
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${formatted}`);
  }

  // Step 4: Freeze and cache
  cachedEnv = Object.freeze(parsed.data);

  logger.info({
    nodeEnv: cachedEnv.NODE_ENV,
    serviceName: cachedEnv.SERVICE_NAME,
    port: cachedEnv.PORT
  }, 'Configuration bootstrapped successfully');

  return cachedEnv;
}

/**
 * Get cached configuration.
 * Must call bootstrap() first.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error('Configuration not loaded. Call bootstrap() first.');
  }
  return cachedEnv;
}

/**
 * Load environment synchronously (for backward compatibility).
 * Only use in local/test environments.
 * For production, use bootstrap() instead.
 */
export function loadEnv(overrides: Record<string, string> = {}): Env {
  if (shouldUseSSM()) {
    throw new Error(
      'Cannot use loadEnv() in non-local environment. Use bootstrap() instead.'
    );
  }

  const raw = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

export function isLocal(): boolean {
  return getEnv().NODE_ENV === 'local';
}

export function getInternalDomains(): string[] {
  const domains = getEnv().INTERNAL_DOMAINS;
  return domains ? domains.split(',').map(d => d.trim()) : [];
}
```

---

### 3. Update Server Startup

```typescript
// src/server.ts
import { bootstrap } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { gracefulShutdown } from './lib/shutdown';

async function main() {
  try {
    // Bootstrap configuration FIRST (loads from SSM)
    await bootstrap();

    // Now start the server
    const app = createApp();
    const env = getEnv();

    const server = app.listen(env.PORT, () => {
      logger.info({
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        serviceName: env.SERVICE_NAME
      }, 'Server started successfully');
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
```

---

### 4. Update Tests

```typescript
// tests/setup.ts
import { loadEnv } from '../src/config/env';

// Tests use .env file, not SSM
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

   Name: /myservice/production/DB_HOST
   Type: SecureString (for secrets) or String
   Value: prod-db.rds.amazonaws.com

   Name: /myservice/production/AUTH0_CLIENT_SECRET
   Type: SecureString
   Value: your-secret-value

   Name: /shared/production/LOG_LEVEL
   Type: String
   Value: info
```

### 2. Using AWS CLI

```bash
# Create secure string (encrypted)
aws ssm put-parameter \
  --name "/myservice/production/DB_PASSWORD" \
  --value "super-secret-password" \
  --type "SecureString" \
  --description "Production database password"

# Create regular string
aws ssm put-parameter \
  --name "/myservice/production/DB_HOST" \
  --value "prod-db.rds.amazonaws.com" \
  --type "String"

# Create shared parameter
aws ssm put-parameter \
  --name "/shared/production/AWS_REGION" \
  --value "us-east-1" \
  --type "String"
```

### 3. Using Terraform (Recommended)

```hcl
# terraform/ssm.tf

# Service-specific parameters
resource "aws_ssm_parameter" "db_host" {
  name  = "/${var.service_name}/${var.environment}/DB_HOST"
  type  = "String"
  value = aws_db_instance.main.endpoint
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.service_name}/${var.environment}/DB_PASSWORD"
  type  = "SecureString"
  value = random_password.db.result
}

resource "aws_ssm_parameter" "auth0_secret" {
  name  = "/${var.service_name}/${var.environment}/AUTH0_CLIENT_SECRET"
  type  = "SecureString"
  value = var.auth0_client_secret
}

# Shared parameters
resource "aws_ssm_parameter" "shared_region" {
  name  = "/shared/${var.environment}/AWS_REGION"
  type  = "String"
  value = var.aws_region
}

resource "aws_ssm_parameter" "shared_log_level" {
  name  = "/shared/${var.environment}/LOG_LEVEL"
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
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/myservice/*",
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
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${ServiceName}/${Environment}/*",
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/shared/${Environment}/*"
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
SERVICE_NAME=myservice
AWS_REGION=us-east-1

# Everything else loaded from SSM automatically:
# - /myservice/production/* (service-specific)
# - /shared/production/* (shared across services)
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
