"use client";

/**
 * PatientRibbon (cockpit-ribbon batch · crb-02)
 *
 * 52px full-width strip rendered between <PatientProfileHeader> and
 * <PatientProfileShell> inside <PatientProfilePage>. Surfaces always-visible
 * patient context across all panes:
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ 42 y · M · 68 kg │ ⚠️ Penicillin · Sulfa · +2 │ 🩺 HTN · DM · COPD │ 💊 4 │ 🎯 URI │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * Subscribes to <RxFormProvider> (lifted by csf-01) for the Dx live-mirror via
 * useRxForm(). The 🎯 click handler focuses #diagnosis (the Dx input id from
 * cv2-06's <AssessmentSection>).
 *
 * Walk-in (appointment.patient_id == null) → component returns null.
 * Mobile (<lg) → handled by parent (<PatientProfilePage> doesn't mount us).
 *
 * @see frontend/hooks/usePatientRibbonData.ts  (data hook — crb-01)
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-ribbon/Tasks/task-crb-02-patient-ribbon-component.md
 */

import { useEffect } from "react";
import { Shield } from "lucide-react";
import type { Appointment } from "@/types/appointment";
import { trackCockpitV2RRibbonLanded } from "@/lib/patient-profile/telemetry";
import {
  usePatientRibbonData,
  type RibbonAllergyChip,
  type RibbonChronicChip,
  type RibbonIdentity,
} from "@/hooks/usePatientRibbonData";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useOptionalRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Inline ribbon segment separator (DL-7 / cpv-06). */
function Sep() {
  return (
    <span className="text-muted-foreground/40" aria-hidden>
      {" "}
      ·{" "}
    </span>
  );
}

export interface PatientRibbonProps {
  appointment: Appointment;
  token: string;
}

export function PatientRibbon({ appointment, token }: PatientRibbonProps) {
  // Walk-in fallback per DL-6: no patient row → render nothing.
  if (!appointment.patient_id) return null;

  return <PatientRibbonInner patientId={appointment.patient_id} token={token} />;
}

// ---------------------------------------------------------------------------
// Inner component — split so the hook is always called unconditionally after
// the walk-in guard (hooks cannot be called conditionally at the top level).
// ---------------------------------------------------------------------------

function PatientRibbonInner({
  patientId,
  token,
}: {
  patientId: string;
  token: string;
}) {
  const data = usePatientRibbonData(patientId, token);
  const { state } = useRxForm();
  const dxValue = state.fields.provisionalDiagnosis;

  // One-shot telemetry — fires once per browser session on first ribbon mount.
  // Uses window flag (same pattern as trackCockpitV2RChartLanded in telemetry.ts)
  // rather than sessionStorage to avoid a synchronous storage read on every mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    trackCockpitV2RRibbonLanded({
      allergiesCount: data.allergies.length,
      chronicCount: data.chronicConditions.length,
      dxValuePresent: Boolean(dxValue),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional one-shot: data + dxValue purposefully excluded

  // Dev-only perf mark so the Dx mirror latency is visible in the
  // Performance tab. Measures from when provisionalDiagnosis changes to
  // when React commits this effect. Well below the 200ms ceiling.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      performance.mark(`ribbon-dx-mirror-${Date.now()}`);
    }
  }, [dxValue]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="region"
        aria-label="Patient context ribbon"
        className="flex h-[52px] w-full items-center border-b bg-card px-4"
      >
        <IdentitySlot identity={data.identity} isLoading={data.isLoading} />
        <Sep />
        <AllergiesSlot chips={data.allergies} isLoading={data.isLoading} />
        <Sep />
        <ChronicSlot chips={data.chronicConditions} isLoading={data.isLoading} />
        <Sep />
        <ActiveMedsSlot count={data.activeMedsCount} isLoading={data.isLoading} />
        <Sep />
        <SafetySlot />
        {/* Spacer pushes 🎯 Treating to the right */}
        <div className="flex-1" aria-hidden />
        <TreatingSlot dxValue={dxValue} />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Slot: Identity — "42 y · M · 68 kg"
