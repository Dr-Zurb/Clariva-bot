/**
 * Doctor Rx Template Routes (EHR Sub-batch B1 / T2.11).
 *
 * Mounted at /api/v1/rx-templates.
 *
 * Endpoints (all behind authenticateToken — doctor JWT):
 *   GET    /                — list active templates
 *   POST   /                — create
 *   PATCH  /:id             — update (partial)
 *   POST   /:id/use         — atomic counter bump (Apply)
 *   DELETE /:id             — soft-delete (archive)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  archiveRxTemplateHandler,
  createRxTemplateHandler,
  listRxTemplatesHandler,
  recordRxTemplateUseHandler,
  updateRxTemplateHandler,
} from '../../../controllers/rx-template-controller';

const router = Router();

router.get('/', authenticateToken, listRxTemplatesHandler);
router.post('/', authenticateToken, createRxTemplateHandler);
router.patch('/:id', authenticateToken, updateRxTemplateHandler);
router.post('/:id/use', authenticateToken, recordRxTemplateUseHandler);
router.delete('/:id', authenticateToken, archiveRxTemplateHandler);

export default router;
