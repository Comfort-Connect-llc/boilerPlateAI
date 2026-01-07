import type { Request, Response, NextFunction } from 'express'
import { unauthorized } from '../lib/errors.js'

/**
 * Require user to have one of the specified roles.
 * Roles come from Auth0 JWT claims.
 *
 * Setup in Auth0:
 * 1. Create roles in Auth0 dashboard (User Management → Roles)
 * 2. Assign roles to users
 * 3. Add roles to JWT token in Auth0 Action (Actions → Flows → Login):
 *
 * ```javascript
 * exports.onExecutePostLogin = async (event, api) => {
 *   if (event.authorization) {
 *     api.accessToken.setCustomClaim('https://yourapp.com/roles', event.authorization.roles);
 *   }
 * };
 * ```
 *
 * @param roles - Single role or array of roles (OR logic - user needs at least one)
 *
 * @example
 * // Single role required
 * router.post('/admin', requireRole('admin'), handler);
 *
 * @example
 * // User needs to have at least one of these roles
 * router.get('/reports', requireRole(['manager', 'admin']), handler);
 */
export function requireRole(roles: string | string[]) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles]

  return (req: Request, _res: Response, next: NextFunction) => {
    // Get roles from Auth0 JWT
    // Update this namespace to match your Auth0 configuration
    const payload = req.auth?.payload as any
    const userRoles = (payload?.['https://yourapp.com/roles'] as string[]) || []

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role))

    if (!hasRequiredRole) {
      throw unauthorized(
        `Requires one of: ${requiredRoles.join(', ')}. User has: ${userRoles.join(', ') || 'none'}`
      )
    }

    next()
  }
}

/**
 * Require user to have ALL of the specified roles (AND logic).
 *
 * @param roles - Array of roles (user must have all of them)
 *
 * @example
 * router.post('/sensitive', requireAllRoles(['manager', 'auditor']), handler);
 */
export function requireAllRoles(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const payload = req.auth?.payload as any
    const userRoles = (payload?.['https://yourapp.com/roles'] as string[]) || []

    const hasAllRoles = roles.every((role) => userRoles.includes(role))

    if (!hasAllRoles) {
      throw unauthorized(`Requires all roles: ${roles.join(', ')}. User has: ${userRoles.join(', ') || 'none'}`)
    }

    next()
  }
}
