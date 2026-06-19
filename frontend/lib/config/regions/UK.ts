import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
  type SocialHistoryThresholds,
} from "@/lib/cockpit/social-history-thresholds";

/** UK / global-reference social-history thresholds (NICE-style 14 units/wk). */
export const UK_SOCIAL_HISTORY_THRESHOLDS: SocialHistoryThresholds = {
  ...DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
};

export function applyUkClinicalRegion(): void {
  Object.assign(SOCIAL_HISTORY_THRESHOLDS, UK_SOCIAL_HISTORY_THRESHOLDS);
}
