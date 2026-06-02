"use client";

/**
 * Plan 03 · Task 13 — Mode-aware Services card on the Practice Setup landing page.
 *
 * Replaces the previously-static "Services catalog" row with a client card that
 * fetches `doctorSettings` and shows a one-line summary tailored to the
 * doctor's `catalog_mode`:
 *
 *   - `null`          → prompt to pick a mode (links into Task 12's selector).
 *   - `'single_fee'`  → flat fee + enabled modalities, "Edit fee" action.
 *   - `'multi_service'` → service count + deterministic health-issue badge,
 *     "Manage services" action.
 *
 * Rendering keeps the same outer shape as {@link PracticeSetupCard} (icon box
 * + title + secondary line) so the row visually lines up with the other
 * cards. Extra affordances (health badge, CTA arrow, mode-specific icon) are
 * additive; zero layout change for multi-service doctors without issues.
 *
 * Failure modes:
 *   - No session / 401 → falls back to the undecided layout with a subdued
 *     subtitle. The link still works; the user lands on the services-catalog
 *     page which handles auth itself.
 *   - Network error    → identical fallback; surfaces a generic "Unable to
 *     load" subtitle so doctors don't see a blank card.
 *
 * All branching logic lives in {@link describeServicesCardState} — this file
 * is the presentation layer only.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, DollarSign, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings } from "@/lib/api";
import type { DoctorSettings } from "@/types/doctor-settings";
import {
  describeServicesCardState,
  type ServicesCardState,
} from "@/lib/practice-setup-card";

type Props = {
  href: string;
  /** Card title — stays "Services catalog" regardless of mode. */
  label: string;
};

/** Mode-specific icon hint. */
function ModeIcon({ mode }: { mode: ServicesCardState["mode"] | "loading" }) {
  if (mode === "single_fee") return <DollarSign className="h-6 w-6" aria-hidden />;
  if (mode === null) return <HelpCircle className="h-6 w-6" aria-hidden />;
  return <BookOpen className="h-6 w-6" aria-hidden />;
}

function HealthBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-900"
      data-testid="services-landing-health-badge"
      aria-label={`${count} catalog ${count === 1 ? "issue" : "issues"} to review`}
      title={`${count} ${count === 1 ? "issue" : "issues"} detected by local catalog checks`}
    >
      <span aria-hidden>!</span>
      {count}
    </span>
  );
}

export function ServicesLandingCard({ href, label }: Props) {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) setLoadError(true);
          return;
        }
        const res = await getDoctorSettings(token);
        if (cancelled) return;
        setSettings(res.data.settings);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const state = describeServicesCardState(settings);
  const subtitle = loadError && settings == null
    ? "Unable to load — click to open services setup"
    : state.subtitle;
  const iconMode = settings == null ? "loading" : state.mode;

  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      data-testid="services-landing-card"
      data-catalog-mode={state.mode ?? "null"}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <ModeIcon mode={iconMode} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{label}</h3>
        <HealthBadge count={state.healthCount} />
      </div>
      <p className="mt-1 text-sm text-gray-600" data-testid="services-landing-subtitle">
        {subtitle}
      </p>
      <p
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600"
        data-testid="services-landing-cta"
      >
        {state.cta}
        <span aria-hidden>→</span>
      </p>
    </Link>
  );
}
