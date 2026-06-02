import { SettingsCardsGridSkeleton } from "@/components/skeletons/primitives";

/**
 * Section-level skeleton for practice-setup landing and all sub-routes.
 * Card grid matches the landing page (primary entry); sub-routes may shift
 * briefly to form layout — acceptable for low-traffic deep settings (np-07).
 */
export default function PracticeSetupLoading() {
  return <SettingsCardsGridSkeleton count={7} />;
}
