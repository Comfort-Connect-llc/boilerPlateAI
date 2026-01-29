import { m2mClient } from '../auth/m2mClient.js'
import { getRequestId } from './request-context.js'
import { logger } from './logger.js'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  timeout?: number
}

/**
 * HTTP client for internal service-to-service communication.
 *
 * Features:
 * - Auto-injects M2M token
 * - Propagates request ID for tracing
 * - Timeout handling
 * - Error logging
 *
 * Usage:
 *   const data = await internalApi.get('https://api.internal.com/users');
 *   const result = await internalApi.post('https://api.internal.com/orders', { ... });
 */
export async function callInternalApi<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = 30000 } = options

  // Get M2M token
  const token = await m2mClient.getToken()

  // Get request ID for tracing
  const requestId = getRequestId()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    logger.debug('Calling internal API', { url, method, requestId })

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      logger.error('Internal API call failed', {
        url,
        method,
        status: response.status,
        error,
        requestId,
      })

      throw new Error(`API call failed: ${response.status} ${error}`)
    }

    const data = await response.json()
    return data as T
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Internal API call timed out', { url, method, timeout, requestId })
      throw new Error(`API call timed out after ${timeout}ms`)
    }

    throw error
  }
}

/**
 * Convenience methods for internal API calls
 */
export const internalApi = {
  get: <T = any>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    callInternalApi<T>(url, { ...options, method: 'GET' }),

  post: <T = any>(
    url: string,
    body: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ) => callInternalApi<T>(url, { ...options, method: 'POST', body }),

  put: <T = any>(
    url: string,
    body: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ) => callInternalApi<T>(url, { ...options, method: 'PUT', body }),

  patch: <T = any>(
    url: string,
    body: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ) => callInternalApi<T>(url, { ...options, method: 'PATCH', body }),

  delete: <T = any>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    callInternalApi<T>(url, { ...options, method: 'DELETE' }),
}
