import { SSMClient, GetParametersByPathCommand, GetParameterCommand } from '@aws-sdk/client-ssm'
import { logger } from '../lib/logger.js'
import { getAWSClientConfig } from './aws.js'

export interface SSMLoaderOptions {
  serviceName?: string
  environment?: string
  region?: string
  customPaths?: string[]
}

export interface SSMLoadResult {
  config: Record<string, string>
  flagNames: string[]
  flagPaths: Map<string, string>
}

/**
 * Load configuration from AWS SSM Parameter Store.
 *
 * Loading order (last wins):
 * 1. Shared path: /shared/
 * 2. Service-specific path: /{serviceName}/
 * 3. Custom paths (in order provided)
 *
 * After loading from /{serviceName}/, identifies parameters under /{serviceName}/flags/
 * as dynamic flags that should be fetched on-demand.
 *
 * Example SSM structure:
 *   /myservice/
 *     - DB_HOST
 *     - STRIPE_SECRET_KEY
 *   /myservice/flags/
 *     - FEATURE_X_ENABLED
 *     - FEATURE_Y_ENABLED
 *   /shared/
 *     - AWS_REGION
 *     - LOG_LEVEL
 *
 * @param options - Configuration options
 * @returns Object with config and list of flag parameter names
 */
export async function loadFromSSM(
  options: SSMLoaderOptions = {}
): Promise<SSMLoadResult> {
  const {
    serviceName,
    customPaths = [],
  } = options

  logger.info('Loading configuration from SSM Parameter Store', {
    serviceName,
    customPaths,
  })

  const awsConfig = getAWSClientConfig()
  const client = new SSMClient(awsConfig)
  const config: Record<string, string> = {}
  const flagNames: string[] = []
  const flagPaths = new Map<string, string>()

  // Build paths in order (first = lowest priority)
  const paths = [`/shared/common/`, `/api/${serviceName}/`, ...customPaths]
  const flagsPath = `/api/${serviceName}/flags/`

  // Load from each path (later paths override earlier)
  for (const path of paths) {
    try {
      const params = await loadParametersFromPath(client, path, path === `/api/${serviceName}/` ? flagsPath : undefined)
      Object.assign(config, params)

      logger.info('Loaded parameters from SSM path', {
        path,
        parameterCount: Object.keys(params).length,
      })
    } catch (error) {
      // Path might not exist, that's OK
      logger.warn('Failed to load from SSM path (may not exist)', {
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // After loading from /serviceName/, check for flags under /serviceName/flags/
  try {
    const flagParams = await loadParametersFromPathWithFullPaths(client, flagsPath)
    
    for (const fullPath of Object.keys(flagParams)) {
      const flagName = extractKeyFromPath(fullPath, flagsPath)
      flagNames.push(flagName)
      flagPaths.set(flagName, fullPath)
    }

    if (flagNames.length > 0) {
      logger.info('Identified dynamic flag parameters', {
        flagsPath,
        flagCount: flagNames.length,
        flagNames,
      })
    }
  } catch (error) {
    // Flags path might not exist, that's OK
    logger.debug('No flags path found (this is OK)', {
      flagsPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  logger.info('Completed loading from SSM Parameter Store', {
    totalParameters: Object.keys(config).length,
    flagCount: flagNames.length,
  })

  return { config, flagNames, flagPaths }
}

/**
 * Load all parameters from a specific SSM path.
 *
 * @param client - SSM client
 * @param path - Parameter path (e.g., /myservice/)
 * @returns Object with parameter names and values
 */
async function loadParametersFromPath(
  client: SSMClient,
  path: string,
  excludePathPrefix?: string
): Promise<Record<string, string>> {
  const parameters: Record<string, string> = {}
  let nextToken: string | undefined

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true,
      NextToken: nextToken,
    })

    const response = await client.send(command)

    if (response.Parameters) {
      for (const param of response.Parameters) {
        if (excludePathPrefix && param.Name && param.Name.startsWith(excludePathPrefix)) {
          continue
        }
        const key = extractKeyFromPath(param.Name!, path)
        parameters[key] = param.Value!
      }
    }

    nextToken = response.NextToken
  } while (nextToken)

  return parameters
}

/**
 * Load all parameters from a specific SSM path, returning full paths as keys.
 * Used to identify flag parameters without loading their values.
 *
 * @param client - SSM client
 * @param path - Parameter path (e.g., /myservice/flags/)
 * @returns Object with full paths as keys and values
 */
async function loadParametersFromPathWithFullPaths(
  client: SSMClient,
  path: string
): Promise<Record<string, string>> {
  const parameters: Record<string, string> = {}
  let nextToken: string | undefined

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true,
      NextToken: nextToken,
    })

    const response = await client.send(command)

    if (response.Parameters) {
      for (const param of response.Parameters) {
        if (param.Name && param.Value) {
          parameters[param.Name] = param.Value
        }
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
 *   /myservice/DB_HOST -> DB_HOST
 *   /shared/LOG_LEVEL -> LOG_LEVEL
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
 * Get a single parameter from SSM Parameter Store.
 *
 * @param parameterName - Full SSM parameter path (e.g., /myservice/flags/FEATURE_X_ENABLED)
 * @param region - AWS region (defaults to us-east-1)
 * @returns Parameter value, or undefined if not found
 */
export async function getSSMParam(
  parameterName: string,
  region?: string
): Promise<string | undefined> {
  const client = new SSMClient({ 
    region: region || process.env.AWS_REGION || 'us-east-1' 
  })

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    })

    const response = await client.send(command)
    return response.Parameter?.Value
  } catch (error) {
    logger.warn('Failed to fetch SSM parameter', {
      parameterName,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return undefined
  }
}

/**
 * Check if SSM should be used based on environment.
 *
 * @returns true if SSM should be loaded
 */
