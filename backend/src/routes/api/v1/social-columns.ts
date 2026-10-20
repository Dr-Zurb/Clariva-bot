/**
 * Social columns (soc-20).
 * Mounted at /api/v1/social/columns
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createSocialColumnHandler,
  deleteSocialColumnHandler,
  listSocialColumnsHandler,
  renameSocialColumnHandler,
} from '../../../controllers/social-card-controller';

const router = Router();

router.get('/', authenticateToken, listSocialColumnsHandler);
router.post('/', authenticateToken, createSocialColumnHandler);
router.patch('/:id', authenticateToken, renameSocialColumnHandler);
router.delete('/:id', authenticateToken, deleteSocialColumnHandler);

export default router;
