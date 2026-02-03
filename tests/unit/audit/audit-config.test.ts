import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock logger to avoid winston import issues
vi.mock('../../../src/lib/logger.js', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock env to avoid bootstrap issues
vi.mock('../../../src/config/env.js', () => ({
  getEnv: vi.fn(() => ({
    DYNAMODB_TABLE_PREFIX: 'test',
  })),
}))

import {
  getAuditConfig,
  setAuditConfig,
  configureEntityAudit,
  isAuditEnabled,
  getEntityWriter,
  getTableName,
  getExcludedFields,
  shouldIncludeSnapshots,
  resetAuditConfig,
} from '../../../src/lib/audit/audit-config.js'

describe('Audit Configuration', () => {
  beforeEach(() => {
    resetAuditConfig()
  })

  describe('getAuditConfig', () => {
    it('should return default configuration', () => {
      const config = getAuditConfig()

      expect(config.globalEnabled).toBe(true)
      expect(config.defaultWriter).toBe('dynamodb')
      expect(config.defaultExcludeFields).toContain('version')
      expect(config.defaultExcludeFields).toContain('updatedAt')
      expect(config.defaultExcludeFields).toContain('createdAt')
      expect(config.defaultExcludeFields).toContain('active')
    })
  })

  describe('setAuditConfig', () => {
    it('should merge with existing configuration', () => {
      setAuditConfig({
        globalEnabled: false,
        defaultWriter: 'postgres',
      })

      const config = getAuditConfig()

      expect(config.globalEnabled).toBe(false)
      expect(config.defaultWriter).toBe('postgres')
      // Other defaults should remain
      expect(config.defaultExcludeFields).toContain('version')
    })

    it('should merge entity configurations', () => {
      setAuditConfig({
        entities: {
          User: { enabled: true, includeSnapshots: true },
        },
      })
      setAuditConfig({
        entities: {
          Invoice: { enabled: true, includeSnapshots: false },
        },
      })

      const config = getAuditConfig()

      expect(config.entities.User).toBeDefined()
      expect(config.entities.Invoice).toBeDefined()
    })
  })

  describe('configureEntityAudit', () => {
    it('should configure a specific entity type', () => {
      configureEntityAudit('Invoice', {
        enabled: true,
        writer: 'sqs',
        excludeFields: ['internalNotes'],
        includeSnapshots: false,
      })

      const config = getAuditConfig()

      expect(config.entities.Invoice).toEqual({
        enabled: true,
        writer: 'sqs',
        excludeFields: ['internalNotes'],
        includeSnapshots: false,
      })
    })
  })

  describe('isAuditEnabled', () => {
    it('should return true for unconfigured entity when globally enabled', () => {
      expect(isAuditEnabled('UnknownEntity')).toBe(true)
    })

    it('should return false when globally disabled', () => {
      setAuditConfig({ globalEnabled: false })

      expect(isAuditEnabled('AnyEntity')).toBe(false)
    })

    it('should respect entity-specific configuration', () => {
      configureEntityAudit('TempSession', { enabled: false })

      expect(isAuditEnabled('TempSession')).toBe(false)
      expect(isAuditEnabled('OtherEntity')).toBe(true)
    })
  })

  describe('getEntityWriter', () => {
    it('should return default writer for unconfigured entity', () => {
      expect(getEntityWriter('UnknownEntity')).toBe('dynamodb')
    })

    it('should return entity-specific writer when configured', () => {
      configureEntityAudit('User', { enabled: true, writer: 'composite' })

      expect(getEntityWriter('User')).toBe('composite')
    })
  })

  describe('getExcludedFields', () => {
    it('should return default excluded fields', () => {
      const fields = getExcludedFields('AnyEntity')

      expect(fields).toContain('version')
      expect(fields).toContain('updatedAt')
      expect(fields).toContain('createdAt')
      expect(fields).toContain('active')
    })

    it('should merge entity-specific exclusions', () => {
      configureEntityAudit('User', {
        enabled: true,
        excludeFields: ['password', 'passwordHash'],
      })

      const fields = getExcludedFields('User')

      expect(fields).toContain('version')
      expect(fields).toContain('password')
      expect(fields).toContain('passwordHash')
    })

    it('should deduplicate fields', () => {
      configureEntityAudit('Test', {
        enabled: true,
        excludeFields: ['version', 'customField'],
      })

      const fields = getExcludedFields('Test')
      const versionCount = fields.filter((f) => f === 'version').length

      expect(versionCount).toBe(1)
    })
  })

  describe('shouldIncludeSnapshots', () => {
    it('should return true by default', () => {
      expect(shouldIncludeSnapshots('AnyEntity')).toBe(true)
    })

    it('should respect entity-specific configuration', () => {
      configureEntityAudit('LargeEntity', {
        enabled: true,
        includeSnapshots: false,
      })

      expect(shouldIncludeSnapshots('LargeEntity')).toBe(false)
      expect(shouldIncludeSnapshots('OtherEntity')).toBe(true)
    })
  })

  describe('getTableName', () => {
    it('should generate DynamoDB table name with prefix', () => {
      setAuditConfig({
        writers: {
          dynamodb: { tablePrefix: 'myapp' },
        },
      })

      const tableName = getTableName('Invoice', 'dynamodb')

      expect(tableName).toBe('myapp-invoice-audit-logs')
    })

    it('should generate DynamoDB table name without prefix', () => {
      setAuditConfig({
        writers: {
          dynamodb: { tablePrefix: '' },
        },
      })

      const tableName = getTableName('Invoice', 'dynamodb')

      expect(tableName).toBe('invoice-audit-logs')
    })

    it('should generate PostgreSQL table name with snake_case', () => {
      const tableName = getTableName('Invoice', 'postgres')

      expect(tableName).toBe('invoice_audit_logs')
    })

    it('should use custom table name if configured', () => {
      configureEntityAudit('Invoice', {
        enabled: true,
        tableName: 'custom_invoice_audits',
      })

      const tableName = getTableName('Invoice', 'dynamodb')

      expect(tableName).toBe('custom_invoice_audits')
    })

    it('should lowercase entity type in generated names', () => {
      // Note: The mock sets DYNAMODB_TABLE_PREFIX to 'test'
      const dynamoTable = getTableName('UserProfile', 'dynamodb')
      const postgresTable = getTableName('UserProfile', 'postgres')

      expect(dynamoTable).toBe('test-userprofile-audit-logs')
      expect(postgresTable).toBe('userprofile_audit_logs')
    })
  })
})
