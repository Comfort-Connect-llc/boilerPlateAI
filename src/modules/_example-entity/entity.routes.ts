import { Router } from 'express'
import { validate } from '../../lib/validation.js'
import { requirePermissions } from '../../middleware/auth.js'
import * as accountController from './account.controller.js'
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsQuerySchema,
  accountIdParamSchema,
} from './account.schema.js'

const router = Router()

// List accounts
router.get(
  '/',
  requirePermissions('read:accounts'),
  validate({ query: listAccountsQuerySchema }),
  accountController.listAccounts
)

// Get single account
router.get(
  '/:id',
  requirePermissions('read:accounts'),
  validate({ params: accountIdParamSchema }),
  accountController.getAccount
)

// Create account
router.post(
  '/',
  requirePermissions('write:accounts'),
  validate({ body: createAccountSchema }),
  accountController.createAccount
)

// Update account
router.put(
  '/:id',
  requirePermissions('write:accounts'),
  validate({
    params: accountIdParamSchema,
    body: updateAccountSchema,
  }),
  accountController.updateAccount
)

// Delete account (soft delete)
router.delete(
  '/:id',
  requirePermissions('delete:accounts'),
  validate({ params: accountIdParamSchema }),
  accountController.deleteAccount
)

export default router
