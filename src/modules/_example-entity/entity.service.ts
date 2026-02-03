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
import { publishEvent, ExampleEventTypes } from '../../lib/sns.js'
import { getUser, getRequestId } from '../../lib/request-context.js'
import { logger } from '../../lib/logger.js'
import { auditService } from '../../lib/audit/index.js'
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
} from './account.schema.js'

// DynamoDB entity type - no longer includes auditTrail (handled separately)
interface AccountEntity extends BaseEntity {
  name: string
  email: string
  metadata?: Record<string, unknown>
}

const TABLE_NAME = getTableName('accounts')
const ENTITY_TYPE = 'Account'

// ============================================
// Service functions
// ============================================

export async function createAccount(input: CreateAccountInput): Promise<AccountEntity> {
  const prisma = getPrisma()
  const user = getUser()
  const userId = user?.id ?? 'system'

  // Check for duplicate email in PostgreSQL (faster for lookups)
  const existing = await (prisma as any).account?.findUnique({
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
  await (prisma as any).account?.create({
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

  // Audit the creation (non-blocking, never throws)
  await auditService.auditCreate({
    entityType: ENTITY_TYPE,
    entityId: account.id,
    entity: account as unknown as Record<string, unknown>,
    userId,
    metadata: { requestId: getRequestId(), source: 'api' },
  })

  // Publish event
  await publishEvent(undefined, ExampleEventTypes.ENTITY_CREATED, {
    accountId: account.id,
    email: account.email,
  })

  logger.info('Account created', { accountId: account.id })

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
    (prisma as any).account?.findMany({
      where,
      orderBy: { [orderBy]: orderDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }) ?? [],
    (prisma as any).account?.count({ where }) ?? 0,
  ])

  return {
    data: accounts.map((a: any) => ({
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

export async function updateAccount(
  id: string,
  input: UpdateAccountInput
): Promise<AccountEntity> {
  const prisma = getPrisma()
  const user = getUser()
  const userId = user?.id ?? 'system'

  // Get existing account from DynamoDB (this is entityBefore for audit)
  const entityBefore = await getItemOrThrow<AccountEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Check email uniqueness if changing email
  if (input.email && input.email !== entityBefore.email) {
    const duplicate = await (prisma as any).account?.findUnique({
      where: { email: input.email },
    })
    if (duplicate) {
      throw conflict(`Account with email ${input.email} already exists`)
    }
  }

  // Update in DynamoDB with optimistic locking (no audit data in entity)
  const entityAfter = await updateItem<AccountEntity>({
    tableName: TABLE_NAME,
    id,
    version: entityBefore.version,
    updates: input,
  })

  // Sync to PostgreSQL
  await (prisma as any).account?.update({
    where: { id },
    data: {
      name: entityAfter.name,
      email: entityAfter.email,
      metadata: entityAfter.metadata,
      version: entityAfter.version,
      updatedAt: new Date(entityAfter.updatedAt),
    },
  })

  // Audit the update (non-blocking, never throws)
  await auditService.auditUpdate({
    entityType: ENTITY_TYPE,
    entityId: id,
    entityBefore: entityBefore as unknown as Record<string, unknown>,
    entityAfter: entityAfter as unknown as Record<string, unknown>,
    userId,
    metadata: { requestId: getRequestId(), source: 'api' },
  })

  // Publish event
  await publishEvent(undefined, ExampleEventTypes.ENTITY_UPDATED, {
    accountId: id,
  })

  logger.info('Account updated', { accountId: id })

  return entityAfter
}

export async function deleteAccount(id: string): Promise<void> {
  const prisma = getPrisma()
  const user = getUser()
  const userId = user?.id ?? 'system'

  // Get existing to verify it exists (and for audit snapshot)
  const entity = await getItemOrThrow<AccountEntity>({
    tableName: TABLE_NAME,
    id,
  })

  // Soft delete in DynamoDB
  await softDeleteItem({
    tableName: TABLE_NAME,
    id,
    version: entity.version,
  })

  // Soft delete in PostgreSQL
  await (prisma as any).account?.update({
    where: { id },
    data: { active: false },
  })

  // Audit the deletion (non-blocking, never throws)
  await auditService.auditDelete({
    entityType: ENTITY_TYPE,
    entityId: id,
    entity: entity as unknown as Record<string, unknown>,
    userId,
    metadata: { requestId: getRequestId(), source: 'api' },
  })

  // Publish event
  await publishEvent(undefined, ExampleEventTypes.ENTITY_DELETED, {
    accountId: id,
  })

  logger.info('Account deleted', { accountId: id })
}
