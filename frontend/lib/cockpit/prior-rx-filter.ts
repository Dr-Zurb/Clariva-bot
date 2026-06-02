import type { PrescriptionWithRelations } from "@/types/prescription";

export type PriorRxChip = "all" | "active-condition" | "last-30-days" | "same-diagnosis";

export interface PriorRxFilterContext {
  chip: PriorRxChip;
  search: string;
  currentDx: string;
  activeConditions: string[];
}

export function filterPriorRxList(
  rxes: PrescriptionWithRelations[],
  ctx: PriorRxFilterContext,
): PrescriptionWithRelations[] {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  return rxes.filter((rx) => {
    switch (ctx.chip) {
      case "all":
        break;
      case "last-30-days": {
        const ts = new Date(rx.created_at).getTime();
        if (!Number.isFinite(ts) || ts < thirtyDaysAgo) return false;
        break;
      }
      case "same-diagnosis": {
        if (!ctx.currentDx.trim()) return false;
        const dx = (rx.provisional_diagnosis ?? "").toLowerCase();
        if (!dx.includes(ctx.currentDx.toLowerCase())) return false;
        break;
      }
      case "active-condition": {
        if (ctx.activeConditions.length === 0) return false;
        const dx = (rx.provisional_diagnosis ?? "").toLowerCase();
        const matches = ctx.activeConditions.some((c) =>
          dx.includes(c.toLowerCase()),
        );
        if (!matches) return false;
        break;
      }
    }

    if (ctx.search.trim()) {
      const needle = ctx.search.toLowerCase();
      const hasMatch = (rx.prescription_medicines ?? []).some((m) =>
        (m.medicine_name ?? "").toLowerCase().includes(needle),
      );
      if (!hasMatch) return false;
    }

    return true;
  });
}

export function canEnableChip(
  chip: PriorRxChip,
  ctx: Pick<PriorRxFilterContext, "currentDx" | "activeConditions">,
): boolean {
  if (chip === "same-diagnosis") return ctx.currentDx.trim().length > 0;
  if (chip === "active-condition") return ctx.activeConditions.length > 0;
  return true;
}
