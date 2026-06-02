/**
 * Day-separator labels for the text consult message list (text-A4).
 *
 * Uses `en-GB` for older-day labels so SSR and CSR produce identical
 * strings — see deferred-date-locale-hydration-sweep-2026-04-28.md.
 */

export function formatDayLabel(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round(
    (startOfDay(today).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}
