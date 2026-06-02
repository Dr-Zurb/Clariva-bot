import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";

/** Pending rows in the server snapshot that are not yet shown (and not mid-deferred-commit). */
export function findNewPendingRows(
  incoming: ServiceStaffReviewListItem[],
  current: ServiceStaffReviewListItem[],
  excludedIds: ReadonlySet<string> = new Set()
): ServiceStaffReviewListItem[] {
  const currentIds = new Set(current.map((r) => r.id));
  return incoming.filter((r) => !currentIds.has(r.id) && !excludedIds.has(r.id));
}
