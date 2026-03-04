import { getEnv } from '../../config/env.js'
import { uploadFile } from '../../lib/s3.js'
import { logger } from '../../lib/logger/index.js'

export interface SnapshotMetadata {
  domain: string
  entityId: string
  auditId: string
  snapshotType: 'before' | 'after'
}

export interface SnapshotResult {
  inline: unknown | null
  s3Key: string | null
}

/**
 * Determines whether a snapshot should be stored inline (Postgres JSONB)
 * or offloaded to S3 based on size thresholds.
 *
 * Thresholds (configurable via env):
 * - < AUDIT_SNAPSHOT_INLINE_THRESHOLD (default 50KB): Store directly in Postgres
 * - < AUDIT_SNAPSHOT_MAX_SIZE (default 256KB): Store in S3 if bucket configured, otherwise inline
 * - > AUDIT_SNAPSHOT_MAX_SIZE: Must use S3. Skip snapshot if no S3 configured.
 */
export async function handleSnapshot(
  snapshot: unknown,
  metadata: SnapshotMetadata
): Promise<SnapshotResult> {
  if (snapshot === null || snapshot === undefined) {
    return { inline: null, s3Key: null }
  }

  const snapshotJson = JSON.stringify(snapshot)
  const sizeBytes = Buffer.byteLength(snapshotJson, 'utf8')
  const env = getEnv()

  // Small snapshot: store inline
  if (sizeBytes < env.AUDIT_SNAPSHOT_INLINE_THRESHOLD) {
    return { inline: snapshot, s3Key: null }
  }

  // Large snapshot: try S3 if configured
  if (env.AUDIT_SNAPSHOT_S3_BUCKET) {
    const s3Key = `${metadata.domain}/${metadata.entityId}/${metadata.auditId}/${metadata.snapshotType}.json`

    try {
      await uploadFile({
        bucket: env.AUDIT_SNAPSHOT_S3_BUCKET,
        key: s3Key,
        body: snapshotJson,
        contentType: 'application/json',
      })
      return { inline: null, s3Key }
    } catch (err) {
      logger.error('Failed to upload snapshot to S3', {
        domain: metadata.domain,
        entityId: metadata.entityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // No S3 configured or S3 failed: check if within Postgres limits
  if (sizeBytes < env.AUDIT_SNAPSHOT_MAX_SIZE) {
    logger.warn('Storing large snapshot inline, consider configuring S3', {
      domain: metadata.domain,
      entityId: metadata.entityId,
      sizeKB: (sizeBytes / 1024).toFixed(2),
    })
    return { inline: snapshot, s3Key: null }
  }

  // Too large and no S3: skip snapshot
  logger.error('Snapshot too large and no S3 configured, skipping snapshot', {
    domain: metadata.domain,
    entityId: metadata.entityId,
    sizeKB: (sizeBytes / 1024).toFixed(2),
  })
  return { inline: null, s3Key: null }
}
