/**
 * Generic pagination utilities for consistent pagination across all modules
 */

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationMeta
}

/**
 * Creates a standardized paginated response
 *
 * @param data - Array of items for the current page
 * @param total - Total number of items across all pages
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns Paginated response with data and pagination metadata
 *
 * @example
 * const users = await prisma.user.findMany({ skip: 0, take: 10 })
 * const total = await prisma.user.count()
 * return createPaginatedResponse(users, total, 1, 10)
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / pageSize)

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}

/**
 * Calculates skip/take values for Prisma pagination
 *
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns Object with skip and take values for Prisma
 *
 * @example
 * const { skip, take } = getPaginationSkipTake(2, 10)
 * const users = await prisma.user.findMany({ skip, take })
 */
export function getPaginationSkipTake(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

/**
 * Validates pagination parameters and applies defaults
 *
 * @param page - Page number (defaults to 1)
 * @param pageSize - Page size (defaults to 10, max 100)
 * @returns Validated pagination parameters
 */
export function validatePaginationParams(
  page: number = 1,
  pageSize: number = 10
): PaginationParams {
  const validPage = Math.max(1, page)
  const validPageSize = Math.min(100, Math.max(1, pageSize))

  return {
    page: validPage,
    pageSize: validPageSize,
  }
}
