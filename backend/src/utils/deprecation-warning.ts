/**
 * Plan 03 · Task 11 (legacy `appointment_fee_minor` deprecation, Phase 1).
 *
 * Flag-gated, deduplicating one-shot deprecation warning helper. Wired into
 * classified legacy call sites so developers see them light up in dev/staging
 * logs without adding noise to production while Phase 2 migrations are in flight.
 *
 * Conventions:
 *  - `siteId` is a stable, grep-friendly tag like
 *    `appointment_fee_minor.render.ai_context`. Keep one siteId per physical
 *    call site so the dedup set correctly emits once per site, not once per
 *    deprecated field.
 *  - Message text is a generic string — no PHI, no request-scoped variables —
 *    because the log line is not request-correlated by design. If you need
 *    per-request breadcrumbs, emit a separate `logger.debug` at the call site.
 *  - The task spec uses the term "console.warn"; the codebase standard is the
 *    project logger (pino), so this helper emits a structured `logger.warn`
 *    instead. Semantically equivalent, consistent with the rest of the backend.
 *
 * See `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md`.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * In-memory set of already-warned `siteId`s for this process lifetime.
 * Exported for tests to reset between cases via `__resetDeprecationWarningsForTests`.
 */
const WARNED_SITE_IDS = new Set<string>();

/**
 * Emit a structured deprecation warning at most once per `siteId` per process.
 *
 * No-op when `env.DEPRECATION_WARNINGS_ENABLED` is false (production default).
 * When enabled, the first call for a given `siteId` emits:
 *   `logger.warn({ siteId, deprecation: true, ... }, message)`
 * and subsequent calls for the same `siteId` return silently.
 *
 * @param siteId  stable tag identifying the physical call site, e.g.
 *                `appointment_fee_minor.render.ai_context`.
 * @param message human-readable guidance pointing to the Phase 2 migration
 *                target or deprecation doc. No PHI, no per-request data.
 */
export function warnDeprecation(siteId: string, message: string): void {
  if (!env.DEPRECATION_WARNINGS_ENABLED) {
    return;
  }
  if (WARNED_SITE_IDS.has(siteId)) {
    return;
  }
  WARNED_SITE_IDS.add(siteId);
  logger.warn(
    { siteId, deprecation: true },
    `deprecation: ${siteId} — ${message}`
  );
}

/**
 * Test-only helper: clear the dedup set so a single suite can exercise
 * "first call warns" semantics across multiple cases. NOT intended for
 * production use — prod code must never reset the set (that would re-noise logs).
 */
export function __resetDeprecationWarningsForTests(): void {
  WARNED_SITE_IDS.clear();
}
