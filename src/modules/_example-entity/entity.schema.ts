import { z } from '../../lib/validation.js'

// Base account schema
export const accountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Account = z.infer<typeof accountSchema>

// Create account input
export const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>

// Update account input
export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

// List accounts query
export const listAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  orderBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
  orderDirection: z.enum(['asc', 'desc']).default('desc'),
  active: z.coerce.boolean().default(true),
})

export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>

// ID param
export const accountIdParamSchema = z.object({
  id: z.string().uuid(),
})
