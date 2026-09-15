import type { PrescriptionWithRelations } from "@/types/prescription";

export type HistoryNoteState = "superseded" | "closed" | "draft";

export function historyNoteClockIso(rx: PrescriptionWithRelations): string {
  if (typeof rx.issued_at === "string" && rx.issued_at.length > 0) return rx.issued_at;
  if (typeof rx.attested_at === "string" && rx.attested_at.length > 0) {
    return rx.attested_at;
  }
  return rx.created_at;
}

export function historyNoteState(rx: PrescriptionWithRelations): HistoryNoteState {
  if (typeof rx.superseded_by_id === "string" && rx.superseded_by_id.length > 0) {
    return "superseded";
  }
  if (
    (typeof rx.attested_at === "string" && rx.attested_at.length > 0) ||
    (typeof rx.issued_at === "string" && rx.issued_at.length > 0) ||
    (typeof rx.sent_to_patient_at === "string" && rx.sent_to_patient_at.length > 0)
  ) {
    return "closed";
  }
  return "draft";
}

export function historyNoteVersionLabel(
  rx: PrescriptionWithRelations,
): string | null {
  if (typeof rx.version === "number" && Number.isFinite(rx.version) && rx.version >= 1) {
    return `Version ${rx.version}`;
  }
  return null;
}

export function groupHistoryNotesByAppointment(
  items: PrescriptionWithRelations[],
): PrescriptionWithRelations[][] {
  const groups = new Map<string, PrescriptionWithRelations[]>();
  const order: string[] = [];
  for (const rx of items) {
    const key = rx.appointment_id || `rx:${rx.id}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
      order.push(key);
    }
    list.push(rx);
  }
  return order.map((key) => groups.get(key)!);
}
