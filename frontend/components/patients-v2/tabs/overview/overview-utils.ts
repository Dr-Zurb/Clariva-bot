import type { PatientRiskFlagSeverity } from "@/types/patient";

export function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatYear(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getFullYear());
}

export function activityTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export type ActivityDateGroup = "Today" | "Yesterday" | "This week" | "Earlier";

export function activityDateGroup(iso: string): ActivityDateGroup {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfThen.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Earlier";
}

const SEVERITY_RANK: Record<PatientRiskFlagSeverity, number> = {
  info: 0,
  warning: 1,
  danger: 2,
};

export function maxSeverity(
  severities: PatientRiskFlagSeverity[],
): PatientRiskFlagSeverity | null {
  if (severities.length === 0) return null;
  return severities.reduce((max, s) =>
    SEVERITY_RANK[s] > SEVERITY_RANK[max] ? s : max,
  );
}

export function severityBannerClass(severity: PatientRiskFlagSeverity): string {
  switch (severity) {
    case "danger":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    default:
      return "border-info/30 bg-info/10 text-info";
  }
}
