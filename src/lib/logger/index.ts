import winston from 'winston'
import type { Request } from 'express'
import { getEnv } from '../../config/env.js'
import { DEFAULT_SERVICE_NAME } from '../../config/constants.js'
import { cleanObject } from './redaction.js'
import { createRemoteTransport } from './transport.js'

interface LogMetadata {
  event?: string
  metadata?: Record<string, unknown>
  req?: Request | null
  sessionId?: string | null
  companyId?: string | null
  profile?: unknown | null
}

const RESERVED_META_KEYS = new Set([
  'service',
  'event',
  'sessionId',
  'req',
  'companyId',
  'profile',
  'metadata',
  'level',
  'message',
  'timestamp',
  'splat',
])

let env: ReturnType<typeof getEnv> | null = null
try {
  env = getEnv()
} catch {
  // Config not loaded yet, will use defaults
}

const serviceName = env?.SERVICE_NAME || process.env.SERVICE_NAME || DEFAULT_SERVICE_NAME
const nodeEnv = env?.NODE_ENV || process.env.NODE_ENV || 'development'
const logLevel = env?.LOG_LEVEL || process.env.LOG_LEVEL || 'info'
const awsRegion = env?.AWS_REGION || process.env.AWS_REGION || 'us-east-1'

const normalizeMeta = winston.format((info) => {
  const hasExplicitMetadata =
    info.metadata !== undefined &&
    typeof info.metadata === 'object' &&
    Object.keys(info.metadata as object).length > 0
  if (!hasExplicitMetadata) {
    const extra = Object.keys(info).filter((k) => !RESERVED_META_KEYS.has(k))
    if (extra.length > 0) {
      info.metadata = Object.fromEntries(extra.map((k) => [k, info[k]]))
      for (const k of extra) delete info[k]
    }
  }
  return info
})()

const structuredFormat = winston.format.combine(
  normalizeMeta,
  winston.format.timestamp(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }: Record<string, unknown>) => {
    const structuredLog: Record<string, unknown> = {
      timestamp,
      level,
      service: meta.service || serviceName,
      event: meta.event || 'General',
      message,
      metadata: meta.metadata || {},
      sessionId: meta.sessionId || 'unknown',
    }

    const req = meta.req as Record<string, unknown> | undefined
    if (req?.profile) {
      structuredLog.profile = cleanObject(req.profile)
    }

    if (req?.companyId) {
      structuredLog.companyId = req.companyId
    }

    return JSON.stringify(structuredLog)
  })
)

const consoleFormat = winston.format.combine(
  normalizeMeta,
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }: Record<string, unknown>) => {
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : ''
    return `${timestamp} [${level}]: ${message}${metaStr}`
  })
)

const levels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

winston.addColors({
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
})

export const logger = winston.createLogger({
  levels,
  level: logLevel,
  format: structuredFormat,
  defaultMeta: { service: serviceName },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: logLevel,
    }),
  ],
})

logger.add(createRemoteTransport({
  serviceName,
  nodeEnv,
  logLevel,
  awsRegion,
  reservedMetaKeys: RESERVED_META_KEYS,
  awsAccessKeyId: env?.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: env?.AWS_SECRET_ACCESS_KEY,
}))

function filterRequest(req: Request | null): Record<string, unknown> | null {
  if (!req) return null

  return {
    method: req.method,
    url: req.originalUrl || req.url,
    headers: {
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
    },
    query: req.query || {},
    body: req.body || {},
  }
}

function createLogMetadata(
  event?: string,
  metadata: Record<string, unknown> = {},
  req: Request | null = null,
  sessionId: string | null = null
): Record<string, unknown> {
  const cleanMetadata = cleanObject(metadata) as Record<string, unknown>
  const cleanReq = req ? filterRequest(req) : null
  const cleanSessionId = sessionId || ((req as Record<string, unknown> | null)?.sessionId as string | undefined)
  const cleanCompanyId = ((req as Record<string, unknown> | null)?.companyId as string) || 'unknown'
  const cleanProfile = (req as Record<string, unknown> | null)?.profile || 'unknown'

  const logMetadata: Record<string, unknown> = {
    event,
    metadata: cleanMetadata,
  }

  if (cleanReq) logMetadata.req = cleanReq
  if (cleanSessionId) logMetadata.sessionId = cleanSessionId
  if (cleanCompanyId) logMetadata.companyId = cleanCompanyId
  if (cleanProfile) logMetadata.profile = cleanProfile

  return logMetadata
}

export const error = (message: string, meta: LogMetadata = {}) => {
  logger.error(message, createLogMetadata(meta.event, meta.metadata, meta.req, meta.sessionId))
}

export const warn = (message: string, meta: LogMetadata = {}) => {
  logger.warn(message, createLogMetadata(meta.event, meta.metadata, meta.req, meta.sessionId))
}

export const info = (message: string | Record<string, unknown>, meta?: LogMetadata | string) => {
  if (typeof message === 'object') {
    logger.info(meta as string || 'Info', message)
  } else {
    logger.info(message, createLogMetadata((meta as LogMetadata)?.event, (meta as LogMetadata)?.metadata, (meta as LogMetadata)?.req, (meta as LogMetadata)?.sessionId))
  }
}

export const debug = (message: string, meta: LogMetadata = {}) => {
  logger.debug(message, createLogMetadata(meta.event, meta.metadata, meta.req, meta.sessionId))
}

export const fatal = (message: string, meta: LogMetadata = {}) => {
  logger.log('fatal', message, createLogMetadata(meta.event, meta.metadata, meta.req, meta.sessionId))
}

export function createRequestLogger(req: Request, requestId: string) {
  return logger.child({
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
  })
}

export type Logger = typeof logger
