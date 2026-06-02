"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDoctorSettings } from "@/lib/api";
import type { DoctorSettings } from "@/types/doctor-settings";
import { cn } from "@/lib/utils";

interface PracticePillProps {
  token: string;
  userEmail?: string | null;
  className?: string;
}

/**
 * Compact practice-context pill in the header left zone.
 * Shows practice_name · specialty from doctor_settings; falls back to
 * the doctor's email when settings haven't been filled yet.
 *
 * Click → /dashboard/settings/practice-setup/practice-info
 * Hidden on <sm — mobile relies on the sidebar drawer for context.
 *
 * TODO(A5): swap email fallback for doctor display-name once a name
 * field is added to doctor_settings.
 *
 * @see task-ui-B1-header-redesign.md § Practice-context pill
 */
export function PracticePill({ token, userEmail, className }: PracticePillProps) {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);

  useEffect(() => {
    if (!token) return;
    getDoctorSettings(token)
      .then((res) => setSettings(res.data.settings))
      .catch(() => {
        // Quiet — pill falls back to email display; dashboard page surfaces errors.
      });
  }, [token]);

  const practiceName = settings?.practice_name;
  const specialty = settings?.specialty;

  const label =
    practiceName || specialty
      ? [practiceName, specialty].filter(Boolean).join(" · ")
      : (userEmail ?? "");

  if (!label) return null;

  return (
    <Link
      href="/dashboard/settings/practice-setup/practice-info"
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1",
        "text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80",
        className
      )}
    >
      {label}
    </Link>
  );
}
