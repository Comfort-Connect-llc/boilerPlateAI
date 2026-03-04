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

export function cleanObject(obj: unknown, depth = 0): unknown {
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
