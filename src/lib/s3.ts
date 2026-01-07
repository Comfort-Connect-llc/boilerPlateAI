import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getEnv } from '../config/env.js'
import { logger } from './logger.js'
import { notFound } from './errors.js'

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    const env = getEnv()
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return s3Client
}

function getBucketName(): string {
  return getEnv().S3_BUCKET_NAME
}

export interface UploadOptions {
  key: string
  body: Buffer | Uint8Array | string
  contentType: string
  metadata?: Record<string, string>
}

export async function uploadFile(options: UploadOptions): Promise<string> {
  const { key, body, contentType, metadata } = options

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  })

  await getS3Client().send(command)
  logger.debug({ key, contentType }, 'File uploaded to S3')

  return key
}

export async function getFile(key: string): Promise<{
  body: ReadableStream | null
  contentType: string | undefined
  metadata: Record<string, string> | undefined
}> {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  })

  try {
    const response = await getS3Client().send(command)
    return {
      body: response.Body?.transformToWebStream() ?? null,
      contentType: response.ContentType,
      metadata: response.Metadata,
    }
  } catch (error) {
    if ((error as Error).name === 'NoSuchKey') {
      throw notFound(`File not found: ${key}`)
    }
    throw error
  }
}

export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  })

  await getS3Client().send(command)
  logger.debug({ key }, 'File deleted from S3')
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
    await getS3Client().send(command)
    return true
  } catch {
    return false
  }
}

export async function listFiles(prefix: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: getBucketName(),
    Prefix: prefix,
  })

  const response = await getS3Client().send(command)
  return response.Contents?.map(obj => obj.Key!).filter(Boolean) ?? []
}

export interface PresignedUrlOptions {
  key: string
  expiresIn?: number // seconds
  contentType?: string // for upload URLs
}

export async function getPresignedDownloadUrl(options: PresignedUrlOptions): Promise<string> {
  const { key, expiresIn } = options
  const env = getEnv()

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  })

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresIn ?? env.S3_PRESIGNED_URL_EXPIRY,
  })

  logger.debug({ key }, 'Generated presigned download URL')
  return url
}

export async function getPresignedUploadUrl(options: PresignedUrlOptions): Promise<string> {
  const { key, expiresIn, contentType } = options
  const env = getEnv()

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresIn ?? env.S3_PRESIGNED_URL_EXPIRY,
  })

  logger.debug({ key, contentType }, 'Generated presigned upload URL')
  return url
}

// Generate a unique S3 key for a file
export function generateFileKey(
  prefix: string,
  fileName: string,
  userId?: string
): string {
  const timestamp = Date.now()
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const parts = [prefix]
  if (userId) parts.push(userId)
  parts.push(`${timestamp}-${sanitizedName}`)
  return parts.join('/')
}
