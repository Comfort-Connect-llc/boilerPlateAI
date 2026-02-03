/**
 * Change Detection Utility
 *
 * Deep comparison utility that generates detailed change records
 * for audit logging purposes.
 */

import type { ChangeRecord, ChangeDetectionOptions } from './types.js'
import { DEFAULT_EXCLUDED_FIELDS } from './types.js'

/**
 * Get the type name of a value for audit records
 */
function getValueType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Check if a value is a plain object (not array, null, or class instance)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Deep equality check for two values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => deepEqual(a[key], b[key]))
  }

  return false
}

/**
 * Build dot-notation path for nested properties
 */
function buildPath(basePath: string, key: string | number): string {
  if (basePath === '') {
    return typeof key === 'number' ? `[${key}]` : key
  }
  return typeof key === 'number' ? `${basePath}[${key}]` : `${basePath}.${key}`
}

/**
 * Recursively detect changes between two objects
 */
function detectChangesRecursive(
  before: unknown,
  after: unknown,
  path: string,
  changes: ChangeRecord[],
  excludeFields: Set<string>,
  maxDepth: number,
  currentDepth: number
): void {
  if (currentDepth > maxDepth) {
    return
  }

  // Check if the path's field name should be excluded
  const fieldName = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? ''
  if (excludeFields.has(fieldName) && path !== '') {
    return
  }

  // Handle undefined/null cases
  if (before === undefined && after === undefined) return
  if (before === null && after === null) return

  // Handle type changes or primitive changes
  if (!isPlainObject(before) || !isPlainObject(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      if (!deepEqual(before, after)) {
        changes.push({
          path: path || '(root)',
          oldValue: before,
          newValue: after,
          valueType: getValueType(after) !== 'undefined' ? getValueType(after) : getValueType(before),
        })
      }
      return
    }
  }

  // Handle arrays
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLen = Math.max(before.length, after.length)
    for (let i = 0; i < maxLen; i++) {
      const itemPath = buildPath(path, i)
      if (i >= before.length) {
        changes.push({
          path: itemPath,
          oldValue: undefined,
          newValue: after[i],
          valueType: getValueType(after[i]),
        })
      } else if (i >= after.length) {
        changes.push({
          path: itemPath,
          oldValue: before[i],
          newValue: undefined,
          valueType: getValueType(before[i]),
        })
      } else {
        detectChangesRecursive(
          before[i],
          after[i],
          itemPath,
          changes,
          excludeFields,
          maxDepth,
          currentDepth + 1
        )
      }
    }
    return
  }

  // Handle objects
  if (isPlainObject(before) && isPlainObject(after)) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

    for (const key of allKeys) {
      if (excludeFields.has(key)) continue

      const keyPath = buildPath(path, key)
      const beforeVal = before[key]
      const afterVal = after[key]

      detectChangesRecursive(
        beforeVal,
        afterVal,
        keyPath,
        changes,
        excludeFields,
        maxDepth,
        currentDepth + 1
      )
    }
    return
  }

  // Type mismatch (one is object/array, other is not)
  if (!deepEqual(before, after)) {
    changes.push({
      path: path || '(root)',
      oldValue: before,
      newValue: after,
      valueType: getValueType(after),
    })
  }
}

/**
 * Detect changes between two entity states
 *
 * @param before - Entity state before the change
 * @param after - Entity state after the change
 * @param options - Change detection options
 * @returns Array of change records describing all differences
 *
 * @example
 * ```typescript
 * const changes = detectChanges(
 *   { name: 'John', address: { city: 'NYC' } },
 *   { name: 'John', address: { city: 'LA' } },
 *   { excludeFields: ['updatedAt'] }
 * )
 * // Returns: [{ path: 'address.city', oldValue: 'NYC', newValue: 'LA', valueType: 'string' }]
 * ```
 */
export function detectChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options: ChangeDetectionOptions = {}
): ChangeRecord[] {
  const {
    excludeFields = [],
    maxDepth = 10,
  } = options

  const allExcluded = new Set([...DEFAULT_EXCLUDED_FIELDS, ...excludeFields])
  const changes: ChangeRecord[] = []

  detectChangesRecursive(before, after, '', changes, allExcluded, maxDepth, 0)

  return changes
}

/**
 * Generate changes for a CREATE operation (all fields are new)
 *
 * @param entity - The newly created entity
 * @param options - Change detection options
 * @returns Array of change records for all non-excluded fields
 */
export function detectCreateChanges(
  entity: Record<string, unknown>,
  options: ChangeDetectionOptions = {}
): ChangeRecord[] {
  const { excludeFields = [] } = options
  const allExcluded = new Set([...DEFAULT_EXCLUDED_FIELDS, ...excludeFields])
  const changes: ChangeRecord[] = []

  function processValue(value: unknown, path: string): void {
    const fieldName = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? ''
    if (allExcluded.has(fieldName) && path !== '') return

    changes.push({
      path,
      oldValue: null,
      newValue: value,
      valueType: getValueType(value),
    })
  }

  for (const [key, value] of Object.entries(entity)) {
    if (allExcluded.has(key)) continue
    processValue(value, key)
  }

  return changes
}

/**
 * Generate changes for a DELETE operation (all fields are removed)
 *
 * @param entity - The entity being deleted
 * @param options - Change detection options
 * @returns Array of change records for all non-excluded fields
 */
export function detectDeleteChanges(
  entity: Record<string, unknown>,
  options: ChangeDetectionOptions = {}
): ChangeRecord[] {
  const { excludeFields = [] } = options
  const allExcluded = new Set([...DEFAULT_EXCLUDED_FIELDS, ...excludeFields])
  const changes: ChangeRecord[] = []

  function processValue(value: unknown, path: string): void {
    const fieldName = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? ''
    if (allExcluded.has(fieldName) && path !== '') return

    changes.push({
      path,
      oldValue: value,
      newValue: null,
      valueType: getValueType(value),
    })
  }

  for (const [key, value] of Object.entries(entity)) {
    if (allExcluded.has(key)) continue
    processValue(value, key)
  }

  return changes
}
