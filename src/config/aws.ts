import { getEnv } from './env.js'

export interface AWSClientConfig {
  region: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
}

let cachedConfig: AWSClientConfig | null = null

export function getAWSClientConfig(): AWSClientConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  let env
  try {
    env = getEnv()
  } catch {
    // Config not loaded yet (e.g., during bootstrap), use process.env as fallback
    const region = process.env.AWS_REGION || 'us-east-1'
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    cachedConfig = { region }
    if (accessKeyId && secretAccessKey) {
      cachedConfig.credentials = { accessKeyId, secretAccessKey }
    }
    return cachedConfig
  }

  cachedConfig = {
    region: env.AWS_REGION,
  }

  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    cachedConfig.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }
  }

  return cachedConfig
}

export function clearAWSConfigCache(): void {
  cachedConfig = null
}