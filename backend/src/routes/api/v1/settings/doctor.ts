/**
 * Doctor Settings Routes (e-task-2)
 *
 * GET    /api/v1/settings/doctor - Get doctor's settings (auth required)
 * PATCH  /api/v1/settings/doctor - Partial update (auth required)
 *
 * CC-09: Cockpit layout preset CRUD
 * GET    /api/v1/settings/doctor/cockpit-presets         - list presets
 * PUT    /api/v1/settings/doctor/cockpit-presets         - replace full array
 * DELETE /api/v1/settings/doctor/cockpit-presets/:id     - remove one preset
 */

import { Request, Response, NextFunction, Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth';
import {
  getDoctorSettingsHandler,
  patchDoctorSettingsHandler,
} from '../../../../controllers/settings-controller';
import {
  getCockpitPresetsForUser,
  putCockpitPresetsForUser,
  deleteCockpitPresetForUser,
} from '../../../../services/doctor-settings-service';
import type { CockpitLayoutPreset } from '../../../../types/doctor-settings';

const router = Router();

router.get('/', authenticateToken, getDoctorSettingsHandler);
router.patch('/', authenticateToken, patchDoctorSettingsHandler);

// GET /v1/settings/doctor/cockpit-presets
router.get('/cockpit-presets', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    let presets = await getCockpitPresetsForUser(userId);
    const kind =
      typeof req.query.kind === 'string' && req.query.kind.trim().length > 0
        ? req.query.kind.trim()
        : undefined;
    if (kind) {
      presets = presets.filter((p) => {
        const layout = p.layout as { kind?: string };
        return layout?.kind === kind;
      });
    }
    res.json({ presets });
  } catch (err) {
    next(err);
  }
});

// PUT /v1/settings/doctor/cockpit-presets
// Body: { presets: CockpitLayoutPreset[] }
router.put('/cockpit-presets', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const body = req.body as { presets?: unknown };
    const presets = await putCockpitPresetsForUser(userId, body.presets as CockpitLayoutPreset[]);
    res.json({ presets });
  } catch (err) {
    next(err);
  }
});

// DELETE /v1/settings/doctor/cockpit-presets/:presetId
router.delete('/cockpit-presets/:presetId', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { presetId } = req.params;
    const presets = await deleteCockpitPresetForUser(userId, presetId);
    res.json({ presets });
  } catch (err) {
    next(err);
  }
});

export default router;
