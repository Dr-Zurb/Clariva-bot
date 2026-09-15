import type { Appointment } from "@/types/appointment";

/**
 * Glanceable visit-prep completeness for `/desk/today`.
 *
 * Dated GET /api/v1/appointments carries presence flags. Unknown slots
 * stay hollow when a flag is absent so the three-dot layout stays stable.
 */

export const DESK_PREP_SLOTS = ["vitals", "history", "reports"] as const;

export type DeskPrepSlot = (typeof DESK_PREP_SLOTS)[number];

/** filled = captured; empty = known missing; unused = not knowable yet. */
export type DeskPrepFill = "filled" | "empty" | "unused";

export type DeskPrepState = {
  vitals: DeskPrepFill;
  history: DeskPrepFill;
  reports: DeskPrepFill;
};

export type DeskTodayRow = Appointment & {
  deskPrep: DeskPrepState;
  /** Present on `/appointments/lab-pending` rows only. */
  daysPending?: number;
  reportUploaded?: boolean;
  labOrders?: Array<{
    orderId: string;
    label: string;
    kind: string;
    status?: string;
    reasonCode?: string | null;
    reasonNote?: string | null;
    documentId?: string | null;
  }>;
};

/**
 * Presence flags from the dated appointments list. Read them if present;
 * never fetch vitals / history / documents per row.
 */
export type DeskPrepSource = {
  has_vitals?: boolean | null;
  has_desk_vitals?: boolean | null;
  vitals_captured_at?: string | null;
  has_visit_documents?: boolean | null;
  visit_document_count?: number | null;
  has_history?: boolean | null;
  has_history_submission?: boolean | null;
  history_submission_id?: string | null;
};

export const DESK_PREP_LABELS: Record<DeskPrepSlot, string> = {
  vitals: "Vitals",
  history: "History",
  reports: "Reports",
};

export const DESK_PREP_LETTERS: Record<DeskPrepSlot, string> = {
  vitals: "V",
  history: "H",
  reports: "D",
};

export const EMPTY_DESK_PREP: DeskPrepState = {
  vitals: "unused",
  history: "unused",
  reports: "unused",
};

function vitalsFill(source: DeskPrepSource): DeskPrepFill {
  if (typeof source.has_desk_vitals === "boolean") {
    return source.has_desk_vitals ? "filled" : "empty";
  }
  if (typeof source.has_vitals === "boolean") {
    return source.has_vitals ? "filled" : "empty";
  }
  if (source.vitals_captured_at) return "filled";
  return "unused";
}

function reportsFill(source: DeskPrepSource): DeskPrepFill {
  if (typeof source.has_visit_documents === "boolean") {
    return source.has_visit_documents ? "filled" : "empty";
  }
  if (typeof source.visit_document_count === "number") {
    return source.visit_document_count > 0 ? "filled" : "empty";
  }
  return "unused";
}

function historyFill(source: DeskPrepSource): DeskPrepFill {
  if (typeof source.has_history_submission === "boolean") {
    return source.has_history_submission ? "filled" : "empty";
  }
  if (typeof source.has_history === "boolean") {
    return source.has_history ? "filled" : "empty";
  }
  if (source.history_submission_id) return "filled";
  return "unused";
}

function fillSpoken(fill: DeskPrepFill): string {
  if (fill === "filled") return "done";
  if (fill === "empty") return "needed";
  return "unknown";
}

/** Pure mapper — attach the result as `deskPrep` on each today row. */
export function deskPrepFromFlags(
  row: Appointment | DeskPrepSource | null | undefined
): DeskPrepState {
  if (!row) return { ...EMPTY_DESK_PREP };
  const source = row as DeskPrepSource;
  return {
    vitals: vitalsFill(source),
    history: historyFill(source),
    reports: reportsFill(source),
  };
}

export const deskPrepFromRow = deskPrepFromFlags;

export function deskPrepAriaLabel(prep: DeskPrepState): string {
  return (
    `Visit prep. ${DESK_PREP_LABELS.vitals} ${fillSpoken(prep.vitals)}. ` +
    `${DESK_PREP_LABELS.history} ${fillSpoken(prep.history)}. ` +
    `${DESK_PREP_LABELS.reports} ${fillSpoken(prep.reports)}.`
  );
}
