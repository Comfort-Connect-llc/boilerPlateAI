import { getEnv, getInternalDomains } from '../config/env.js'
import { getRequestId, getUser } from './request-context.js'
import { logger } from './logger.js'

export interface HttpRequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

export interface HttpResponse<T = unknown> {
  status: number
  statusText: string
  data: T
  headers: Headers
}

function isInternalDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return getInternalDomains().includes(hostname)
  } catch {
    return false
  }
}

export async function httpRequest<T = unknown>(
  options: HttpRequestOptions
): Promise<HttpResponse<T>> {
  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = options

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': getRequestId(),
    ...headers,
  }

  // Forward auth headers only to internal domains
  if (isInternalDomain(url)) {
    const user = getUser()
    if (user) {
      // Internal services might need user context
      requestHeaders['x-user-id'] = user.sub
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    logger.debug({ url, method }, 'Making HTTP request')

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const contentType = response.headers.get('content-type')
    let data: T

    if (contentType?.includes('application/json')) {
      data = (await response.json()) as T
    } else {
      data = (await response.text()) as T
    }

    logger.debug(
      { url, method, status: response.status },
      'HTTP request completed'
    )

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: response.headers,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Convenience methods
export const http = {
  get: <T>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
    httpRequest<T>({ ...options, url, method: 'GET' }),

  post: <T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>) =>
    httpRequest<T>({ ...options, url, method: 'POST', body }),

  put: <T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>) =>
    httpRequest<T>({ ...options, url, method: 'PUT', body }),

  patch: <T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>) =>
    httpRequest<T>({ ...options, url, method: 'PATCH', body }),

  delete: <T>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
    httpRequest<T>({ ...options, url, method: 'DELETE' }),
}
