/**
 * Single source of truth for social-history clinical thresholds.
 *
 * **Region:** values are applied at bootstrap from
 * `frontend/lib/config/regions/` via `apply-clinical-region.ts`.
 * See `docs/Reference/engineering/REGION-SPECIFIC-CONFIG.md`.
 *
 * `DEFAULT_SOCIAL_HISTORY_THRESHOLDS` is the UK/global reference baseline.
 * `SOCIAL_HISTORY_THRESHOLDS` is the mutable runtime object hints read at call time.
 */

export interface SocialHistoryThresholds {
  /** Weekly intake above this = hazardous (UK default 14). */
  hazardousUnitsPerWeek: number;
  /** Max units in one sitting at/above this = binge-pattern hint (default 6). */
  bingeUnitsPerSession: number;
  /** Pack-years at/above = elevated COPD/CV hint (default 20). */
  packYearsElevated: number;
  /** Pack-years at/above = LDCT screening hint (default 30). */
  packYearsLdct: number;
  /** AUDIT-C total at/above = screen positive (default 4). */
  auditCPositive: number;
  /** Full AUDIT total at/above = hazardous drinking (WHO default 8). */
  auditFullHazardous: number;
  /** Full AUDIT total at/above = harmful drinking (WHO default 16). */
  auditFullHarmful: number;
  /** Full AUDIT total at/above = possible dependence (WHO default 20). */
  auditFullDependence: number;
  /** CAGE yes-count at/above = screen positive (default 2). */
  cagePositive: number;
}

export const DEFAULT_SOCIAL_HISTORY_THRESHOLDS: SocialHistoryThresholds = {
  hazardousUnitsPerWeek: 14,
  bingeUnitsPerSession: 6,
  packYearsElevated: 20,
  packYearsLdct: 30,
  auditCPositive: 4,
  auditFullHazardous: 8,
  auditFullHarmful: 16,
  auditFullDependence: 20,
  cagePositive: 2,
};

/** Mutable config seam — assign fields for locale overrides; hints read at call time. */
export const SOCIAL_HISTORY_THRESHOLDS: SocialHistoryThresholds = {
  ...DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
};