// ---------------------------------------------------------------------------

function IdentitySlot({
  identity,
  isLoading,
}: {
  identity: RibbonIdentity;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-[100px]" />;
  }

  const parts: string[] = [];
  if (identity.ageYears !== null) parts.push(`${identity.ageYears} y`);
  if (identity.sex !== null) parts.push(identity.sex);
  if (identity.weightKg !== null) parts.push(`${identity.weightKg} kg`);

  if (parts.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No demographics</span>
    );
  }

  return (
    <span className="whitespace-nowrap text-xs font-medium text-foreground">
      {parts.join(" · ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Slot: Allergies
// ---------------------------------------------------------------------------

function AllergiesSlot({
  chips,
  isLoading,
}: {
  chips: RibbonAllergyChip[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-10" />
      </div>
    );
  }

  if (chips.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No known allergies</span>
    );
  }

  const VISIBLE_MAX = 3;
  const visible = chips.slice(0, VISIBLE_MAX);
  const overflow = chips.slice(VISIBLE_MAX);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((chip) => (
        <AllergyChip key={chip.id} chip={chip} />
      ))}
      {overflow.length > 0 && (
        <OverflowPill
          count={overflow.length}
          items={overflow.map((c) => ({
            id: c.id,
            label: c.name,
            detail: formatAllergyDetail(c),
          }))}
          aria-label={`${overflow.length} more allergies`}
        />
      )}
    </div>
  );
}

function AllergyChip({ chip }: { chip: RibbonAllergyChip }) {
  const severityClass: Record<string, string> = {
    mild: "bg-warning/15 text-warning border-warning/40",
    moderate: "bg-warning/25 text-warning border-warning/50",
    severe: "bg-destructive/15 text-destructive border-destructive/40",
  };
  const chipClass =
    (chip.severity && severityClass[chip.severity]) ??
    "bg-warning/15 text-warning border-warning/40";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-default items-center rounded border px-1.5 py-0.5 text-xs font-medium",
            chipClass,
          )}
          role="note"
          aria-label={`Allergy: ${chip.name}`}
        >
          ⚠️ {chip.name}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px] space-y-1">
        <p className="font-semibold">{chip.name}</p>
        {chip.severity && (
          <p className="capitalize text-xs">Severity: {chip.severity}</p>
        )}
        {chip.reaction && <p className="text-xs">Reaction: {chip.reaction}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function formatAllergyDetail(chip: RibbonAllergyChip): string {
  const parts: string[] = [];
  if (chip.severity) parts.push(`Severity: ${chip.severity}`);
  if (chip.reaction) parts.push(`Reaction: ${chip.reaction}`);
  return parts.join(" · ") || chip.name;
}

// ---------------------------------------------------------------------------
// Slot: Chronic conditions
// ---------------------------------------------------------------------------

function ChronicSlot({
  chips,
  isLoading,
}: {
  chips: RibbonChronicChip[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-10" />
        <Skeleton className="h-5 w-14" />
      </div>
    );
  }

  if (chips.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No chronic conditions</span>
    );
  }

  const VISIBLE_MAX = 3;
  const visible = chips.slice(0, VISIBLE_MAX);
  const overflow = chips.slice(VISIBLE_MAX);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((chip) => (
        <ChronicChip key={chip.id} chip={chip} />
      ))}
      {overflow.length > 0 && (
        <OverflowPill
          count={overflow.length}
          items={overflow.map((c) => ({
            id: c.id,
            label: c.name,
            detail: c.since ? `Since: ${c.since}` : c.name,
          }))}
          aria-label={`${overflow.length} more conditions`}
        />
      )}
    </div>
  );
}

