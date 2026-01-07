/**
 * Generic query building utilities for Prisma
 * Helps construct consistent where clauses and order by clauses
 */

import type { Prisma } from '@prisma/client'

export interface QueryOptions {
  search?: string
  active?: boolean
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

/**
 * Builds a Prisma where clause with search across multiple fields
 *
 * @param options - Query options including search term and active filter
 * @param searchFields - Fields to search across (case-insensitive)
 * @returns Prisma where clause object
 *
 * @example
 * ```typescript
 * const where = buildWhereClause(
 *   { search: 'john', active: true },
 *   ['name', 'email']
 * )
 * // Results in: { active: true, OR: [{ name: { contains: 'john', mode: 'insensitive' }}, ...] }
 * ```
 */
export function buildWhereClause<T>(
  options: QueryOptions,
  searchFields: (keyof T)[]
): Record<string, unknown> {
  const { search, active } = options
  const where: Record<string, unknown> = {}

  // Add active filter if specified
  if (active !== undefined) {
    where.active = active
  }

  // Add search across multiple fields
  if (search && searchFields.length > 0) {
    where.OR = searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive' as Prisma.QueryMode,
      },
    }))
  }

  return where
}

/**
 * Builds a Prisma orderBy clause
 *
 * @param orderBy - Field name to order by
 * @param orderDirection - Sort direction ('asc' or 'desc')
 * @returns Prisma orderBy clause object
 *
 * @example
 * ```typescript
 * const orderBy = buildOrderByClause('createdAt', 'desc')
 * // Results in: { createdAt: 'desc' }
 * ```
 */
export function buildOrderByClause(
  orderBy: string = 'createdAt',
  orderDirection: 'asc' | 'desc' = 'desc'
): Record<string, string> {
  return {
    [orderBy]: orderDirection,
  }
}

/**
 * Common date range filter builder
 *
 * @param field - Date field name
 * @param from - Start date (ISO string or Date)
 * @param to - End date (ISO string or Date)
 * @returns Prisma date range filter
 *
 * @example
 * ```typescript
 * const dateFilter = buildDateRangeFilter('createdAt', '2024-01-01', '2024-12-31')
 * // Results in: { createdAt: { gte: new Date('2024-01-01'), lte: new Date('2024-12-31') } }
 * ```
 */
export function buildDateRangeFilter(
  field: string,
  from?: string | Date,
  to?: string | Date
): Record<string, unknown> | null {
  if (!from && !to) return null

  const filter: Record<string, unknown> = {}
  const dateFilter: Record<string, Date> = {}

  if (from) {
    dateFilter.gte = new Date(from)
  }

  if (to) {
    dateFilter.lte = new Date(to)
  }

  filter[field] = dateFilter
  return filter
}

/**
 * Combine multiple filter objects into a single where clause
 *
 * @param filters - Array of filter objects (null/undefined values are skipped)
 * @returns Combined where clause
 *
 * @example
 * ```typescript
 * const where = combineFilters([
 *   { active: true },
 *   buildDateRangeFilter('createdAt', '2024-01-01'),
 *   { status: 'active' }
 * ])
 * ```
 */
export function combineFilters(
  ...filters: (Record<string, unknown> | null | undefined)[]
): Record<string, unknown> {
  return filters.reduce<Record<string, unknown>>((acc, filter) => {
    if (filter) {
      return { ...acc, ...filter }
    }
    return acc
  }, {})
}

/**
 * Build a case-insensitive exact match filter
 *
 * @param field - Field name to match
 * @param value - Value to match (case-insensitive)
 * @returns Prisma filter object
 *
 * @example
 * ```typescript
 * const filter = buildCaseInsensitiveMatch('email', 'john@example.com')
 * // Results in: { email: { equals: 'john@example.com', mode: 'insensitive' } }
 * ```
 */
export function buildCaseInsensitiveMatch(
  field: string,
  value: string
): Record<string, unknown> {
  return {
    [field]: {
      equals: value,
      mode: 'insensitive' as Prisma.QueryMode,
    },
  }
}

/**
 * Build a numeric range filter
 *
 * @param field - Numeric field name
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Prisma numeric range filter
 *
 * @example
 * ```typescript
 * const filter = buildNumericRangeFilter('amount', 100, 1000)
 * // Results in: { amount: { gte: 100, lte: 1000 } }
 * ```
 */
export function buildNumericRangeFilter(
  field: string,
  min?: number,
  max?: number
): Record<string, unknown> | null {
  if (min === undefined && max === undefined) return null

  const filter: Record<string, unknown> = {}
  const rangeFilter: Record<string, number> = {}

  if (min !== undefined) {
    rangeFilter.gte = min
  }

  if (max !== undefined) {
    rangeFilter.lte = max
  }

  filter[field] = rangeFilter
  return filter
}

/**
 * Build an array contains filter (for array fields)
 *
 * @param field - Array field name
 * @param values - Values that must be in the array
 * @returns Prisma array filter
 *
 * @example
 * ```typescript
 * const filter = buildArrayContainsFilter('tags', ['important', 'urgent'])
 * // Results in: { tags: { hasEvery: ['important', 'urgent'] } }
 * ```
 */
export function buildArrayContainsFilter(
  field: string,
  values: unknown[]
): Record<string, unknown> | null {
  if (!values || values.length === 0) return null

  return {
    [field]: {
      hasEvery: values,
    },
  }
}

/**
 * Build an enum filter (for enum fields)
 *
 * @param field - Enum field name
 * @param values - Allowed enum values
 * @returns Prisma enum filter
 *
 * @example
 * ```typescript
 * const filter = buildEnumFilter('status', ['ACTIVE', 'PENDING'])
 * // Results in: { status: { in: ['ACTIVE', 'PENDING'] } }
 * ```
 */
export function buildEnumFilter(field: string, values: unknown[]): Record<string, unknown> | null {
  if (!values || values.length === 0) return null

  return {
    [field]: {
      in: values,
    },
  }
}
