import winston from 'winston'
import WinstonCloudWatch from 'winston-cloudwatch'
import type { Request } from 'express'
import { getEnv } from '../config/env.js'

interface LogMetadata {
  event?: string
  metadata?: Record<string, unknown>
  req?: Request | null
  sessionId?: string | null
  companyId?: string | null
  profile?: unknown | null
}

const sensitiveFields = [
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'cardNumber',
  'cvv',
  'expiryDate',
  'bankAccount',
  'routingNumber',
  'accountNumber',
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'paymentMethod',
  'billingInfo',
  'accessToken',
  'refreshToken',
]

const sensitivePatterns = {
  ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  routingNumber: /\b\d{9}\b/g,
}

function cleanObject(obj: unknown, depth = 0): unknown {
  if (depth > 4) return '[Max Depth Reached]'

  if (!obj || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanObject(item, depth + 1))
  }

  const cleaned: Record<string, unknown> = {}
  const visited = new WeakSet()
  visited.add(obj)

  try {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        if (visited.has(value)) {
          cleaned[key] = '[Circular Reference]'
          continue
        }
        visited.add(value)
      }

      if (key === 'profile' || key === 'sessionId' || key === 'companyId') {
        cleaned[key] = value
        continue
      }

      if (key === 'x-session-id') {
        continue
      }

      if (sensitiveFields.includes(key)) {
        cleaned[key] = '[REDACTED]'
      } else if (typeof value === 'string') {
        if (sensitivePatterns.ssn.test(value)) {
          cleaned[key] = '[REDACTED-SSN]'
        } else if (sensitivePatterns.creditCard.test(value)) {
          cleaned[key] = '[REDACTED-CC]'
        } else if (sensitivePatterns.routingNumber.test(value)) {
          cleaned[key] = '[REDACTED-ROUTING]'
        } else {
          cleaned[key] = value
        }
      } else if (typeof value === 'object' && value !== null) {
        try {
          cleaned[key] = cleanObject(value, depth + 1)
        } catch (e) {
          cleaned[key] = '[Error Cleaning Object]'
        }
      } else {
        cleaned[key] = value
      }
    }
  } catch (e) {
    return '[Error Processing Object]'
  }

  return cleaned
}

const structuredFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }: Record<string, unknown>) => {
    const structuredLog: Record<string, unknown> = {
      timestamp,
      level,
      service: meta.service || 'boilerplate',
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

let env: ReturnType<typeof getEnv> | null = null
try {
  env = getEnv()
} catch {
  // Config not loaded yet, will use defaults
}

const serviceName = env?.SERVICE_NAME || 'boilerplate'
const nodeEnv = env?.NODE_ENV || process.env.NODE_ENV || 'development'
const logLevel = env?.LOG_LEVEL || 'info'
const awsRegion = env?.AWS_REGION || 'us-east-1'

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

const cloudwatchConfig: Record<string, unknown> = {
  logGroupName: `/comfort-connect/${nodeEnv}/${serviceName}`,
  logStreamName: `${nodeEnv}-${new Date().toISOString().split('T')[0]}`,
  awsRegion,
  messageFormatter: ({ level, message, ...meta }: Record<string, unknown>) => {
    const cleanMeta = cleanObject(meta) as Record<string, unknown>
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

if (env?.AWS_ACCESS_KEY_ID && env?.AWS_SECRET_ACCESS_KEY) {
  cloudwatchConfig.awsAccessKeyId = env.AWS_ACCESS_KEY_ID
  cloudwatchConfig.awsSecretKey = env.AWS_SECRET_ACCESS_KEY
}

logger.add(new WinstonCloudWatch(cloudwatchConfig))

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
