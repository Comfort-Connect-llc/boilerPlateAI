import { z } from 'zod'
import { config as dotenvConfig } from 'dotenv'
import { loadFromSSM, getSSMParam } from './ssmLoader.js'
import { logger } from '../lib/logger.js'
import { DEFAULT_SERVICE_NAME } from './constants.js'

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
  SERVICE_NAME: z.string().default(DEFAULT_SERVICE_NAME),

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

  SSM_FETCH_TYPE: z.enum(['dynamic', 'static']).default('dynamic'),
})

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | null = null
let awsRegion: string = 'us-east-1'
let ssmEnabled = false
let paramPaths = new Map<string, string>()

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

  dotenvConfig()

  logger.info('Bootstrapping application configuration', {
    nodeEnv: process.env.NODE_ENV,
  })

  let config: Record<string, string | undefined> = {}

  try {
    const serviceNameValue = process.env.SERVICE_NAME || DEFAULT_SERVICE_NAME
    const regionValue = process.env.AWS_REGION || 'us-east-1'

    awsRegion = regionValue

    const ssmResult = await loadFromSSM({
      serviceName: serviceNameValue,
      region: regionValue,
    })
    config = { ...ssmResult.config }
    paramPaths = ssmResult.paramPaths
    ssmEnabled = true

    logger.info('Loaded configuration from SSM', {
      parameterCount: Object.keys(ssmResult.config).length,
    })
    logger.info('Loaded param paths', {
      paramPaths: [...paramPaths.entries()].map(([key, path]) => ({ key, path })),
    })
  } catch (error) {
    ssmEnabled = false
    logger.error('Failed to load from SSM, falling back to environment variables', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
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

  logger.info('Configuration bootstrapped successfully', {
    nodeEnv: cachedEnv.NODE_ENV,
    serviceName: cachedEnv.SERVICE_NAME,
    port: cachedEnv.PORT,
  })

  logger.info('Configuration values', cachedEnv)

  return cachedEnv
}

/**
 * Load environment synchronously (for backward compatibility).
 * Only use in local/test environments.
 * For production, use bootstrap() instead.
 */
export function loadEnv(overrides: Record<string, string> = {}): Env {
  ssmEnabled = false
  const raw = { ...process.env, ...overrides }
  const parsed = envSchema.safeParse(raw)

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  cachedEnv = parsed.data
  logger.info('Environment loaded synchronously', cachedEnv)
  return cachedEnv
}

/**
 * Return the bootstrapped environment (cached).
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error('Environment not loaded. Call bootstrap() or loadEnv() first.')
  }

  return cachedEnv
}

/**
 * Runtime config getter.
 *
 * When SSM_FETCH_TYPE is "dynamic" (default): return from cached env if present;
 * otherwise, if param was loaded from SSM, fetch via getSSMParam using its stored path.
 * When SSM_FETCH_TYPE is "static": return only from cached env.
 */
export const config = {
  async get(paramName: string): Promise<Env[keyof Env] | string | undefined> {
    if (!cachedEnv) {
      throw new Error('Environment not loaded. Call bootstrap() or loadEnv() first.')
    }

    const key = paramName as keyof Env
    if (cachedEnv.SSM_FETCH_TYPE !== 'dynamic') {
      return Object.prototype.hasOwnProperty.call(cachedEnv, key) ? cachedEnv[key] : undefined
    }

    if (!ssmEnabled) {
      return undefined
    }

    const path = paramPaths.get(paramName)
    if (!path) return undefined

    return getSSMParam(path, awsRegion)
  },
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
