/**
 * DrugAutocomplete personal ranking (rx-polish-favorites · rxf-05).
 *
 * Re-sorts API results by doctor usage_count DESC, preserving the server's
 * prefix/brand/contains order as the tiebreaker (stable by original index).
 */

import type { DrugMasterRow } from "@/types/drug-master";

export function sortDrugResultsByPersonalUsage(
  results: DrugMasterRow[],
  scores: Record<string, number>,
): DrugMasterRow[] {
  if (results.length <= 1) return results;

  const hasAnyScore = results.some((r) => (scores[r.id] ?? 0) > 0);
  if (!hasAnyScore) return results;

  return results
    .map((drug, index) => ({ drug, index }))
    .sort((a, b) => {
      const aScore = scores[a.drug.id] ?? 0;
      const bScore = scores[b.drug.id] ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return a.index - b.index;
    })
    .map(({ drug }) => drug);
}
