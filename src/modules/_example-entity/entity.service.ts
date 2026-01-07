import { getPrisma } from '../../db/prisma.js'
import {
  createItem,
  getItemOrThrow,
  updateItem,
  softDeleteItem,
  getTableName,
  type BaseEntity,
} from '../../db/dynamodb.js'
import { notFound, conflict } from '../../lib/errors.js'
import { publishEvent, EventTypes } from '../../lib/sns.js'
import { getUser } from '../../lib/request-context.js'
import { logger } from '../../lib/logger.js'
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
} from './account.schema.js'

// DynamoDB entity type
interface AccountEntity extends BaseEntity {
  name: string
  email: string
  metadata?: Record<string, unknown>
  auditTrail: AuditEntry[]
}

interface AuditEntry {
  modifiedBy: string
  modifiedAt: string
  changes: Record<string, { before: unknown; after: unknown }>
}

const TABLE_NAME = getTableName('accounts')

// ============================================
// Service functions
// ============================================

export async function createAccount(input: CreateAccountInput): Promise<AccountEntity> {
  const prisma = getPrisma()

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
      auditTrail: [],
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

  // Publish event
  await publishEvent(EventTypes.ACCOUNT_CREATED, {
    accountId: account.id,
    email: account.email,
  })

  logger.info({ accountId: account.id }, 'Account created')

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
    data: accounts.map(a => ({
      id: a.id,
      name: a.name,
      email: a.email,
      metadata: a.metadata as Record<string, unknown> | undefined,
      version: a.version,
      active: a.active,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      auditTrail: (a.auditTrail as AuditEntry[]) || [],
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function updateAccount(
  id: string,
  input: UpdateAccountInput
): Promise<AccountEntity> {
  const prisma = getPrisma()
  const user = getUser()

  // Get existing account from DynamoDB
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

  // Build changes for audit trail
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && existing[key as keyof AccountEntity] !== value) {
      changes[key] = {
        before: existing[key as keyof AccountEntity],
        after: value,
      }
    }
  }

  // Update in DynamoDB with optimistic locking
  const auditEntry: AuditEntry = {
    modifiedBy: user?.sub ?? 'system',
    modifiedAt: new Date().toISOString(),
    changes,
  }

  const updated = await updateItem<AccountEntity>({
    tableName: TABLE_NAME,
    id,
    version: existing.version,
    updates: {
      ...input,
      auditTrail: [...existing.auditTrail, auditEntry],
    },
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
      auditTrail: updated.auditTrail,
    },
  })

  // Publish event
  await publishEvent(EventTypes.ACCOUNT_UPDATED, {
    accountId: id,
    changes,
  })

  logger.info({ accountId: id }, 'Account updated')

  return updated
}

export async function deleteAccount(id: string): Promise<void> {
  const prisma = getPrisma()

  // Get existing to verify it exists
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

  // Publish event
  await publishEvent(EventTypes.ACCOUNT_DELETED, {
    accountId: id,
  })

  logger.info({ accountId: id }, 'Account deleted')
}
