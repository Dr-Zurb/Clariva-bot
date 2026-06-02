import type { Appointment, AppointmentStatus, ConsultationModality } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";

export type VisitModalityFilter = "all" | ConsultationModality;
export type VisitStatusFilter = "all" | AppointmentStatus | "scheduled";
export type VisitDateRange = "90d" | "1y" | "all";

export type ConversationChannel = "whatsapp" | "instagram" | "web_chat" | "in_app";

export const CHANNEL_ORDER: ConversationChannel[] = [
  "whatsapp",
  "instagram",
  "web_chat",
  "in_app",
];

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram DM",
  web_chat: "Web chat",
  in_app: "In-app",
};

const MODALITY_LABEL: Record<string, string> = {
  text: "Text",
  voice: "Voice",
  video: "Video",
  in_clinic: "In-clinic",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Scheduled",
  confirmed: "Scheduled",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

export function modalityLabel(modality: string | null | undefined): string {
  if (!modality) return "Video";
  return MODALITY_LABEL[modality] ?? modality;
}

export function statusLabel(status: AppointmentStatus): string {
  return STATUS_LABEL[status] ?? status.replace("_", " ");
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function chiefComplaintForVisit(visit: Appointment): string {
  return truncate(visit.clinical_notes ?? visit.notes ?? null, 80) || "—";
}

export function formatRelativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(day / 365)}y`;
}

export function resolveConversationChannel(appt: Appointment): ConversationChannel {
  const provider = (appt.consultation_session?.provider ?? "").toLowerCase();
  if (provider.includes("whatsapp")) return "whatsapp";
  if (provider.includes("instagram")) return "instagram";
  if (appt.consultation_session?.modality === "text") return "web_chat";
  return "in_app";
}

export function conversationPreview(appt: Appointment): string {
  return truncate(appt.clinical_notes ?? appt.notes ?? null, 80) || "No preview available";
}

/** Phase 1: unread when session is still live (read markers ship in Phase 2). */
export function showUnreadFudge(appt: Appointment): boolean {
  return appt.consultation_session?.status === "live";
}

/** Phase 1: last-reply attribution is approximated from session timing. */
export function lastRepliedByLabel(appt: Appointment): string {
  const rel = formatRelativeShort(appt.appointment_date);
  if (appt.consultation_session?.status === "live") {
    return `Patient · ${rel}`;
  }
  return `You · ${rel}`;
}

export function filterVisits(
  visits: Appointment[],
  modality: VisitModalityFilter,
  status: VisitStatusFilter,
  dateRange: VisitDateRange,
): Appointment[] {
  const now = Date.now();
  const cutoffMs =
    dateRange === "90d"
      ? 90 * 24 * 60 * 60 * 1000
      : dateRange === "1y"
        ? 365 * 24 * 60 * 60 * 1000
        : null;

  return visits.filter((v) => {
    if (modality !== "all") {
      const m = v.consultation_type ?? "video";
      if (m !== modality) return false;
    }
    if (status !== "all") {
      if (status === "scheduled") {
        if (v.status !== "pending" && v.status !== "confirmed") return false;
      } else if (v.status !== status) {
        return false;
      }
    }
    if (cutoffMs != null) {
      const t = new Date(v.appointment_date).getTime();
      if (!Number.isFinite(t) || now - t > cutoffMs) return false;
    }
    return true;
  });
}

export function groupByMonth(visits: Appointment[]): Map<string, Appointment[]> {
  const groups = new Map<string, Appointment[]>();
  for (const v of visits) {
    const d = new Date(v.appointment_date);
    const label = Number.isFinite(d.getTime())
      ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : "Unknown";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(v);
  }
  return groups;
}

export function groupPrescriptionsByYear(
  prescriptions: PrescriptionWithRelations[],
): Map<string, PrescriptionWithRelations[]> {
  const groups = new Map<string, PrescriptionWithRelations[]>();
  for (const rx of prescriptions) {
    const y = new Date(rx.created_at).getFullYear();
    const label = Number.isFinite(y) ? String(y) : "Unknown";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(rx);
  }
  return groups;
}

export function buildRxSummaryText(rx: PrescriptionWithRelations): string {
  const lines: string[] = [];
  if (rx.provisional_diagnosis) lines.push(`Diagnosis: ${rx.provisional_diagnosis}`);
  const meds = rx.prescription_medicines ?? [];
  if (meds.length > 0) {
    lines.push("Medicines:");
    for (const m of meds) {
      const parts = [m.medicine_name, m.dosage, m.frequency, m.duration].filter(Boolean);
      lines.push(`- ${parts.join(" ")}`);
    }
  }
  if (rx.follow_up) lines.push(`Follow-up: ${rx.follow_up}`);
  return lines.join("\n");
}

export function investigationsText(rx: PrescriptionWithRelations): string | null {
  return rx.investigations_orders ?? rx.investigations ?? null;
}
