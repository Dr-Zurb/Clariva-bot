"use client";

/**
 * SnapshotPane — trimmed safety-glance chart for the cockpit snapshot leaf.
 *
 * Source: plan-cockpit-v2 § R-CHART, chart-extraction batch DL-1. Replaces the
 * full five-section {@link PatientChartPanel} in the snapshot column with a
 * subset: allergies, chronic conditions, problem list (safety-relevant extension
 * over the source plan), vitals limited to the last three readings, and current
 * medications (sent prescriptions from the most recent visit only). Deep visit
 * history lives in HistoryPane (cce-03).
 *
 * **Reuse strategy (Option A):** Mount the existing section components directly
 * with trim props (`VitalsSection` `limit={3}`, `PreviousRxSection`
 * `filter="most-recent-visit"`) inside {@link SectionWrapper} — same composition
 * pattern as `PatientChartPanel` without duplicating fetch logic. Add affordances
 * are retained so doctors can note an allergy mid-consult; the trim is view
 * depth, not capability.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import AllergiesSection from "@/components/ehr/sections/AllergiesSection";
import ChronicConditionsSection from "@/components/ehr/sections/ChronicConditionsSection";
import PreviousRxSection from "@/components/ehr/sections/PreviousRxSection";
import ProblemListSection from "@/components/ehr/sections/ProblemListSection";
import SectionWrapper from "@/components/ehr/SectionWrapper";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import { listPatientVitals } from "@/lib/api/patient-chart";
import type { Appointment } from "@/types/appointment";
import type { PatientVitalsReading } from "@/types/patient-chart";
import { PaneCollapseChevron } from "./PaneCollapseChevron";
import { SnapshotVitalsSection } from "./SnapshotVitalsSection";
import {
  formatCountSummary,
  summarizeSnapshotPane,
  summarizeSnapshotVitals,
} from "./snapshot-pane-summary";
import { mergeSnapshotVitals } from "./snapshot-vitals-merge";

export interface SnapshotPaneProps {
  appointment: Appointment;
  token: string;
  /** When true, suppress the pane header (e.g. isolated test mounts). */
  hideHeader?: boolean;
}

const SNAPSHOT_LAYOUT = "in-call" as const;
const SNAPSHOT_MODE = "default" as const;

export default function SnapshotPane({
  appointment,
  token,
  hideHeader = false,
}: SnapshotPaneProps): JSX.Element {
  const patientId = appointment.patient_id ?? "";
  const rxForm = useOptionalRxForm();

  const [collapsed, setCollapsed] = useState(false);
  const [allergyAddOpen, setAllergyAddOpen] = useState(false);
  const [conditionAddOpen, setConditionAddOpen] = useState(false);
  const [allergyCount, setAllergyCount] = useState<number | null>(null);
  const [conditionCount, setConditionCount] = useState<number | null>(null);
  const [problemCount, setProblemCount] = useState<number | null>(null);
  const [medicationsCount, setMedicationsCount] = useState<number | null>(null);
  const [persistedVitals, setPersistedVitals] = useState<PatientVitalsReading | null>(
    null,
  );

  const handleAllergyCount = useCallback((n: number) => setAllergyCount(n), []);
  const handleConditionCount = useCallback((n: number) => setConditionCount(n), []);
  const handleProblemCount = useCallback((n: number) => setProblemCount(n), []);
  const handleMedicationsCount = useCallback((n: number) => setMedicationsCount(n), []);

  useEffect(() => {
    if (!patientId) {
      setPersistedVitals(null);
      return;
    }

    let cancelled = false;
    void listPatientVitals(token, patientId, { limit: 1 })
      .then((res) => {
        if (!cancelled) setPersistedVitals(res.data.vitals[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setPersistedVitals(null);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  const vitalsSummary = useMemo(() => {
    const { displayed } = mergeSnapshotVitals(
      persistedVitals,
      rxForm?.state.fields,
    );
    return summarizeSnapshotVitals(displayed);
  }, [persistedVitals, rxForm?.state.fields]);

  const paneSummary = useMemo(
    () =>
      summarizeSnapshotPane(
        allergyCount,
        conditionCount,
        problemCount,
        medicationsCount,
        vitalsSummary,
      ),
    [
      allergyCount,
      conditionCount,
      problemCount,
      medicationsCount,
      vitalsSummary,
    ],
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3 text-sm">
      <SectionWrapper
        id="snapshot-section-allergies"
        title="Allergies"
        count={allergyCount}
        onAdd={() => setAllergyAddOpen(true)}
        collapsedSummary={formatCountSummary(
          allergyCount,
          "allergy",
          "allergies",
          "No allergies",
        )}
      >
        <AllergiesSection
          patientId={patientId}
          token={token}
          layout={SNAPSHOT_LAYOUT}
          mode={SNAPSHOT_MODE}
          addOpen={allergyAddOpen}
          onAddOpenChange={setAllergyAddOpen}
          onCountChange={handleAllergyCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="snapshot-section-conditions"
        title="Chronic conditions"
        count={conditionCount}
        onAdd={() => setConditionAddOpen(true)}
        collapsedSummary={formatCountSummary(
          conditionCount,
          "condition",
          "conditions",
          "No chronic conditions",
        )}
      >
        <ChronicConditionsSection
          patientId={patientId}
          token={token}
          layout={SNAPSHOT_LAYOUT}
          mode={SNAPSHOT_MODE}
          addOpen={conditionAddOpen}
          onAddOpenChange={setConditionAddOpen}
          onCountChange={handleConditionCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="snapshot-section-problems"
        title="Problem list"
        count={problemCount}
        hideAdd
        collapsedSummary={formatCountSummary(
          problemCount,
          "problem",
          "problems",
          "No problems",
        )}
      >
        <ProblemListSection
          patientId={patientId}
          token={token}
          layout={SNAPSHOT_LAYOUT}
          mode={SNAPSHOT_MODE}
          onCountChange={handleProblemCount}
        />
      </SectionWrapper>

      <SectionWrapper
        id="snapshot-section-vitals"
        title="Vitals"
        hideAdd
        collapsedSummary={vitalsSummary}
      >
        <SnapshotVitalsSection patientId={patientId} token={token} />
      </SectionWrapper>

      <SectionWrapper
        id="snapshot-section-medications"
        title="Current medications"
        count={medicationsCount}
        hideAdd
        collapsedSummary={formatCountSummary(
          medicationsCount,
          "medication",
          "medications",
          "No medications",
        )}
      >
        <PreviousRxSection
          patientId={patientId}
          token={token}
          layout={SNAPSHOT_LAYOUT}
          mode={SNAPSHOT_MODE}
          limit={10}
          filter="most-recent-visit"
          onCountChange={handleMedicationsCount}
        />
      </SectionWrapper>
    </div>
  );

  return (
    <div data-testid="snapshot-pane" className="flex h-full min-h-0 flex-col">
      {!hideHeader ? (
        <PaneHeader
          title="Snapshot"
          titleId="cockpit-snapshot-title"
          actions={
            <PaneCollapseChevron
              paneTitle="Snapshot"
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
            />
          }
        />
      ) : null}
      {collapsed ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{paneSummary}</div>
      ) : (
        body
      )}
    </div>
  );
}
