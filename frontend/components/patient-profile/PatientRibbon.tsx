"use client";

/**
 * PatientRibbon (cockpit-ribbon · ribbon rethink 2026-07-17)
 *
 * 52px full-width safety glance between <PatientProfileHeader> and the shell:
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ ⚠️ Penicillin · … │ 🩺 HTN · … │ 💊 4 │ Safety │ ⧉ Chart 🕐 History │ 🎯 URI │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * Demographics live in the header beside the name (not here). 💊 counts active
 * chart medications (`patient_medications` status=active), not last-visit Rx.
 * Allergies popover mounts AllergiesSection; Chart / History open side sheets.
 *
 * Walk-in (appointment.patient_id == null) → null.
 * Mobile (<lg) → parent does not mount us.
 *
 * @see frontend/hooks/usePatientRibbonData.ts
 */

import { useCallback, useEffect, useState } from "react";
import { Clock, PanelRightOpen, Shield } from "lucide-react";
import type { Appointment } from "@/types/appointment";
import { trackCockpitV2RRibbonLanded } from "@/lib/patient-profile/telemetry";
import {
  usePatientRibbonData,
  type RibbonAllergyChip,
  type RibbonChronicChip,
  type RibbonMedChip,
} from "@/hooks/usePatientRibbonData";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useOptionalRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import SnapshotPane from "@/components/patient-profile/panes/SnapshotPane";
import HistoryPane from "@/components/patient-profile/panes/HistoryPane";
import AllergiesSection from "@/components/ehr/sections/AllergiesSection";
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

const RIBBON_SECTION_LAYOUT = "in-call" as const;
const RIBBON_SECTION_MODE = "default" as const;

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

  return (
    <PatientRibbonInner
      appointment={appointment}
      patientId={appointment.patient_id}
      token={token}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component — split so the hook is always called unconditionally after
// the walk-in guard (hooks cannot be called conditionally at the top level).
// ---------------------------------------------------------------------------

function PatientRibbonInner({
  appointment,
  patientId,
  token,
}: {
  appointment: Appointment;
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
        data-testid="patient-ribbon"
      >
        <AllergiesSlot
          chips={data.allergies}
          isLoading={data.isLoading}
          patientId={patientId}
          token={token}
        />
        <Sep />
        <ChronicSlot chips={data.chronicConditions} isLoading={data.isLoading} />
        <Sep />
        <ActiveMedsSlot
          meds={data.activeMeds}
          count={data.activeMedsCount}
          isLoading={data.isLoading}
        />
        <Sep />
        <SafetySlot />
        <RibbonSheetActions appointment={appointment} token={token} />
        {/* Spacer pushes 🎯 Treating to the right */}
        <div className="flex-1" aria-hidden />
        <TreatingSlot dxValue={dxValue} />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Chart + History side-sheet triggers (RX-01 / RX-04)
// ---------------------------------------------------------------------------

function RibbonSheetActions({
  appointment,
  token,
}: {
  appointment: Appointment;
  token: string;
}) {
  const { open, isOpen } = useSideSheet();

  const openChart = useCallback(() => {
    open({
      id: "patient-chart",
      title: "Patient chart",
      content: (
        <SnapshotPane appointment={appointment} token={token} hideHeader />
      ),
      defaultWidth: 520,
      canDock: false,
    });
  }, [appointment, open, token]);

  const openHistory = useCallback(() => {
    open({
      id: "visit-history",
      title: "Visit history",
      content: (
        <HistoryPane appointment={appointment} token={token} hideHeader />
      ),
      defaultWidth: 480,
      canDock: false,
    });
  }, [appointment, open, token]);

  return (
    <div className="ml-2 flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="ribbon-open-chart"
            aria-haspopup="dialog"
            aria-expanded={isOpen("patient-chart")}
            aria-label="Open patient chart"
            onClick={openChart}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <PanelRightOpen className="h-4 w-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Patient chart</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="ribbon-open-history"
            aria-haspopup="dialog"
            aria-expanded={isOpen("visit-history")}
            aria-label="Open visit history"
            onClick={openHistory}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Clock className="h-4 w-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Visit history</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot: Allergies — glance chips + click popover (RX-02)
// ---------------------------------------------------------------------------

function AllergiesSlot({
  chips,
  isLoading,
  patientId,
  token,
}: {
  chips: RibbonAllergyChip[];
  isLoading: boolean;
  patientId: string;
  token: string;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-10" />
      </div>
    );
  }

  const VISIBLE_MAX = 3;
  const visible = chips.slice(0, VISIBLE_MAX);
  const overflowCount = Math.max(0, chips.length - VISIBLE_MAX);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="ribbon-allergies-trigger"
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
          aria-label={
            chips.length === 0
              ? "No known allergies. Open to add or review."
              : `Allergies: ${chips.length}. Open to review or add.`
          }
          className={cn(
            "inline-flex max-w-[min(100%,28rem)] items-center gap-1.5 rounded-md px-1 py-0.5",
            "text-left transition-colors hover:bg-accent/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {chips.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No known allergies
            </span>
          ) : (
            <>
              {visible.map((chip) => (
                <AllergyChip key={chip.id} chip={chip} />
              ))}
              {overflowCount > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  +{overflowCount}
                </span>
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-[min(100vw-2rem,22rem)] max-h-[420px] overflow-y-auto p-3"
        data-testid="ribbon-allergies-popover"
      >
        <p className="mb-2 text-xs font-semibold text-foreground">Allergies</p>
        <AllergiesSection
          patientId={patientId}
          token={token}
          layout={RIBBON_SECTION_LAYOUT}
          mode={RIBBON_SECTION_MODE}
          addOpen={addOpen}
          onAddOpenChange={setAddOpen}
        />
      </PopoverContent>
    </Popover>
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
            "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
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
// Slot: Active chart meds — count + name list popover
// ---------------------------------------------------------------------------

function ActiveMedsSlot({
  meds,
  count,
  isLoading,
}: {
  meds: RibbonMedChip[];
  count: number;
  isLoading: boolean;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-5 w-12" />;
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="ribbon-meds-trigger"
              aria-haspopup="dialog"
              aria-expanded={popoverOpen}
              aria-label={`${count} active medications. Open current medications.`}
              className={cn(
                "cursor-pointer whitespace-nowrap rounded-md px-1 py-0.5 text-xs font-medium",
                "transition-colors hover:bg-accent/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                count === 0 ? "text-muted-foreground" : "text-foreground",
              )}
            >
              💊 {count}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {count === 0
            ? "No active chart medications. Click to review."
            : `${count} active medication${count === 1 ? "" : "s"} on the chart (PMH). Click to review.`}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-[min(100vw-2rem,22rem)] max-h-[420px] overflow-y-auto p-3"
        data-testid="ribbon-meds-popover"
      >
        <p className="mb-2 text-xs font-semibold text-foreground">
          Active medications
        </p>
        {meds.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active medications on the patient chart. Add them under
            Subjective → Past medical history.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="ribbon-meds-list">
            {meds.map((med) => (
              <li key={med.id} className="text-xs">
                <span className="font-medium text-foreground">{med.name}</span>
                {med.detail ? (
                  <span className="ml-1 text-muted-foreground">{med.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
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
