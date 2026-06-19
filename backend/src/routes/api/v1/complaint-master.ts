/**
 * Complaint master routes (subjective-tab · subj-06, subj-14)
 * GET  /api/v1/complaints/search?q=&limit=
 * POST /api/v1/complaints/parse        (subj-14 — gated AI free-text parse)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  parseComplaintHandler,
  searchComplaintsHandler,
} from '../../../controllers/complaint-master-controller';

const router = Router();

router.get('/search', authenticateToken, searchComplaintsHandler);
router.post('/parse', authenticateToken, parseComplaintHandler);

export default router;
