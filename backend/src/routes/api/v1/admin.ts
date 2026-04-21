/**
 * Admin Routes (Plan 02 · Task 34)
 * --------------------------------
 *
 * Ops-facing endpoints that are not doctor / patient surfaces. v1 ships
 * a single route: `GET /api/v1/admin/archival-preview`, which renders
 * "next N days of candidates for the hide phase + hard-delete phase"
 * from the recording-archival worker's scan helpers.
 *
 * ## Auth
 *
 * v1 re-uses `CRON_SECRET` as a shared-secret gate — the on-call
 * rotation already has it, the ops dashboard that will consume this
 * endpoint runs server-side and can hold it. Not suitable for
 * per-admin per-user auditing; when we land a proper admin-role
 * middleware (separate plan) this route should swap to that.
 */

import { Router, Request, Response } from 'express';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import {
  scanDeleteCandidates,
  scanHideCandidates,
} from '../../../workers/recording-archival-worker';

const router = Router();

/** Hard cap on the preview horizon to avoid unbounded scans. */
const MAX_PREVIEW_DAYS = 60;

function verifyAdminAuth(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.authorization;
  const inlineHeader = req.headers['x-cron-secret'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : inlineHeader;
  return !!token && token === secret;
}

/**
 * GET /api/v1/admin/archival-preview?days=7
 *
 * Returns the hide-phase and hard-delete-phase candidates as-of `now +
 * days`. Default days = env.ARCHIVAL_DRY_RUN_REPORT_DAYS (default 7);
 * capped at 60.
 *
 * Response:
 *   {
 *     asOf: string,
 *     hidePhase:   { candidates: HideCandidate[] },
 *     deletePhase: { candidates: DeleteCandidate[] }
 *   }
 *
 * A note on the "as-of-future" semantics: the preview API asks the
 * worker "what would trigger if we ran at `now + days`?" The worker
 * supports that via its `asOf` parameter. This lets ops see the next
 * week's pending actions before they fire — the core safety review
 * loop that justified shipping this route at all.
 */
router.get('/archival-preview', async (req: Request, res: Response) => {
  if (!verifyAdminAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing admin secret' },
    });
  }

  const rawDays = req.query.days;
  let days = env.ARCHIVAL_DRY_RUN_REPORT_DAYS;
  if (typeof rawDays === 'string' && rawDays.trim() !== '') {
    const parsed = parseInt(rawDays, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ValidationError',
          message: 'days must be a non-negative integer',
        },
      });
    }
    days = Math.min(parsed, MAX_PREVIEW_DAYS);
  }

  const asOf = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const correlationId = `admin-archival-preview-${Date.now()}`;

  try {
    const [hide, del] = await Promise.all([
      scanHideCandidates(asOf),
      scanDeleteCandidates(asOf),
    ]);

    logger.info(
      {
        correlationId,
        days,
        hide: hide.length,
        delete: del.length,
      },
      'admin_archival_preview',
    );

    return res.status(200).json({
      success: true,
      data: {
        asOf: asOf.toISOString(),
        hidePhase: { candidates: hide },
        deletePhase: { candidates: del },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, error: msg },
      'admin_archival_preview_failed',
    );
    return res.status(500).json({
      success: false,
      error: {
        code: 'InternalError',
        message: 'Archival preview failed',
      },
    });
  }
});

export default router;
