import { z } from 'zod'
import { loadFromSSM, shouldUseSSM } from './ssmLoader.js'
import { logger } from '../lib/logger.js'

/**
 * Environment variable schema
 *
 * This defines the base environment variables required by the boilerplate.
 * When creating a new service, add your service-specific variables to this schema.
 *
 * @example
 * ```typescript
 * // Add service-specific variables:
 * const envSchema = z.object({
 *   // ... existing variables ...
 *
 *   // Service-specific SNS topics
 *   SNS_TOPIC_ARN_YOUR_DOMAIN: z.string().optional(),
 *
 *   // Service-specific API URLs
 *   YOUR_SERVICE_API_URL: z.string().url().optional(),
 *
 *   // Service-specific config
 *   YOUR_FEATURE_ENABLED: z.coerce.boolean().default(false),
 * })
 * ```
 */
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

  // Internal Services (comma-separated list of internal domain names)
  INTERNAL_DOMAINS: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | null = null

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
    logger.warn('Configuration already bootstrapped')
    return cachedEnv
  }

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV,
      useSSM: shouldUseSSM(),
    },
    'Bootstrapping application configuration'
  )

  let config: Record<string, string | undefined> = {}

  // Step 1: Load from SSM (if applicable)
  if (shouldUseSSM()) {
    try {
      const ssmConfig = await loadFromSSM({
        serviceName: process.env.SERVICE_NAME,
        environment: process.env.NODE_ENV,
        region: process.env.AWS_REGION,
      })
      config = { ...ssmConfig }

      logger.info(
        {
          parameterCount: Object.keys(ssmConfig).length,
        },
        'Loaded configuration from SSM'
      )
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to load from SSM, falling back to environment variables'
      )
    }
  } else {
    logger.info('Skipping SSM (local/test environment)')
  }

  // Step 2: Merge with environment variables (env vars override SSM)
  config = {
    ...config,
    ...process.env,
  }

  // Step 3: Validate
  const parsed = envSchema.safeParse(config)

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Configuration validation failed:\n${formatted}`)
  }

  // Step 4: Freeze and cache
  cachedEnv = Object.freeze(parsed.data)

  logger.info(
    {
      nodeEnv: cachedEnv.NODE_ENV,
      serviceName: cachedEnv.SERVICE_NAME,
      port: cachedEnv.PORT,
    },
    'Configuration bootstrapped successfully'
  )

  return cachedEnv
}

/**
 * Load environment synchronously (for backward compatibility).
 * Only use in local/test environments.
 * For production, use bootstrap() instead.
 */
export function loadEnv(overrides: Record<string, string> = {}): Env {
  if (shouldUseSSM()) {
    throw new Error('Cannot use loadEnv() in non-local environment. Use bootstrap() instead.')
  }

  const raw = { ...process.env, ...overrides }
  const parsed = envSchema.safeParse(raw)

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  cachedEnv = parsed.data
  return cachedEnv
}

export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error('Environment not loaded. Call bootstrap() or loadEnv() first.')
  }
  return cachedEnv
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production'
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development'
}

export function isLocal(): boolean {
  return getEnv().NODE_ENV === 'local'
}

export function getInternalDomains(): string[] {
  const domains = getEnv().INTERNAL_DOMAINS
  return domains ? domains.split(',').map((d) => d.trim()) : []
}
