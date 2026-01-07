import { z, type ZodType, type ZodError } from 'zod'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { badRequest } from './errors.js'

export interface ValidationSchema {
  params?: ZodType
  query?: ZodType
  body?: ZodType
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
}

export function validate(schema: ValidationSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const errors: string[] = []

    if (schema.params) {
      const result = schema.params.safeParse(req.params)
      if (!result.success) {
        errors.push(`params: ${formatZodError(result.error)}`)
      } else {
        req.params = result.data
      }
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query)
      if (!result.success) {
        errors.push(`query: ${formatZodError(result.error)}`)
      } else {
        req.query = result.data
      }
    }

    if (schema.body) {
      const result = schema.body.safeParse(req.body)
      if (!result.success) {
        errors.push(`body: ${formatZodError(result.error)}`)
      } else {
        req.body = result.data
      }
    }

    if (errors.length > 0) {
      return next(badRequest('Validation failed', errors))
    }

    next()
  }
}

// Common validation schemas
export const commonSchemas = {
  uuid: z.string().uuid(),
  
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    orderBy: z.string().optional(),
    orderDirection: z.enum(['asc', 'desc']).default('desc'),
  }),

  idParam: z.object({
    id: z.string().uuid(),
  }),
}

// Re-export zod for convenience
export { z }
