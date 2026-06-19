import type { Complaint, ComplaintSeverity } from "@/types/prescription";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import {
  resolveComplaintAttributeFields,
  type ComplaintAttributeKey,
} from "@/lib/cockpit/complaint-schema";
import {
  formatFeverDisplaySummary,
  type FeverGrade,
} from "@/lib/cockpit/fever-temperature";

/** Whether a complaint card is complete enough to collapse to summary mode. */
export function isComplaintComplete(value: Complaint): boolean {
  return value.name.trim().length > 0;
}

/** Named associated symptoms on a parent complaint (trimmed, non-empty). */
export function listAssociatedComplaintNames(value: Complaint): string[] {
  return (value.associatedComplaints ?? [])
    .map((c) => c.name.trim())
    .filter(Boolean);
}

/** Full associated list for tooltips / aria (UI truncates by width). */
export function buildComplaintAssociatedSuffix(value: Complaint): string | null {
  const names = listAssociatedComplaintNames(value);
  if (names.length === 0) return null;
  return names.map(formatComplaintDisplayName).join(", ");
}

/** Display labels for the categorical severity bands (multi-word safe). */
const SEVERITY_LABELS: Record<string, string> = {
  minimal: "Minimal",
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
  very_severe: "Very severe",
};

export function formatComplaintSeverityLabel(
  severity: ComplaintSeverity | null | undefined,
): string | null {
  if (severity === null || severity === undefined) return null;
  if (typeof severity === "number") return `${severity}/10`;
  return SEVERITY_LABELS[severity] ?? severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Tailwind tone for severity on the collapsed card summary row. */
export function severitySummaryToneClass(
  severity: ComplaintSeverity | null | undefined,
): string {
  if (severity === "minimal") return "text-muted-foreground";
  if (severity === "mild") return "text-emerald-600";
  if (severity === "moderate") return "text-amber-600";
  if (severity === "severe") return "text-red-600";
  if (severity === "very_severe") return "text-red-700";
  if (typeof severity === "number") return severitySummaryToneClass(painScoreToSeverityBand(severity));
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Severity ⇄ 0–10 pain score (NRS) binding (subj-14 refine).
// The categorical chip and the numeric slider are one linked control on pain
// cards: dragging the slider derives the band; tapping a chip sets a
// representative score (unless the score is already in that band).
// ---------------------------------------------------------------------------

/** Categorical severity bands offered in the UI (excludes legacy `minimal`). */
export type SeverityBand = "mild" | "moderate" | "severe" | "very_severe";

/** Inclusive 0–10 range each band covers. */
const SEVERITY_BAND_RANGE: Record<SeverityBand, [number, number]> = {
  mild: [1, 3],
  moderate: [4, 6],
  severe: [7, 8],
  very_severe: [9, 10],
};

/** Representative score a chip tap sets when the score isn't already in-band. */
const SEVERITY_BAND_SCORE: Record<SeverityBand, number> = {
  mild: 2,
  moderate: 5,
  severe: 8,
  very_severe: 10,
};

/** Map a 0–10 score onto its band (0 → null = no pain). */
export function painScoreToSeverityBand(score: number): SeverityBand | null {
  if (score <= 0) return null;
  if (score <= 3) return "mild";
  if (score <= 6) return "moderate";
  if (score <= 8) return "severe";
  return "very_severe";
}

/** Representative score for a band (legacy `minimal` treated as mild). */
export function severityBandToScore(severity: ComplaintSeverity | null | undefined): number | null {
  if (severity === null || severity === undefined || typeof severity === "number") return null;
  if (severity === "minimal") return SEVERITY_BAND_SCORE.mild;
  return SEVERITY_BAND_SCORE[severity] ?? null;
}

/** Whether a numeric score already falls inside a band's range. */
export function isScoreInSeverityBand(
  score: number | null | undefined,
  severity: ComplaintSeverity | null | undefined,
): boolean {
  if (typeof score !== "number") return false;
  if (severity === null || severity === undefined || typeof severity === "number") return false;
  const band = severity === "minimal" ? "mild" : (severity as SeverityBand);
  const range = SEVERITY_BAND_RANGE[band];
  if (!range) return false;
  return score >= range[0] && score <= range[1];
}

/** Tailwind tone for fever grade on the collapsed card summary row. */
export function feverSummaryToneClass(feverGrade: FeverGrade | null | undefined): string {
  if (feverGrade === "mild") return "text-emerald-600";
  if (feverGrade === "moderate") return "text-amber-600";
  if (feverGrade === "high") return "text-red-600";
  if (feverGrade === "very_high") return "text-red-700";
  return "text-muted-foreground";
}

/** Shown on row 1 (duration) / row 2 (severity or fever) / as the notes icon — not in detail text. */
const SUMMARY_EXCLUDED_KEYS = new Set<ComplaintAttributeKey>([
  "duration",
  "severity",
  "notes",
  "temperature",
  "feverGrade",
  "measuredBy",
  "reportedBy",
]);

function buildComplaintDetailParts(value: Complaint): string[] {
  const fields = resolveComplaintAttributeFields({
    complaintName: value.name,
    category: value.category ?? null,
  });
  const parts: string[] = [];
  for (const field of fields) {
    if (SUMMARY_EXCLUDED_KEYS.has(field.key)) continue;
    if (field.type === "temperature" || field.type === "painscale") continue;
    const raw = value[field.key];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) continue;

    if (field.key === "radiation") {
      parts.push(/^radiat/i.test(text) ? text : `→ ${text}`);
    } else if (field.key === "aggravating") {
      parts.push(`↑ ${text}`);
    } else if (field.key === "relieving") {
      parts.push(`↓ ${text}`);
    } else {
      parts.push(text);
    }
  }
  return parts;
}

export interface ComplaintDetailSummary {
  severityLabel: string | null;
  detailText: string;
  fullText: string;
  hasRow: boolean;
}

/**
 * Row 2 on the collapsed card — severity first, then SOCRATES detail.
 * Duration stays on row 1 (inline).
 */
export function buildComplaintDetailSummary(value: Complaint): ComplaintDetailSummary {
  const painSeverityLabel = formatComplaintSeverityLabel(value.severity);
  const feverLabel = formatFeverDisplaySummary(
    value.temperature,
    value.temperatureUnit ?? "F",
    value.feverGrade,
    value.measuredBy,
    value.reportedBy,
  );
  const severityLabel = painSeverityLabel ?? feverLabel;
  const detailText = buildComplaintDetailParts(value).join(" · ");
  const fullText = [severityLabel, detailText].filter(Boolean).join(" · ");
  return {
    severityLabel,
    detailText,
    fullText,
    hasRow: Boolean(severityLabel || detailText),
  };
}

/** @deprecated Use buildComplaintDetailSummary — kept for tests and simple string consumers. */
export function buildComplaintSummary(value: Complaint): string {
  return buildComplaintDetailSummary(value).fullText;
}

/** Whether the complaint has free-text notes (shown as an icon on the collapsed card). */
export function complaintHasNotes(value: Complaint): boolean {
  return Boolean(value.notes?.trim());
}

export function complaintNotesText(value: Complaint): string {
  return value.notes?.trim() ?? "";
}
