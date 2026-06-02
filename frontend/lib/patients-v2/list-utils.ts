/**
 * Shared helpers for the patients v2 list table (pr-07).
 */

import { formatLocalIsoDate } from "@/lib/dates";

export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const future = diffMs < 0;
  const absDays = Math.floor(Math.abs(diffMs) / (24 * 60 * 60 * 1000));

  if (future) {
    if (absDays === 0) return "Today";
    if (absDays === 1) return "Tomorrow";
    return `in ${absDays} days`;
  }
  if (absDays === 0) return "Today";
  if (absDays === 1) return "1 day ago";
  if (absDays < 7) return `${absDays} days ago`;
  if (absDays < 30) return `${Math.floor(absDays / 7)} weeks ago`;
  if (absDays < 365) return `${Math.floor(absDays / 30)} months ago`;
  return `${Math.floor(absDays / 365)} years ago`;
}

/** Mask phone for list display (e.g. +91 ****12 34). */
export function maskPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  const country = phone.trim().startsWith("+") ? phone.split(/\s/)[0] : "";
  const mid = last4.length >= 4 ? `${last4.slice(0, 2)} ${last4.slice(2)}` : last4;
  return country ? `${country} ****${mid}` : `****${mid}`;
}

export function sexShort(gender: string | null | undefined): string | null {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g === "male" || g === "m") return "M";
  if (g === "female" || g === "f") return "F";
  if (g === "other" || g === "o") return "O";
  return gender[0]?.toUpperCase() ?? null;
}

export function formatTableDemographics(
  age: number | null | undefined,
  gender: string | null | undefined,
): string {
  const parts: string[] = [];
  if (age != null) parts.push(`${age}y`);
  const sex = sexShort(gender);
  if (sex) parts.push(sex);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function exportPatientsCsv(
  rows: Array<{
    name: string;
    medical_record_number?: string | null;
    phone: string;
    last_appointment_date?: string | null;
    age?: number | null;
    gender?: string | null;
  }>,
  filename = "patients-export.csv",
): void {
  const header = ["Name", "MRN", "Phone", "Last visit", "Demographics"];
  const lines = rows.map((p) => {
    const demo = formatTableDemographics(p.age, p.gender);
    const last = p.last_appointment_date
      ? formatLocalIsoDate(new Date(p.last_appointment_date))
      : "";
    const cells = [
      p.name,
      p.medical_record_number ?? "",
      p.phone,
      last,
      demo,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    return cells.join(",");
  });
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
