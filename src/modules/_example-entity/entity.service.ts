import { getPrisma } from '../../db/prisma.js'
import {
  createItem,
  getItemOrThrow,
  updateItem,
  softDeleteItem,
  getTableName,
  type BaseEntity,
} from '../../db/dynamodb.js'
import { conflict } from '../../lib/errors.js'
import { publishEvent } from '../../lib/sns.js'
import { getEnv } from '../../config/env.js'
import { getUser, getRequestContext } from '../../lib/request-context.js'
import { logger } from '../../lib/logger/index.js'
import { getAuditService } from '../../audit/index.js'
import type { CreateAccountInput, UpdateAccountInput, ListAccountsQuery } from './entity.schema.js'

// DynamoDB entity type (audit fields removed — handled by decoupled audit system)
interface AccountEntity extends BaseEntity {
  name: string
  email: string
  metadata?: Record<string, unknown>
}

const DOMAIN = 'account'
const TABLE_NAME = getTableName('accounts')

// Define event types for this module
// Each service should define their own following the pattern: {domain}.{entity}.{action}
const AccountEventTypes = {
  ACCOUNT_CREATED: 'accounts.account.created',
  ACCOUNT_UPDATED: 'accounts.account.updated',
  ACCOUNT_DELETED: 'accounts.account.deleted',
} as const

// ============================================
// Service functions
// ============================================

export async function createAccount(input: CreateAccountInput): Promise<AccountEntity> {
  const prisma = getPrisma()
  const user = getUser()

  // Check for duplicate email in PostgreSQL (faster for lookups)
  const existing = await prisma.account.findUnique({
    where: { email: input.email },
  })

  if (existing) {
    throw conflict(`Account with email ${input.email} already exists`)
  }

  // Create in DynamoDB (primary)
  const account = await createItem<AccountEntity>({
    tableName: TABLE_NAME,
    item: {
      name: input.name,
      email: input.email,
      metadata: input.metadata,
      active: true,
    },
  })

  // Sync to PostgreSQL (read replica)
  await prisma.account.create({
    data: {
      id: account.id,
      name: account.name,
      email: account.email,
      metadata: account.metadata,
      version: account.version,
      active: account.active,
      createdAt: new Date(account.createdAt),
      updatedAt: new Date(account.updatedAt),
    },
  })

  // Audit after successful create (non-blocking)
  const auditService = getAuditService()
  auditService
    ?.audit({
      domain: DOMAIN,
      entityId: account.id,
      operation: 'CREATE',
      performedBy: user?.id ?? 'system',
      snapshotBefore: null,
      snapshotAfter: account,
      metadata: getAuditMetadata(),
    })
    .catch((err: unknown) => {
      logger.error('Audit failed', { error: err, entityId: account.id })
    })

  // Publish event
  await publishEvent(getEnv().SNS_TOPIC_ARN, AccountEventTypes.ACCOUNT_CREATED, {
    accountId: account.id,
    email: account.email,
  })

  logger.info('Account created', { metadata: { accountId: account.id } })

  return account
}

export async function getAccount(id: string): Promise<AccountEntity> {
  const account = await getItemOrThrow<AccountEntity>({
    tableName: TABLE_NAME,
    id,
  })

  return account
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export async function listAccounts(
  query: ListAccountsQuery
): Promise<PaginatedResult<AccountEntity>> {
  const prisma = getPrisma()
  const { page, pageSize, search, orderBy, orderDirection, active } = query

  const where = {
    active,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { [orderBy]: orderDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.account.count({ where }),
  ])

  return {
    data: accounts.map((a: Account) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      metadata: a.metadata as Record<string, unknown> | undefined,
      version: a.version,
      active: a.active,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function updateAccount(id: string, input: UpdateAccountInput): Promise<AccountEntity> {
  const prisma = getPrisma()
  const user = getUser()

  const existing = await getItemOrThrow<AccountEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Check email uniqueness if changing email
  if (input.email && input.email !== existing.email) {
    const duplicate = await prisma.account.findUnique({
      where: { email: input.email },
    })
    if (duplicate) {
      throw conflict(`Account with email ${input.email} already exists`)
    }
  }

  // Update in DynamoDB with optimistic locking
  const updated = await updateItem<AccountEntity>({
    tableName: TABLE_NAME,
    id,
    version: existing.version,
    updates: input,
  })

  // Sync to PostgreSQL
  await prisma.account.update({
    where: { id },
    data: {
      name: updated.name,
      email: updated.email,
      metadata: updated.metadata,
      version: updated.version,
      updatedAt: new Date(updated.updatedAt),
    },
  })

  // Audit after successful update (non-blocking)
  const auditService = getAuditService()
  auditService
    ?.audit({
      domain: DOMAIN,
      entityId: id,
      operation: 'UPDATE',
      performedBy: user?.id ?? 'system',
      snapshotBefore: existing,
      snapshotAfter: updated,
      metadata: getAuditMetadata(),
    })
    .catch((err: unknown) => {
      logger.error('Audit failed', { error: err, entityId: id })
    })

  // Publish event
  await publishEvent(getEnv().SNS_TOPIC_ARN, AccountEventTypes.ACCOUNT_UPDATED, {
    accountId: id,
  })

  logger.info('Account updated', { metadata: { accountId: id } })

  return updated
}

export async function deleteAccount(id: string): Promise<void> {
  const prisma = getPrisma()
  const user = getUser()

  const existing = await getItemOrThrow<AccountEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Soft delete in DynamoDB
  await softDeleteItem({
    tableName: TABLE_NAME,
    id,
    version: existing.version,
  })

  // Soft delete in PostgreSQL
  await prisma.account.update({
    where: { id },
    data: { active: false },
  })

  // Audit after successful delete (non-blocking)
  const auditService = getAuditService()
  auditService
    ?.audit({
      domain: DOMAIN,
      entityId: id,
      operation: 'DELETE',
      performedBy: user?.id ?? 'system',
      snapshotBefore: existing,
      snapshotAfter: null,
      metadata: getAuditMetadata(),
    })
    .catch((err: unknown) => {
      logger.error('Audit failed', { error: err, entityId: id })
    })

  // Publish event
  await publishEvent(getEnv().SNS_TOPIC_ARN, AccountEventTypes.ACCOUNT_DELETED, {
    accountId: id,
  })

  logger.info('Account deleted', { metadata: { accountId: id } })
}

// Helper to extract audit metadata from request context
function getAuditMetadata(): Record<string, unknown> {
  const ctx = getRequestContext()
  return {
    requestId: ctx?.requestId,
    ip: undefined, // Available from req.ip in controller if needed
    userAgent: undefined, // Available from req headers in controller if needed
  }
}
