import type { AuditChange } from './AuditLog.model.js'
import { getEnv } from '../../config/env.js'

const MAX_DEPTH = 10

/**
 * Deep compares two objects and generates an array of changes with dot-notation paths.
 * Handles nested objects, arrays, and primitives.
 * Excludes configured fields (updatedAt, version, etc.).
 */
export function detectChanges(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null,
  excludeFields?: string[]
): AuditChange[] {
  const excludeRaw = excludeFields ?? getEnv().AUDIT_EXCLUDE_FIELDS
  const excludeList = typeof excludeRaw === 'string'
    ? excludeRaw.split(',').map((f) => f.trim())
    : (excludeRaw ?? ['updatedAt', 'version'])
  const exclude = new Set(excludeList)
  const changes: AuditChange[] = []

  if (!oldObj && !newObj) return changes
  if (!oldObj) {
    collectAllPaths(newObj!, '', changes, exclude, 0, 'CREATE')
    return changes
  }
  if (!newObj) {
    collectAllPaths(oldObj, '', changes, exclude, 0, 'DELETE')
    return changes
  }

  compareObjects(oldObj, newObj, '', changes, exclude, 0)
  return changes
}

function compareObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix: string,
  changes: AuditChange[],
  exclude: Set<string>,
  depth: number
): void {
  if (depth > MAX_DEPTH) return

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])

  for (const key of allKeys) {
    if (exclude.has(key)) continue

    const path = prefix ? `${prefix}.${key}` : key
    const oldVal = oldObj[key]
    const newVal = newObj[key]

    if (oldVal === newVal) continue

    if (oldVal === undefined && newVal !== undefined) {
      changes.push({ path, oldValue: undefined, newValue: newVal })
      continue
    }

    if (oldVal !== undefined && newVal === undefined) {
      changes.push({ path, oldValue: oldVal, newValue: undefined })
      continue
    }

    if (isPlainObject(oldVal) && isPlainObject(newVal)) {
      compareObjects(
        oldVal,
        newVal,
        path,
        changes,
        exclude,
        depth + 1
      )
      continue
    }

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (!arraysEqual(oldVal, newVal)) {
        changes.push({ path, oldValue: oldVal, newValue: newVal })
      }
      continue
    }

    changes.push({ path, oldValue: oldVal, newValue: newVal })
  }
}

function collectAllPaths(
  obj: Record<string, unknown>,
  prefix: string,
  changes: AuditChange[],
  exclude: Set<string>,
  depth: number,
  operation: 'CREATE' | 'DELETE'
): void {
  if (depth > MAX_DEPTH) return

  for (const key of Object.keys(obj)) {
    if (exclude.has(key)) continue

    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]

    if (isPlainObject(val)) {
      collectAllPaths(val, path, changes, exclude, depth + 1, operation)
    } else if (operation === 'CREATE') {
      changes.push({ path, oldValue: undefined, newValue: val })
    } else {
      changes.push({ path, oldValue: val, newValue: undefined })
    }
  }
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
