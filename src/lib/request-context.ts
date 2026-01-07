import { AsyncLocalStorage } from 'async_hooks'
import type { Request, Response, NextFunction } from 'express'
import { v4 as uuid } from 'uuid'
import type { Logger } from './logger.js'
import { createRequestLogger } from './logger.js'

export interface UserContext {
  id: string // Auth0 user ID (sub)
  email?: string
  name?: string
  roles?: string[] // Auth0 roles
  companyId?: string
  metadata?: Record<string, unknown>
}

export interface RequestContext {
  requestId: string
  startTime: number
  user?: UserContext
  logger: Logger
  customData?: Map<string, unknown>
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>()

// Getters for accessing context from anywhere
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore()
}

export function getRequestId(): string {
  return getRequestContext()?.requestId ?? 'unknown'
}

export function getUser(): UserContext | undefined {
  return getRequestContext()?.user
}

export function getUserId(): string | undefined {
  return getUser()?.id
}

export function getUserRoles(): string[] {
  return getUser()?.roles ?? []
}

export function hasRole(role: string): boolean {
  return getUserRoles().includes(role)
}

export function hasAnyRole(roles: string[]): boolean {
  const userRoles = getUserRoles()
  return roles.some((r) => userRoles.includes(r))
}

export function hasAllRoles(roles: string[]): boolean {
  const userRoles = getUserRoles()
  return roles.every((r) => userRoles.includes(r))
}

export function getLogger(): Logger | undefined {
  return getRequestContext()?.logger
}

export function getContextValue<T>(key: string): T | undefined {
  return getRequestContext()?.customData?.get(key) as T | undefined
}

// Setters for middleware to populate context
export function setUser(user: UserContext): void {
  const ctx = getRequestContext()
  if (ctx) {
    ctx.user = user
  }
}

export function setContextValue(key: string, value: unknown): void {
  const ctx = getRequestContext()
  if (ctx) {
    if (!ctx.customData) {
      ctx.customData = new Map()
    }
    ctx.customData.set(key, value)
  }
}

// Middleware to establish context
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuid()
  const logger = createRequestLogger(req, requestId)

  const context: RequestContext = {
    requestId,
    startTime: Date.now(),
    logger,
  }

  // Add request ID to response headers
  _res.setHeader('x-request-id', requestId)

  asyncLocalStorage.run(context, () => {
    next()
  })
}
