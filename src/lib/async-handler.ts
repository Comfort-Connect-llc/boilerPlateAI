import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wraps async route handlers to catch errors and pass them to Express error handler.
 * This prevents unhandled promise rejections in Express routes.
 *
 * @example
 * ```typescript
 * export const createUser = asyncHandler(async (req, res) => {
 *   const user = await userService.create(req.body)
 *   res.json(user)
 * })
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
