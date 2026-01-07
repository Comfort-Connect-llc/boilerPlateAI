import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm'
import { getEnv, isLocal, loadEnv } from './env.js'
import { logger } from '../lib/logger.js'

interface SSMParameter {
  Name: string
  Value: string
}

async function fetchSSMParameters(client: SSMClient, path: string): Promise<SSMParameter[]> {
  const params: SSMParameter[] = []
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
          params.push({ Name: param.Name, Value: param.Value })
        }
      }
    }

    nextToken = response.NextToken
  } while (nextToken)

  return params
}

function convertSSMToEnvVars(params: SSMParameter[]): Record<string, string> {
  return params.reduce<Record<string, string>>((acc, param) => {
    // Extract the key name from the full path and convert to uppercase
    const key = param.Name.split('/').pop()?.toUpperCase()
    if (key) {
      acc[key] = param.Value
    }
    return acc
  }, {})
}

export async function bootstrapConfig(): Promise<void> {
  // In local mode, just load from .env file
  if (process.env.NODE_ENV === 'local') {
    const dotenv = await import('dotenv')
    dotenv.config()
    loadEnv()
    logger.info('Configuration loaded from .env file')
    return
  }

  // In non-local environments, fetch from SSM Parameter Store
  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(isLocal() && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    }),
  })

  const commonPath = process.env.SSM_COMMON_PATH || '/coco/common/'
  const servicePath = process.env.SSM_SERVICE_PATH || '/coco/api/boilerplate-ts/'

  logger.info({ commonPath, servicePath }, 'Fetching configuration from SSM')

  const [commonParams, serviceParams] = await Promise.all([
    fetchSSMParameters(ssmClient, commonPath),
    fetchSSMParameters(ssmClient, servicePath),
  ])

  const ssmEnvVars = {
    ...convertSSMToEnvVars(commonParams),
    ...convertSSMToEnvVars(serviceParams),
  }

  // Load environment with SSM overrides
  loadEnv(ssmEnvVars)

  logger.info('Configuration loaded from SSM Parameter Store')
}
