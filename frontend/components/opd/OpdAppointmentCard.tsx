import type { ReactNode } from "react";
import OpdModeBadge from "./OpdModeBadge";
import type { OpdMode } from "@/types/opd-session";

interface OpdAppointmentCardProps {
  mode: OpdMode;
  title?: string;
  children: ReactNode;
}

/**
 * Single-visit card shell with mode badge (e-task-opd-05).
 */
export default function OpdAppointmentCard({
  mode,
  title = "Your visit",
  children,
}: OpdAppointmentCardProps) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <OpdModeBadge mode={mode} />
      </header>
      {children}
    </article>
  );
}
