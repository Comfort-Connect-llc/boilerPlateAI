import { logger } from '../lib/logger.js'
import { getEnv } from '../config/env.js'

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

/**
 * Manages Auth0 M2M tokens for internal API authentication.
 *
 * Features:
 * - Auto-refresh before expiry (5min buffer)
 * - Token caching
 * - Prevent concurrent refresh requests
 * - Structured logging
 * - Error handling
 *
 * Usage:
 *   const token = await m2mClient.getToken();
 *   fetch(url, { headers: { Authorization: `Bearer ${token}` }})
 */
class M2MClient {
  private token?: string
  private expiresAt?: number
  private refreshPromise?: Promise<string>

  async getToken(): Promise<string> {
    // Return cached token if valid
    if (this.token && this.expiresAt && Date.now() < this.expiresAt) {
      return this.token
    }

    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this.refreshToken()
    try {
      return await this.refreshPromise
    } finally {
      this.refreshPromise = undefined
    }
  }

  private async refreshToken(): Promise<string> {
    const env = getEnv()

    if (!env.AUTH0_M2M_CLIENT_ID || !env.AUTH0_M2M_CLIENT_SECRET) {
      throw new Error(
        'M2M credentials not configured. Set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET'
      )
    }

    logger.info('Refreshing M2M token')

    try {
      const response = await fetch(`${env.AUTH0_ISSUER_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.AUTH0_M2M_CLIENT_ID,
          client_secret: env.AUTH0_M2M_CLIENT_SECRET,
          audience: env.AUTH0_AUDIENCE,
          grant_type: 'client_credentials',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to refresh token: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as TokenResponse

      this.token = data.access_token
      // Refresh 5 minutes before expiry
      const bufferSeconds = 300
      this.expiresAt = Date.now() + (data.expires_in - bufferSeconds) * 1000

      logger.info(
        'M2M token refreshed',
        {
          expiresIn: data.expires_in,
          expiresAt: new Date(this.expiresAt).toISOString(),
        },
        
      )

      return this.token
    } catch (error) {
      logger.error('Failed to refresh M2M token', { error })
      throw error
    }
  }

  /**
   * Clear cached token (useful for testing/debugging)
   */
  clearToken(): void {
    this.token = undefined
    this.expiresAt = undefined
  }
}

// Singleton instance
export const m2mClient = new M2MClient()
