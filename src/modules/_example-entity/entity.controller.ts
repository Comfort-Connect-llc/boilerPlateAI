import type { Request, Response, NextFunction } from 'express'
import httpStatus from 'http-status'
import * as accountService from './account.service.js'
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
} from './account.schema.js'

// Wrapper for async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const input: CreateAccountInput = req.body
  const account = await accountService.createAccount(input)

  res.status(httpStatus.CREATED).json({
    message: 'Account created successfully',
    data: account,
  })
})

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const account = await accountService.getAccount(id)

  res.status(httpStatus.OK).json({
    message: 'Account retrieved successfully',
    data: account,
  })
})

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const query: ListAccountsQuery = req.query as unknown as ListAccountsQuery
  const result = await accountService.listAccounts(query)

  res.status(httpStatus.OK).json({
    message: 'Accounts retrieved successfully',
    data: result.data,
    pagination: result.pagination,
  })
})

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const input: UpdateAccountInput = req.body
  const account = await accountService.updateAccount(id, input)

  res.status(httpStatus.OK).json({
    message: 'Account updated successfully',
    data: account,
  })
})

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  await accountService.deleteAccount(id)

  res.status(httpStatus.OK).json({
    message: 'Account deleted successfully',
  })
})
