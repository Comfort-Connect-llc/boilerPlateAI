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

  const region = process.env.AWS_REGION || 'us-east-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  cachedConfig = {
    region,
  }

  if (accessKeyId && secretAccessKey) {
    cachedConfig.credentials = {
      accessKeyId,
      secretAccessKey,
    }
  }

  return cachedConfig
}

export function clearAWSConfigCache(): void {
  cachedConfig = null
}