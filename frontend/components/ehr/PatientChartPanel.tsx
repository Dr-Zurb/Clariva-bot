"use client";

/**
 * PatientChartPanel (EHR Sub-batch A / T1.3)
 *
 * The unified surface that puts the patient's chart context in front of
 * the doctor on every clinical screen:
 *   - desktop (`layout='desktop'`)  — left-rail at w-80 on lg+ inside
 *     the appointment-detail page (PR #4 / Task 4 mounts it).
 *   - mobile  (`layout='mobile'`)   — top accordion above the form on
 *     <lg, sections collapsed by default.
 *   - in-call (`layout='in-call'`)  — compact w-64 inside the in-call
 *     quick-actions panel (PR #5 / Task 5 mounts it).
 *
 * Sections rendered (in order):
 *   1. Allergies
 *   2. Chronic conditions
 *   3. Vitals
 *   4. Previous prescriptions
 *
 * Each section is independent; the parent panel owns layout + collapse
 * defaults + the per-section "is the add form open?" state (so the
 * SectionWrapper "+ Add" button can drive each section's inline form
 * without prop-drilling refs).
 *
 * NOTE: Sub-batch A ships this component but does NOT mount it in any
 * production surface. PRs #4 / #5 / #6 do the actual mounts. To smoke
 * the component during dev, render it directly with a doctor JWT.
 */

import { useCallback, useState } from "react";
import AllergiesSection from "./sections/AllergiesSection";
import ChronicConditionsSection from "./sections/ChronicConditionsSection";
import PreviousRxSection from "./sections/PreviousRxSection";
import ProblemListSection from "./sections/ProblemListSection";
import VitalsSection from "./sections/VitalsSection";
import SectionWrapper from "./SectionWrapper";
import type {
  PatientChartLayout,
  PatientChartMode,
} from "@/types/patient-chart";

interface PatientChartPanelProps {
  patientId: string;
  /**
   * Doctor's user id — currently unused in section logic (the JWT identifies
   * the doctor server-side) but threaded through props so future sections
   * (e.g. T6 AI assist) can scope client-side state per-doctor. Kept in the
   * API to avoid prop churn later.
   */
  doctorId?: string;
  /**
   * Supabase access token. Required — every section needs it to call the
   * /api/v1/patients/:patientId/chart/* endpoints.
   */
  token: string;
  layout?: PatientChartLayout;
  mode?: PatientChartMode;
  /**
   * Optional — supplied by the in-call host so vitals captured in this
   * surface carry the appointment id (master-batch decision §4). The
   * appointment-detail / post-call hosts leave this undefined.
   */
  appointmentId?: string | null;
  /**
   * Optional className applied to the <aside> wrapper. Hosts use it to
   * tweak spacing without re-implementing the whole panel.
   */
  className?: string;
}

const ROOT_CLASS_BY_LAYOUT: Record<PatientChartLayout, string> = {
  desktop:
    "w-80 shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto",
  "in-call":
    "w-64 shrink-0 border-r border-gray-200 bg-white p-3 overflow-y-auto text-sm",
  mobile: "w-full bg-white border-b border-gray-200 px-3",
};

export default function PatientChartPanel({
  patientId,
  doctorId: _doctorId,
  token,
  layout = "desktop",
  mode = "default",
  appointmentId,
  className,
}: PatientChartPanelProps) {
  const isAccordion = layout === "mobile";

  // Per-section "is the inline add form open?" state. Each SectionWrapper's
  // "+ Add" button toggles its own value. We track per-section so opening
  // the add form for "Allergies" doesn't stomp the open state for "Vitals".
  const [allergyAddOpen, setAllergyAddOpen] = useState(false);
  const [conditionAddOpen, setConditionAddOpen] = useState(false);
  const [vitalsAddOpen, setVitalsAddOpen] = useState(false);

  // Per-section count for the SectionWrapper badge.
  const [allergyCount, setAllergyCount] = useState<number | null>(null);
  const [conditionCount, setConditionCount] = useState<number | null>(null);
  const [problemCount, setProblemCount] = useState<number | null>(null);
  const [previousRxCount, setPreviousRxCount] = useState<number | null>(null);

  // Stable callbacks so AllergiesSection / ConditionsSection's effect deps
  // don't trigger re-loads when the parent re-renders for other reasons.
  const handleAllergyCount = useCallback((n: number) => setAllergyCount(n), []);
  const handleConditionCount = useCallback((n: number) => setConditionCount(n), []);
  const handleProblemCount = useCallback((n: number) => setProblemCount(n), []);
  const handlePreviousRxCount = useCallback((n: number) => setPreviousRxCount(n), []);

  const readonly = mode === "readonly";

  return (
    <aside
      data-testid="patient-chart-panel"
      data-layout={layout}
      data-mode={mode}
      className={`${ROOT_CLASS_BY_LAYOUT[layout]} ${className ?? ""}`}
    >
      {layout !== "desktop" && (
        <header className="mb-2 flex items-center justify-between">
          <h2
            className={
              layout === "in-call"
                ? "text-xs font-semibold uppercase tracking-wide text-gray-500"
                : "text-sm font-semibold text-gray-900"
            }
          >
            Patient chart
          </h2>
        </header>
      )}

      <SectionWrapper
        id="chart-section-allergies"
        title="Allergies"
        startCollapsed={isAccordion}
        count={allergyCount}
        onAdd={() => setAllergyAddOpen(true)}
        hideAdd={readonly}
      >
        <AllergiesSection
          patientId={patientId}
          token={token}
          layout={layout}
          mode={mode}
          addOpen={allergyAddOpen}
          onAddOpenChange={setAllergyAddOpen}
          onCountChange={handleAllergyCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="chart-section-conditions"
        title="Chronic conditions"
        startCollapsed={isAccordion}
        count={conditionCount}
        onAdd={() => setConditionAddOpen(true)}
        hideAdd={readonly}
      >
        <ChronicConditionsSection
          patientId={patientId}
          token={token}
          layout={layout}
          mode={mode}
          addOpen={conditionAddOpen}
          onAddOpenChange={setConditionAddOpen}
          onCountChange={handleConditionCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="chart-section-problems"
        title="Problem list"
        startCollapsed={isAccordion}
        count={problemCount}
        hideAdd
      >
        <ProblemListSection
          patientId={patientId}
          token={token}
          layout={layout}
          mode={mode}
          onCountChange={handleProblemCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="chart-section-vitals"
        title="Vitals"
        startCollapsed={isAccordion}
        onAdd={() => setVitalsAddOpen(true)}
        hideAdd={readonly}
        addLabel="reading"
      >
        <VitalsSection
          patientId={patientId}
          token={token}
          layout={layout}
          mode={mode}
          appointmentId={appointmentId}
          addOpen={vitalsAddOpen}
          onAddOpenChange={setVitalsAddOpen}
        />
      </SectionWrapper>

      <SectionWrapper
        id="chart-section-previous-rx"
        title="Previous prescriptions"
        startCollapsed={isAccordion}
        count={previousRxCount}
        hideAdd
      >
        <PreviousRxSection
          patientId={patientId}
          token={token}
          layout={layout}
          mode={mode}
          onCountChange={handlePreviousRxCount}
        />
      </SectionWrapper>
    </aside>
  );
}
