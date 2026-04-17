/**
 * Task 10 (Plan 03): shared helpers for `catalog_mode === 'single_fee'` pipeline guards.
 *
 * Why centralized:
 *  - Five learning services + matcher + review queue + clarification gate all need the same
 *    "skip when single_fee" semantics. Keeping the predicate + logging in one place avoids drift
 *    (e.g. one callsite checks `!== 'multi_service'` and another checks `=== 'single_fee'` —
 *    for NULL the two diverge). See `task-10-mode-aware-pipeline-skip.md` §Design Constraints.
 *  - Strict `=== 'single_fee'` only. `null` / `'multi_service'` keep pre-Task-10 behavior.
 *  - Logs use a predictable `<stage>.skip.single_fee` name so we can grep/graph them immediately.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import type { CatalogMode } from '../types/doctor-settings';

/** Literal for the single-fee catalog mode. Exported so guards can compare without typos. */
export const SINGLE_FEE_CATALOG_MODE = 'single_fee' as const;

/**
 * Pure predicate: is this doctor in single-fee mode?
 *
 * Returns false for `'multi_service'` and for `null`/`undefined` (undecided doctors keep today's
 * multi-service path). Intentionally does *not* accept arbitrary strings — callers pass the typed
 * `catalog_mode` straight from `doctor_settings`.
 */
export function isSingleFeeMode(
  catalogMode: CatalogMode | null | undefined
): boolean {
  return catalogMode === SINGLE_FEE_CATALOG_MODE;
}

/** Structured log payload shared by every skip breadcrumb. */
export interface SingleFeeSkipLogContext {
  doctorId: string | null | undefined;
  correlationId?: string | null;
  [extra: string]: unknown;
}

/**
 * Emit a structured `<stage>.skip.single_fee` breadcrumb at info level. Keeps every skip
 * observable with a predictable name, so staging dashboards can chart skip rates per pipeline
 * without chasing Git blame through eight files.
 */
export function logSingleFeeSkip(
  stage:
    | 'matcher'
    | 'review'
    | 'learning.ingest'
    | 'learning.assist'
    | 'learning.autobook'
    | 'learning.shadow'
    | 'learning.policy'
    | 'clarification',
  ctx: SingleFeeSkipLogContext
): void {
  logger.info({ ...ctx, stage }, `${stage}.skip.single_fee`);
}

/**
 * Best-effort DB lookup for a doctor's `catalog_mode`. Used by learning-pipeline guards where the
 * caller only has `doctor_id` (no pre-loaded settings). Returns `null` on any read error so the
 * fallback is always "run the full path" (fail-open — we'd rather emit a learning row than silently
 * drop data for a doctor whose mode we can't read).
 */
export async function fetchDoctorCatalogMode(
  doctorId: string,
  correlationId?: string | null,
  clientOverride?: SupabaseClient | null
): Promise<CatalogMode | null> {
  const admin = clientOverride ?? getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId, doctorId },
      'catalog_mode_guard_lookup_no_admin_client'
    );
    return null;
  }

  try {
    const { data, error } = await admin
      .from('doctor_settings')
      .select('catalog_mode')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error) {
      logger.warn(
        {
          correlationId,
          doctorId,
          err: (error as { message?: string }).message ?? String(error),
        },
        'catalog_mode_guard_lookup_failed'
      );
      return null;
    }

    const raw = (data as { catalog_mode?: unknown } | null)?.catalog_mode;
    if (raw === 'single_fee' || raw === 'multi_service') {
      return raw;
    }
    return null;
  } catch (err) {
    logger.warn(
      {
        correlationId,
        doctorId,
        err: err instanceof Error ? err.message : String(err),
      },
      'catalog_mode_guard_lookup_threw'
    );
    return null;
  }
}

/**
 * Convenience wrapper for learning-pipeline guards that only have `doctor_id`: returns `true` when
 * the full learning path should execute, `false` when the caller should early-return and emit a
 * `learning.<stage>.skip.single_fee` breadcrumb. Fail-open on DB errors (see
 * {@link fetchDoctorCatalogMode}).
 */
export async function isLearningActiveForDoctor(
  doctorId: string,
  correlationId?: string | null,
  clientOverride?: SupabaseClient | null
): Promise<boolean> {
  const mode = await fetchDoctorCatalogMode(doctorId, correlationId, clientOverride);
  return !isSingleFeeMode(mode);
}
