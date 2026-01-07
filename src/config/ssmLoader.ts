import { SSMClient, GetParametersByPathCommand, Parameter } from '@aws-sdk/client-ssm'
import { logger } from '../lib/logger.js'

export interface SSMLoaderOptions {
  serviceName?: string
  environment?: string
  region?: string
  customPaths?: string[]
}

/**
 * Load configuration from AWS SSM Parameter Store.
 *
 * Loading order (last wins):
 * 1. Shared path: /shared/{environment}/
 * 2. Service-specific path: /{serviceName}/{environment}/
 * 3. Custom paths (in order provided)
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
  } = options

  logger.info(
    {
      serviceName,
      environment,
      region,
      customPaths,
    },
    'Loading configuration from SSM Parameter Store'
  )

  const client = new SSMClient({ region })
  const config: Record<string, string> = {}

  // Build paths in order (first = lowest priority)
  const paths = [`/shared/${environment}/`, `/${serviceName}/${environment}/`, ...customPaths]

  // Load from each path (later paths override earlier)
  for (const path of paths) {
    try {
      const params = await loadParametersFromPath(client, path)
      Object.assign(config, params)

      logger.info(
        {
          path,
          parameterCount: Object.keys(params).length,
        },
        'Loaded parameters from SSM path'
      )
    } catch (error) {
      // Path might not exist (e.g., /shared/local/), that's OK
      logger.warn(
        {
          path,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to load from SSM path (may not exist)'
      )
    }
  }

  logger.info(
    {
      totalParameters: Object.keys(config).length,
    },
    'Completed loading from SSM Parameter Store'
  )

  return config
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
  const parameters: Record<string, string> = {}
  let nextToken: string | undefined

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true, // Decrypt SecureString parameters
      NextToken: nextToken,
    })

    const response = await client.send(command)

    // Process parameters
    if (response.Parameters) {
      for (const param of response.Parameters) {
        const key = extractKeyFromPath(param.Name!, path)
        parameters[key] = param.Value!
      }
    }

    nextToken = response.NextToken
  } while (nextToken)

  return parameters
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
  const withoutBase = fullPath.replace(basePath, '')
  const segments = withoutBase.split('/').filter(Boolean)

  // For nested paths, join with underscores and uppercase
  // Example: db/host -> DB_HOST
  return segments.join('_').toUpperCase()
}

/**
 * Check if SSM should be used based on environment.
 *
 * @returns true if SSM should be loaded
 */
export function shouldUseSSM(): boolean {
  const env = process.env.NODE_ENV

  // Don't use SSM for local development or tests
  return env !== 'local' && env !== 'test'
}
