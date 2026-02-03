/**
 * Base interfaces and types for service layer implementations
 * Use these to ensure consistency across all domain services
 */

import type { PaginatedResponse } from './pagination.js'

/**
 * Base entity interface that all DynamoDB entities should extend
 * Provides common fields for versioning, soft deletes, and timestamps
 *
 * Note: Audit logging is now handled separately by the audit service.
 * Use `auditService.auditCreate/Update/Delete()` after operations.
 * See src/lib/audit for the decoupled audit logging system.
 */
export interface BaseEntity {
  id: string
  version: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Generic query parameters for list operations
 */
export interface BaseQueryParams {
  page?: number
  pageSize?: number
  search?: string
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
  active?: boolean
}

/**
 * Generic CRUD service interface
 * Domain services can implement this interface to ensure consistency
 *
 * @template TEntity - The entity type (must extend BaseEntity)
 * @template TCreateInput - Input type for creating entities
 * @template TUpdateInput - Input type for updating entities
 * @template TQueryParams - Query parameters for listing entities
 *
 * @example
 * ```typescript
 * class UserService implements CrudService<UserEntity, CreateUserInput, UpdateUserInput, ListUsersQuery> {
 *   async create(input: CreateUserInput): Promise<UserEntity> { ... }
 *   async findById(id: string): Promise<UserEntity> { ... }
 *   async list(params: ListUsersQuery): Promise<PaginatedResponse<UserEntity>> { ... }
 *   async update(id: string, input: UpdateUserInput): Promise<UserEntity> { ... }
 *   async delete(id: string): Promise<void> { ... }
 * }
 * ```
 */
export interface CrudService<
  TEntity extends BaseEntity,
  TCreateInput,
  TUpdateInput,
  TQueryParams extends BaseQueryParams = BaseQueryParams,
> {
  /**
   * Create a new entity
   */
  create(input: TCreateInput): Promise<TEntity>

  /**
   * Find entity by ID
   * @throws {ApiError} 404 if not found
   */
  findById(id: string): Promise<TEntity>

  /**
   * List entities with pagination and filtering
   */
  list(params: TQueryParams): Promise<PaginatedResponse<TEntity>>

  /**
   * Update an existing entity
   * @throws {ApiError} 404 if not found
   */
  update(id: string, input: TUpdateInput): Promise<TEntity>

  /**
   * Delete an entity (soft delete recommended)
   * @throws {ApiError} 404 if not found
   */
  delete(id: string): Promise<void>
}

/**
 * Common response format for successful operations
 */
export interface SuccessResponse<T> {
  message: string
  data: T
}

/**
 * Response format for list operations with pagination
 */
export interface ListResponse<T> extends SuccessResponse<T[]> {
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * Standard permission naming patterns
 * Use these as a guide for consistent permission names across services
 */
export const PermissionPatterns = {
  /**
   * Read permission pattern: 'read:{resource}'
   * @example 'read:users', 'read:invoices'
   */
  read: (resource: string) => `read:${resource}`,

  /**
   * Write permission pattern: 'write:{resource}'
   * @example 'write:users', 'write:invoices'
   */
  write: (resource: string) => `write:${resource}`,

  /**
   * Delete permission pattern: 'delete:{resource}'
   * @example 'delete:users', 'delete:invoices'
   */
  delete: (resource: string) => `delete:${resource}`,

  /**
   * Admin permission pattern: 'admin:{resource}'
   * @example 'admin:users', 'admin:system'
   */
  admin: (resource: string) => `admin:${resource}`,
} as const
