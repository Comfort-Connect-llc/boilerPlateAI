import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadEnv, getEnv, isProduction, isDevelopment, isLocal, getInternalDomains } from '../../src/config/env.js'

describe('Environment Configuration', () => {
  describe('loadEnv', () => {
    it('should load valid environment variables', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })

      expect(env.NODE_ENV).toBe('development')
      expect(env.PORT).toBe(3000)
      expect(env.AUTH0_DOMAIN).toBe('test.auth0.com')
    })

    it('should coerce PORT to number', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        PORT: '8080',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })

      expect(env.PORT).toBe(8080)
      expect(typeof env.PORT).toBe('number')
    })

    it('should use default values', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })

      expect(env.PORT).toBe(3000) // default
      expect(env.AWS_REGION).toBe('us-east-1') // default
      expect(env.DYNAMODB_TABLE_PREFIX).toBe('boilerplate') // default
      expect(env.LOG_LEVEL).toBe('info') // default
    })

    it('should throw on missing required variables', () => {
      expect(() =>
        loadEnv({
          NODE_ENV: 'development',
          // Missing required fields
        })
      ).toThrow('Environment validation failed')
    })

    it('should validate NODE_ENV enum', () => {
      expect(() =>
        loadEnv({
          NODE_ENV: 'invalid',
          AUTH0_DOMAIN: 'test.auth0.com',
          AUTH0_AUDIENCE: 'https://api',
          AUTH0_CLIENT_ID: 'client-id',
          AUTH0_CLIENT_SECRET: 'client-secret',
          AWS_ACCESS_KEY_ID: 'access-key',
          AWS_SECRET_ACCESS_KEY: 'secret-key',
          DATABASE_URL: 'postgresql://localhost/db',
          S3_BUCKET_NAME: 'my-bucket',
        })
      ).toThrow()
    })
  })

  describe('getEnv', () => {
    it('should return cached env after loadEnv', () => {
      loadEnv({
        NODE_ENV: 'test',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })

      const env = getEnv()
      expect(env.NODE_ENV).toBe('test')
    })
  })

  describe('environment helpers', () => {
    beforeEach(() => {
      loadEnv({
        NODE_ENV: 'production',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })
    })

    it('isProduction should return true for production', () => {
      expect(isProduction()).toBe(true)
    })

    it('isDevelopment should return false for production', () => {
      expect(isDevelopment()).toBe(false)
    })

    it('isLocal should return false for production', () => {
      expect(isLocal()).toBe(false)
    })
  })

  describe('getInternalDomains', () => {
    it('should parse comma-separated domains', () => {
      loadEnv({
        NODE_ENV: 'development',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
        INTERNAL_DOMAINS: 'api.internal.com, services.internal.com',
      })

      const domains = getInternalDomains()
      expect(domains).toEqual(['api.internal.com', 'services.internal.com'])
    })

    it('should return empty array when not set', () => {
      loadEnv({
        NODE_ENV: 'development',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_AUDIENCE: 'https://api',
        AUTH0_CLIENT_ID: 'client-id',
        AUTH0_CLIENT_SECRET: 'client-secret',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        DATABASE_URL: 'postgresql://localhost/db',
        S3_BUCKET_NAME: 'my-bucket',
      })

      const domains = getInternalDomains()
      expect(domains).toEqual([])
    })
  })
})
