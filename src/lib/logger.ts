import pino from 'pino'
import type { Request } from 'express'

// Create base logger instance
// In development, we'll use pino-pretty for readable output
const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {
        // Production: JSON format for CloudWatch/ELK
        formatters: {
          level: label => ({ level: label }),
        },
      }
    : {
        // Development: Pretty print
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
  base: {
    service: 'boilerplate-ts',
    env: process.env.NODE_ENV,
  },
})

// Sensitive fields to redact from logs
const REDACT_FIELDS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'secret',
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'cardNumber',
  'cvv',
  'bankAccount',
  'routingNumber',
  'accountNumber',
])

// Patterns for sensitive data
const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'SSN', pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g },
  { name: 'Credit Card', pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/g },
]

export function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[Max Depth]'
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'string') {
    let result = obj
    for (const { pattern } of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]')
    }
    return result
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitive(item, depth + 1))
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (REDACT_FIELDS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = redactSensitive(value, depth + 1)
      }
    }
    return result
  }

  return obj
}

// Create child logger with request context
export function createRequestLogger(req: Request, requestId: string) {
  return logger.child({
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
  })
}

export type Logger = typeof logger
