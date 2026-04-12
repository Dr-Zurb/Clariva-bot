/**
 * learn-04: Stable-pattern policy suggestions + autobook policy records.
 *
 * GET  /api/v1/service-match-learning/policy-suggestions
 * GET  /api/v1/service-match-learning/autobook-policies
 * POST /api/v1/service-match-learning/policy-suggestions/:id/accept
 * POST /api/v1/service-match-learning/policy-suggestions/:id/decline
 * POST /api/v1/service-match-learning/policy-suggestions/:id/snooze
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  acceptPolicySuggestionHandler,
  declinePolicySuggestionHandler,
  disableAutobookPolicyHandler,
  listAutobookPoliciesHandler,
  listPolicySuggestionsHandler,
  snoozePolicySuggestionHandler,
} from '../../../controllers/service-match-learning-policy-controller';

const router = Router();

router.get('/policy-suggestions', authenticateToken, listPolicySuggestionsHandler);
router.get('/autobook-policies', authenticateToken, listAutobookPoliciesHandler);
router.post('/autobook-policies/:id/disable', authenticateToken, disableAutobookPolicyHandler);
router.post('/policy-suggestions/:id/accept', authenticateToken, acceptPolicySuggestionHandler);
router.post('/policy-suggestions/:id/decline', authenticateToken, declinePolicySuggestionHandler);
router.post('/policy-suggestions/:id/snooze', authenticateToken, snoozePolicySuggestionHandler);

export default router;
