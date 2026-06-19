import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
  type SocialHistoryThresholds,
} from "@/lib/cockpit/social-history-thresholds";

/**
 * India social-history clinical thresholds.
 *
 * hazardousUnitsPerWeek: 21 — higher than UK 14 because peg-based weekly
 * estimates in Indian OPD often use larger per-occasion pours; configurable
 * here rather than scattered call sites (sh-11 India seam).
 *
 * Screening tools (AUDIT/CAGE) keep WHO defaults unless India-specific
 * guidance says otherwise.
 */
export const INDIA_SOCIAL_HISTORY_THRESHOLDS: SocialHistoryThresholds = {
  ...DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  hazardousUnitsPerWeek: 21,
};

export function applyIndiaClinicalRegion(): void {
  Object.assign(SOCIAL_HISTORY_THRESHOLDS, INDIA_SOCIAL_HISTORY_THRESHOLDS);
}
