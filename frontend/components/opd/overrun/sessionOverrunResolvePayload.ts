import type { OverrunAction, PerRowOverride } from "@/lib/api";

export type RowOverrideState = { action: OverrunAction; rescheduleTo: string };

export function buildSessionOverrunOverridesPayload(
  rows: { id: string }[],
  bulkAction: OverrunAction,
  perRowOverrides: Record<string, RowOverrideState>,
  effectiveAction: (rowId: string) => OverrunAction
): PerRowOverride[] {
  return rows
    .filter((row) => {
      const action = effectiveAction(row.id);
      const isOverride =
        perRowOverrides[row.id]?.action !== undefined &&
        perRowOverrides[row.id]?.action !== bulkAction;
      const isReschedulePerPatient = action === "reschedule_per_patient";
      return isOverride || isReschedulePerPatient;
    })
    .map((row) => ({
      appointmentId: row.id,
      action: effectiveAction(row.id),
      rescheduleTo: perRowOverrides[row.id]?.rescheduleTo || undefined,
    }));
}
