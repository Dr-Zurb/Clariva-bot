import type { OpdMode } from "@/types/opd-session";

interface OpdModeBadgeProps {
  mode: OpdMode;
  className?: string;
}

/**
 * Small label for slot vs queue scheduling mode (e-task-opd-05).
 */
export default function OpdModeBadge({ mode, className = "" }: OpdModeBadgeProps) {
  const label = mode === "queue" ? "Queue" : "Fixed slot";
  const styles =
    mode === "queue"
      ? "bg-violet-100 text-violet-800 border-violet-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
