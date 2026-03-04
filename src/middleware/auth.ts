import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { getEnv } from '../config/env.js'
import { setUser, type UserContext } from '../lib/request-context.js'
import { forbidden } from '../lib/errors.js'

/**
 * Create Auth0 JWT validator middleware.
 * This validates JWT access tokens from Auth0.
 *
 * Configuration:
 * - AUTH0_ISSUER_BASE_URL: Your Auth0 tenant URL (e.g., https://tenant.auth0.com)
 * - AUTH0_AUDIENCE: Your API identifier
 */
export function createAuthMiddleware(): RequestHandler {
  const env = getEnv()

  return auth({
    issuerBaseURL: env.AUTH0_ISSUER_BASE_URL,
    audience: env.AUTH0_AUDIENCE,
  })
}

/**
 * Extract user context from validated JWT and store in AsyncLocalStorage.
 * This makes user info available everywhere via getUser().
 *
 * Must be used after createAuthMiddleware().
 *
 * Custom claims namespace: https://yourapp.com/
 * Update this to match your Auth0 configuration.
 */
export function populateUserContext(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth

  if (auth?.payload) {
    const user: UserContext = {
      id: auth.payload.sub as string,
      email: auth.payload['https://yourapp.com/email'] as string | undefined,
      name: auth.payload['name'] as string | undefined,
      roles: auth.payload['https://yourapp.com/roles'] as string[] | undefined,
      companyId: auth.payload['https://yourapp.com/company_id'] as string | undefined,
      metadata: auth.payload['user_metadata'] as Record<string, unknown> | undefined,
    }
    setUser(user)
  }

  next()
}

/**
 * Require user to have one of the specified permissions (OR logic).
 * Permissions come from Auth0 RBAC — enable "Add Permissions in the Access Token"
 * in your Auth0 API settings.
 *
 * @param permissions - Single permission or array of permissions (user needs at least one)
 *
 * @example
 * router.get('/', requirePermissions('read:invoices'), handler)
 * router.post('/', requirePermissions(['write:invoices', 'admin:invoices']), handler)
 */
export function requirePermissions(permissions: string | string[]) {
  const required = Array.isArray(permissions) ? permissions : [permissions]

  return (req: Request, _res: Response, next: NextFunction) => {
    const userPermissions = req.auth?.payload?.permissions ?? []

    const hasPermission = required.some((p) => userPermissions.includes(p))

    if (!hasPermission) {
      throw forbidden(
        `Requires one of: ${required.join(', ')}. User has: ${userPermissions.join(', ') || 'none'}`
      )
    }

    next()
  }
}

/**
 * Require user to have ALL of the specified permissions (AND logic).
 *
 * @param permissions - Array of permissions (user must have all of them)
 *
 * @example
 * router.delete('/', requireAllPermissions(['delete:invoices', 'admin:invoices']), handler)
 */
export function requireAllPermissions(permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userPermissions = req.auth?.payload?.permissions ?? []

    const hasAll = permissions.every((p) => userPermissions.includes(p))

    if (!hasAll) {
      throw forbidden(
        `Requires all of: ${permissions.join(', ')}. User has: ${userPermissions.join(', ') || 'none'}`
      )
    }

    next()
  }
}

// Type augmentation for express Request
declare global {
  namespace Express {
    interface Request {
      auth?: {
        payload: {
          sub: string
          permissions?: string[]
          [key: string]: unknown
        }
        token: string
      }
    }
  }
}
