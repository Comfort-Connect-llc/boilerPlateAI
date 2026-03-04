import WinstonCloudWatch from 'winston-cloudwatch'
import { cleanObject } from './redaction.js'

interface RemoteTransportOptions {
  serviceName: string
  nodeEnv: string
  logLevel: string
  awsRegion: string
  reservedMetaKeys: Set<string>
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
}

export function createRemoteTransport(options: RemoteTransportOptions): WinstonCloudWatch {
  const { serviceName, nodeEnv, logLevel, awsRegion, reservedMetaKeys } = options

  const config: Record<string, unknown> = {
    logGroupName: `/${serviceName}/${nodeEnv}`,
    logStreamName: `${nodeEnv}-${new Date().toISOString().split('T')[0]}`,
    awsRegion,
    messageFormatter: ({ level, message, ...meta }: Record<string, unknown>) => {
      const hasExplicitMetadata =
        meta.metadata !== undefined &&
        typeof meta.metadata === 'object' &&
        Object.keys(meta.metadata as object).length > 0
      let metadata: Record<string, unknown> = (meta.metadata as Record<string, unknown>) || {}
      if (!hasExplicitMetadata) {
        const extra = Object.keys(meta).filter((k) => !reservedMetaKeys.has(k))
        if (extra.length > 0) {
          metadata = Object.fromEntries(extra.map((k) => [k, meta[k]]))
        }
      }
      const cleanMeta = cleanObject({ ...meta, metadata }) as Record<string, unknown>
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: cleanMeta.service || serviceName,
        event: cleanMeta.event || 'General',
        message,
        metadata: cleanMeta.metadata || {},
        sessionId: cleanMeta.sessionId || 'unknown',
        ...(cleanMeta.req && typeof cleanMeta.req === 'object' && 'profile' in cleanMeta.req
          ? { profile: (cleanMeta.req as Record<string, unknown>).profile }
          : {}),
        ...(cleanMeta.req && typeof cleanMeta.req === 'object' && 'companyId' in cleanMeta.req
          ? { companyId: (cleanMeta.req as Record<string, unknown>).companyId }
          : {}),
      })
    },
    retentionInDays: 180,
    level: logLevel,
  }

  if (options.awsAccessKeyId && options.awsSecretAccessKey) {
    config.awsAccessKeyId = options.awsAccessKeyId
    config.awsSecretKey = options.awsSecretAccessKey
  }

  return new WinstonCloudWatch(config)
}
