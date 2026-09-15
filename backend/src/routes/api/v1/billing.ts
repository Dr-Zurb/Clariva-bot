/**
 * Admin billing routes — /api/v1/admin/billing/...
 * Gated by requireAdminJwtOrSecret. Doctor JWT does not belong here.
 */

import { Router } from 'express';
import {
  billingReconciliationHandler,
  billingRollupHandler,
  invoicePdfHandler,
  issueInvoiceHandler,
} from '../../../controllers/billing-controller';
import { requireAdminJwtOrSecret } from '../../../middleware/require-admin';

const router = Router();

router.use(requireAdminJwtOrSecret);

router.get('/rollup', billingRollupHandler);
router.get('/reconciliation', billingReconciliationHandler);
router.post('/invoices', issueInvoiceHandler);
router.get('/invoices/:id/pdf', invoicePdfHandler);

export default router;
