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
  paramPaths: Map<string, string>
}

/**
 * Load configuration from AWS SSM Parameter Store.
 *
 * Loading order (last wins):
 * 1. Shared path: /shared/
 * 2. Service-specific path: /api/{serviceName}/
 * 3. Custom paths (in order provided)
 *
 * Returns config (key -> value) and paramPaths (key -> full SSM path) for dynamic fetch via config.get.
 *
 * Example SSM structure:
 *   /api/boilerplate/
 *     - DB_HOST
 *     - STRIPE_SECRET_KEY
 *   /shared/
 *     - AWS_REGION
 *     - LOG_LEVEL
 *
 * @param options - Configuration options
 * @returns Config and paramPaths (param name -> full SSM path)
 */
export async function loadFromSSM(
  options: SSMLoaderOptions = {}
): Promise<SSMLoadResult> {
  const { serviceName, customPaths = [] } = options

  logger.info('Loading configuration from SSM Parameter Store', {
    serviceName,
    customPaths,
  })

  const awsConfig = getAWSClientConfig()
  const client = new SSMClient(awsConfig)
  const config: Record<string, string> = {}
  const paramPaths = new Map<string, string>()
  const paths = [`/shared/`, `/api/${serviceName}/`, ...customPaths]

  for (const path of paths) {
    try {
      const { parameters, paths: keyPaths } = await loadParametersFromPath(client, path)
      for (const [k, v] of Object.entries(parameters)) {
        config[k] = v
      }
      for (const [k, p] of keyPaths.entries()) {
        paramPaths.set(k, p)
      }
      logger.info('Loaded parameters from SSM path', {
        path,
        parameterCount: Object.keys(parameters).length,
      })
    } catch (error) {
      logger.warn('Failed to load from SSM path (may not exist)', {
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  logger.info('Completed loading from SSM Parameter Store', {
    totalParameters: Object.keys(config).length,
  })

  return { config, paramPaths }
}

interface LoadParamsResult {
  parameters: Record<string, string>
  paths: Map<string, string>
}

async function loadParametersFromPath(
  client: SSMClient,
  path: string
): Promise<LoadParamsResult> {
  const parameters: Record<string, string> = {}
  const paths = new Map<string, string>()
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
          const key = extractKeyFromPath(param.Name, path)
          parameters[key] = param.Value
          paths.set(key, param.Name)
        }
      }
    }

    nextToken = response.NextToken
  } while (nextToken)

  return { parameters, paths }
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
  const withoutBase = fullPath.replace(basePath, '')
  const segments = withoutBase.split('/').filter(Boolean)

  // Previous behavior (kept for reference):
  // return segments.join('_').toUpperCase()

  return segments.length > 0 ? segments[segments.length - 1] : withoutBase
}

/**
 * Get a single parameter from SSM Parameter Store.
 *
 * @param parameterName - Full SSM parameter path (e.g., /api/boilerplate/DB_HOST)
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

