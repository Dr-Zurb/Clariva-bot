"use client";

/**
 * MobilePillBar (Cockpit redesign batch · Lane α · cockpit-7)
 *
 * Persistent bottom pill bar for mobile (< lg / ≤1023px).
 *
 * Two pills are rendered in a 50/50 split bar fixed at the bottom of the
 * viewport. Tapping either opens a 85vh bottom Sheet so the room stays
 * mounted and live calls don't drop. Only one sheet can be open at a time.
 *
 *   ┌──────────────────────────────────┐
 *   │  ⚕ Chart        📝 Rx (status)   │
 *   └──────────────────────────────────┘
 *
 * Pill visibility gates:
 *   - Chart pill hidden when `!showChart` (no patient_id).
 *   - Rx pill hidden when `state === "terminal"`.
 *   - Bottom bar removed entirely when both pills are hidden.
 */

import { useState } from "react";
import { Stethoscope, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import PatientChartPanel from "@/components/ehr/PatientChartPanel";
import RxWorkspace from "@/components/consultation/cockpit/RxWorkspace";
import { cn } from "@/lib/utils";
import type { CockpitState } from "@/lib/patient-profile/state";
import type { Appointment } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveSheet = "chart" | "rx" | null;

export interface MobilePillBarProps {
  state: CockpitState;
  appointment: Appointment;
  token: string;
  /** False when the appointment has no patient_id (legacy guest rows). Hides the Chart pill. */
  showChart: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MobilePillBar({
  state,
  appointment,
  token,
  showChart,
}: MobilePillBarProps) {
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const showRx = state !== "terminal";

  // If neither pill is visible, render nothing — room fills full viewport.
  if (!showChart && !showRx) return null;

  const openSheet = (sheet: "chart" | "rx") => {
    // Toggling the same pill closes it; opening a new one auto-closes the old.
    setActiveSheet((prev) => (prev === sheet ? null : sheet));
  };

  const closeSheet = () => setActiveSheet(null);

  // Rx pill label reflects save status (status hint, not a CTA).
  const rxPillLabel = state === "ended" ? "Send Rx" : "Rx";

  return (
    <>
      {/* ── Fixed pill bar ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-background",
          // iOS safe-area inset so pills sit above the home indicator.
          "pb-[env(safe-area-inset-bottom)]",
        )}
        role="toolbar"
        aria-label="Consultation quick-access"
      >
        {showChart && (
          <button
            type="button"
            onClick={() => openSheet("chart")}
            aria-pressed={activeSheet === "chart"}
            aria-controls="mobile-chart-sheet"
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
              // Tap target ≥ 44pt (py-3 ≈ 44px on most devices at 1x).
              "min-h-[44px]",
              activeSheet === "chart"
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
              // Divider between pills when both are shown.
              showRx && "border-r border-border",
            )}
          >
            <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
            <span>Chart</span>
          </button>
        )}

        {showRx && (
          <button
            type="button"
            onClick={() => openSheet("rx")}
            aria-pressed={activeSheet === "rx"}
            aria-controls="mobile-rx-sheet"
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
              "min-h-[44px]",
              activeSheet === "rx"
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            <span>{rxPillLabel}</span>
          </button>
        )}
      </div>

      {/* ── Chart sheet ─────────────────────────────────────────────────── */}
      {showChart && appointment.patient_id && (
        <Sheet
          open={activeSheet === "chart"}
          onOpenChange={(open) => !open && closeSheet()}
        >
          <SheetContent
            id="mobile-chart-sheet"
            side="bottom"
            className="h-[85vh] overflow-y-auto p-0"
          >
            <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
              <SheetTitle className="text-base">Patient chart</SheetTitle>
            </SheetHeader>
            <div className="px-4 py-2">
              <PatientChartPanel
                patientId={appointment.patient_id}
                doctorId={appointment.doctor_id ?? undefined}
                token={token}
                layout="mobile"
                appointmentId={appointment.id}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Rx sheet ────────────────────────────────────────────────────── */}
      {showRx && (
        <Sheet
          open={activeSheet === "rx"}
          onOpenChange={(open) => !open && closeSheet()}
        >
          <SheetContent
            id="mobile-rx-sheet"
            side="bottom"
            className="h-[85vh] overflow-y-auto p-0"
          >
            <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
              <SheetTitle className="text-base">Prescription</SheetTitle>
            </SheetHeader>
            <div className="px-4 py-2">
              <RxWorkspace
                appointmentId={appointment.id}
                patientId={appointment.patient_id ?? null}
                token={token}
                state={state}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
