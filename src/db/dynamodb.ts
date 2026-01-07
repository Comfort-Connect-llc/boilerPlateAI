import {
  DynamoDBClient,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
  type DeleteCommandInput,
  type QueryCommandInput,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { getEnv } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { conflict, notFound } from '../lib/errors.js'
import { v4 as uuid } from 'uuid'

let docClient: DynamoDBDocumentClient | null = null

export function getDynamoDB(): DynamoDBDocumentClient {
  if (!docClient) {
    const env = getEnv()

    const baseClient = new DynamoDBClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
      ...(env.DYNAMODB_ENDPOINT && { endpoint: env.DYNAMODB_ENDPOINT }),
    })

    docClient = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
      },
    })
  }

  return docClient
}

export function getTableName(baseName: string): string {
  const env = getEnv()
  return `${env.DYNAMODB_TABLE_PREFIX}-${baseName}`
}

// Generic CRUD operations for DynamoDB

export interface BaseEntity {
  id: string
  version: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateOptions<T> {
  tableName: string
  item: Omit<T, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { id?: string }
}

export async function createItem<T extends BaseEntity>(
  options: CreateOptions<T>
): Promise<T> {
  const { tableName, item } = options
  const now = new Date().toISOString()

  const newItem = {
    ...item,
    id: item.id || uuid(),
    version: 1,
    active: item.active ?? true,
    createdAt: now,
    updatedAt: now,
  } as T

  const params: PutCommandInput = {
    TableName: tableName,
    Item: newItem,
    ConditionExpression: 'attribute_not_exists(id)',
  }

  await getDynamoDB().send(new PutCommand(params))
  logger.debug({ tableName, id: newItem.id }, 'Created item in DynamoDB')

  return newItem
}

export interface GetOptions {
  tableName: string
  id: string
}

export async function getItem<T extends BaseEntity>(
  options: GetOptions
): Promise<T | null> {
  const { tableName, id } = options

  const params: GetCommandInput = {
    TableName: tableName,
    Key: { id },
  }

  const result = await getDynamoDB().send(new GetCommand(params))
  return (result.Item as T) || null
}

export async function getItemOrThrow<T extends BaseEntity>(
  options: GetOptions
): Promise<T> {
  const item = await getItem<T>(options)
  if (!item || !item.active) {
    throw notFound(`Item with id ${options.id} not found`)
  }
  return item
}

export interface UpdateOptions<T> {
  tableName: string
  id: string
  version: number
  updates: Partial<Omit<T, 'id' | 'version' | 'createdAt'>>
}

export async function updateItem<T extends BaseEntity>(
  options: UpdateOptions<T>
): Promise<T> {
  const { tableName, id, version, updates } = options
  const now = new Date().toISOString()

  // Build update expression dynamically
  const updateExpressions: string[] = ['#version = :newVersion', '#updatedAt = :updatedAt']
  const expressionAttributeNames: Record<string, string> = {
    '#version': 'version',
    '#updatedAt': 'updatedAt',
  }
  const expressionAttributeValues: Record<string, unknown> = {
    ':currentVersion': version,
    ':newVersion': version + 1,
    ':updatedAt': now,
  }

  let idx = 0
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'version' && key !== 'createdAt') {
      const attrName = `#attr${idx}`
      const attrValue = `:val${idx}`
      updateExpressions.push(`${attrName} = ${attrValue}`)
      expressionAttributeNames[attrName] = key
      expressionAttributeValues[attrValue] = value
      idx++
    }
  }

  const params: UpdateCommandInput = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ConditionExpression: '#version = :currentVersion',
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }

  try {
    const result = await getDynamoDB().send(new UpdateCommand(params))
    logger.debug({ tableName, id }, 'Updated item in DynamoDB')
    return result.Attributes as T
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      throw conflict(`Item ${id} was modified by another process. Please retry.`)
    }
    throw error
  }
}

export interface SoftDeleteOptions {
  tableName: string
  id: string
  version: number
}

export async function softDeleteItem<T extends BaseEntity>(
  options: SoftDeleteOptions
): Promise<T> {
  return updateItem<T>({
    ...options,
    updates: { active: false } as Partial<Omit<T, 'id' | 'version' | 'createdAt'>>,
  })
}

export interface QueryOptions {
  tableName: string
  indexName?: string
  keyCondition: string
  expressionAttributeValues: Record<string, unknown>
  expressionAttributeNames?: Record<string, string>
  filterExpression?: string
  limit?: number
  scanIndexForward?: boolean
  exclusiveStartKey?: Record<string, unknown>
}

export async function queryItems<T>(options: QueryOptions): Promise<{
  items: T[]
  lastEvaluatedKey?: Record<string, unknown>
}> {
  const params: QueryCommandInput = {
    TableName: options.tableName,
    IndexName: options.indexName,
    KeyConditionExpression: options.keyCondition,
    ExpressionAttributeValues: options.expressionAttributeValues,
    ExpressionAttributeNames: options.expressionAttributeNames,
    FilterExpression: options.filterExpression,
    Limit: options.limit,
    ScanIndexForward: options.scanIndexForward,
    ExclusiveStartKey: options.exclusiveStartKey,
  }

  const result = await getDynamoDB().send(new QueryCommand(params))

  return {
    items: (result.Items as T[]) || [],
    lastEvaluatedKey: result.LastEvaluatedKey,
  }
}

export async function healthCheckDynamoDB(tableName: string): Promise<boolean> {
  try {
    const client = getDynamoDB()
    // Access the underlying DynamoDB client for DescribeTable
    const baseClient = new DynamoDBClient({
      region: getEnv().AWS_REGION,
    })
    await baseClient.send(new DescribeTableCommand({ TableName: tableName }))
    return true
  } catch {
    return false
  }
}