function ChronicChip({ chip }: { chip: RibbonChronicChip }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex cursor-default items-center rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary"
          role="note"
          aria-label={`Chronic condition: ${chip.name}`}
        >
          🩺 {chip.name}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px] space-y-1">
        <p className="font-semibold">{chip.name}</p>
        {chip.since && <p className="text-xs">Since: {chip.since}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Slot: Active meds count
// ---------------------------------------------------------------------------

function ActiveMedsSlot({
  count,
  isLoading,
}: {
  count: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-5 w-12" />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-default whitespace-nowrap text-xs font-medium",
            count === 0 ? "text-muted-foreground" : "text-foreground",
          )}
          aria-label={`${count} active medications`}
        >
          💊 {count}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {count === 0
          ? "No active medications on the most recent prescription."
          : `${count} active medication${count === 1 ? "" : "s"} on the most recent prescription.`}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Slot: Safety — allergy/DDI review status (cnc-04 / DL-6)
// ---------------------------------------------------------------------------

function SafetySlot(): JSX.Element {
  const safety = useOptionalRxSafety();
  const needsReview = safety?.visible ?? false;
  const safetyLabel = needsReview
    ? "Safety status — review required"
    : "Safety status — no concerns";
  const safetyTooltipText = needsReview
    ? [
        "Check allergies, interactions, and contraindications before sending.",
        safety &&
          (safety.clashesCount > 0 || safety.ddiCount > 0) &&
          `${safety.clashesCount} allergy clash${safety.clashesCount === 1 ? "" : "es"}, ${safety.ddiCount} drug interaction${safety.ddiCount === 1 ? "" : "s"}.`,
      ]
        .filter(Boolean)
        .join(" ")
    : "No unacknowledged allergy clashes or drug interactions on the current draft.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={safetyLabel}
          className={cn(
            "inline-flex cursor-help items-center gap-1 rounded px-1 py-0.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Shield
            className={cn(
              "h-4 w-4",
              needsReview ? "text-warning" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <span className="text-xs font-medium text-muted-foreground">Safety</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px]">
        <p>{safetyTooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Slot: Treating Dx (right-aligned, live mirror of useRxForm) — cnc-04 / DL-7
// ---------------------------------------------------------------------------

const MAX_DX_CHARS = 40;

function formatTreatingDxDisplay(dxValue: string): string {
  const trimmed = dxValue.trim();
  if (!trimmed) return "not assigned";
  return trimmed.length > MAX_DX_CHARS
    ? `${trimmed.slice(0, MAX_DX_CHARS)}…`
    : trimmed;
}

function TreatingSlot({ dxValue }: { dxValue: string }): JSX.Element {
  function focusDiagnosisInput(): void {
    const el = document.getElementById("diagnosis");
    if (el instanceof HTMLElement) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  const isEmpty = !dxValue.trim();
  const displayText = formatTreatingDxDisplay(dxValue);
  const treatingLabel = `Treating: ${displayText}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={focusDiagnosisInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              focusDiagnosisInput();
            }
          }}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium",
            "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isEmpty ? "text-muted-foreground" : "text-foreground",
          )}
          aria-label={
            isEmpty
              ? "Treating diagnosis not assigned. Click to edit."
              : `Treating: ${dxValue}. Click to edit.`
          }
        >
          <span aria-hidden>🎯</span>
          <span className={isEmpty ? "italic" : undefined}>{treatingLabel}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px]">
        <p>
          {isEmpty
            ? "Set the provisional treating diagnosis in the Plan pane. Click to jump to the diagnosis field."
            : dxValue.length > MAX_DX_CHARS
              ? `${dxValue} Click to edit in the Plan pane.`
              : "Provisional treating diagnosis for this visit. Click to edit in the Plan pane."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Shared: "+N more" overflow pill → opens a popover listing all chips
// ---------------------------------------------------------------------------

interface OverflowItem {
  id: string;
  label: string;
  detail: string;
}

function OverflowPill({
  count,
  items,
  "aria-label": ariaLabel,
}: {
  count: number;
  items: OverflowItem[];
  "aria-label"?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel ?? `+${count} more`}
        >
          +{count} more
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-auto min-w-[180px] max-w-[280px] p-2"
      >
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-xs">
              <span className="font-medium">{item.label}</span>
              {item.detail && item.detail !== item.label && (
                <span className="ml-1 text-muted-foreground">{item.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
