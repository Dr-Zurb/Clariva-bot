/**
 * Doctor medicine-pack suggestion routes.
 *
 * Mounted at /api/v1/doctors/me/medicine-pack-suggestions.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  dismissMyMedicinePackSuggestionHandler,
  listMyMedicinePackSuggestionsHandler,
  markMyMedicinePackSuggestionsSeenHandler,
} from '../../../controllers/doctor-medicine-pack-suggestion-controller';

const router = Router();

router.get('/', authenticateToken, listMyMedicinePackSuggestionsHandler);
router.post('/dismiss', authenticateToken, dismissMyMedicinePackSuggestionHandler);
router.post('/seen', authenticateToken, markMyMedicinePackSuggestionsSeenHandler);

export default router;
