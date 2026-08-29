"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveCockpitState,
  shouldShowChartRail,
  mapStateToTemplate,
  shouldAutoStartInClinicVisit,
  IN_CLINIC_APPOINTMENT_UPDATED_EVENT,
  type CockpitTemplateOverride,
} from "@/lib/patient-profile/state";
import {
  postAppointmentCheckIn,
  postAppointmentWrapUp,
  postDoctorMarkNoShow,
} from "@/lib/api";
import { getDoctorSettingsShared } from "@/lib/api/doctor-settings-shared";
import type { Appointment, ConsultationModality } from "@/types/appointment";
import CockpitHeader from "@/components/patient-profile/PatientProfileHeader";
import {
  CockpitLeaveGuard,
  type CockpitLeaveExit,
} from "@/components/patient-profile/CockpitLeaveGuard";
import { PatientRibbon } from "@/components/patient-profile/PatientRibbon";
import { clearConsultSteppedAway } from "@/lib/cockpit/consult-stepped-away";
import type { ConsultationLauncherHandle } from "@/components/consultation/ConsultationLauncher";
import { useDashboardLiveFocus } from "@/components/layout/DashboardLiveFocusContext";
import CommandBar from "@/components/patient-profile/CommandBar";
import KeyboardHelpHost from "@/components/patient-profile/KeyboardHelpHost";
import CockpitV3Shell from "@/components/patient-profile/v3/CockpitV3Shell";
import {
  ConsultSurfaceHost,
  ConsultSurfaceProvider,
} from "@/components/patient-profile/ConsultSurfaceContext";
import {
  buildCockpitTabs,
  buildWalkInCockpitTabs,
  renderConsultBodySurface,
} from "@/lib/patient-profile/v3/cockpit-tabs";
import type { PaneDefinition } from "@/lib/patient-profile/types";
import {
  TELEMED_VIDEO_LAYOUT_STORAGE_KEY,
  WALKIN_LAYOUT_STORAGE_KEY,
} from "@/lib/patient-profile/layout";
import type {
  TelemedVideoContext,
  CockpitTemplate,
} from "@/lib/patient-profile/templates";
import { SafetyStickyStrip } from "@/components/cockpit/middle/SafetyStickyStrip";
import { CockpitRxActionDock } from "@/components/cockpit/rx/CockpitRxActionDock";
import { RxFormProvider } from "@/components/cockpit/rx/RxFormContext";
import { RxSafetyProvider } from "@/components/cockpit/rx/RxSafetyContext";
import { RxFormActionsBridgeProvider } from "@/components/cockpit/rx/RxFormActionsContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import SideSheetHost from "@/components/patient-profile/SideSheetHost";
import { useRxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  trackCockpitV2Phase2ShellFlipped,
  trackCockpitV2RChartLanded,
  trackCockpitV2RModVoiceLanded,
  trackCockpitV2RModTextLanded,
  trackCockpitV2RModReviewLanded,
  trackCockpitV2ProgramCompleted,
  trackCockpitPolishVisualSystemLanded,
} from "@/lib/patient-profile/telemetry";

interface PatientProfilePageProps {
  appointment: Appointment;
  token: string;
  /**
   * cv2-03: optional pane tree override (e.g. {@link TELEMED_VIDEO_TEMPLATE}).
   * When set, the built-in chart/body/rx panes are not mounted.
   */
  panes?: PaneDefinition[];
  /**
   * cv2-03: optional layout persistence namespace (distinct per route).
   * Persisted under `patient-profile/v4-tree-layout::<storageKey>`.
   */
  storageKey?: string;
}

/**
 * Top-level client island for the v2 patient profile page.
 *
 * Plugs the real medical panes + the cockpit header strip into the cockpit v3
 * shell (`<CockpitV3Shell>`). This is the ONLY file in the patient-profile
 * shell surface allowed to import from `@/components/consultation/**`,
 * `@/components/ehr/**`, `@/lib/consultation/**`, or `@/types/appointment`
 * (DL-2 carve-out).
 */
export default function PatientProfilePage({
  appointment: appointmentProp,
  token,
  panes: panesProp,
  storageKey: storageKeyProp,
}: PatientProfilePageProps) {
  // Local copy — mirrors how ConsultationCockpit lifts appointment into state
  // so optimistic mutations (mark no-show, finish visit) update the UI
  // immediately without waiting for a full page re-fetch.
  const [appt, setAppt] = useState<Appointment>(appointmentProp);

  const launcherRef = useRef<ConsultationLauncherHandle>(null);
  const autoStartedIdRef = useRef<string | null>(null);
  const [rxMedicineCount, setRxMedicineCount] = useState(0);

  // ── Finish-visit / start-visit state ──────────────────────────────────────
  const [startBusy, setStartBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [, setFinishError] = useState<string | null>(null);
  const finishErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leaveExit, setLeaveExit] = useState<CockpitLeaveExit | null>(null);
  const leaveExitRef = useRef<CockpitLeaveExit | null>(null);
  leaveExitRef.current = leaveExit;

  const clearFinishErrorLater = useCallback(() => {
    if (finishErrorTimer.current) clearTimeout(finishErrorTimer.current);
    finishErrorTimer.current = setTimeout(() => setFinishError(null), 6_000);
  }, []);

  useEffect(() => {
    return () => {
      if (finishErrorTimer.current) clearTimeout(finishErrorTimer.current);
    };
  }, []);

  // csf-06: one-shot telemetry — first appointment-detail mount post Phase 2 flip.
  useEffect(() => {
    trackCockpitV2Phase2ShellFlipped(appt.id);
  }, [appt.id]);

  // cce-05: one-shot telemetry — first appointment-detail mount post R-CHART.
  useEffect(() => {
    trackCockpitV2RChartLanded(appt.id);
  }, [appt.id]);

  // cvd-02: one-shot telemetry — first appointment-detail mount post decommission.
  useEffect(() => {
    trackCockpitV2ProgramCompleted({
      phase2BatchesShipped: 8,
      phase3BatchesShipped: 6,
      soakDays: 5,
      killSwitchEscapeRatePct: 0,
    });
  }, []);

  // cpv-08: one-shot telemetry — first cockpit mount post visual-polish batch.
  useEffect(() => {
    trackCockpitPolishVisualSystemLanded({
      appointmentId: appt.id,
      batch: "cpv",
    });
  }, [appt.id]);

  // ── Derived cockpit state ─────────────────────────────────────────────────
  const state = useMemo(
    () =>
      deriveCockpitState({
        appointmentStatus: appt.status,
        session: appt.consultation_session ?? null,
        consultationType: appt.consultation_type ?? null,
        patientCheckedInAt: appt.patient_checked_in_at ?? null,
      }),
    [
      appt.status,
      appt.consultation_session,
      appt.consultation_type,
      appt.patient_checked_in_at,
    ]
  );

  const { setLiveFocus } = useDashboardLiveFocus();
  // Collapse dashboard nav while a consult is live; restore on leave/unmount.
  useEffect(() => {
    const active = state === "live";
    setLiveFocus(active);
    return () => setLiveFocus(false);
  }, [state, setLiveFocus]);

  const hasPatientId = Boolean(appt.patient_id);
  const showChart = shouldShowChartRail(state, hasPatientId);

  // Walk-in appointments use a separate localStorage key so their 2-pane
  // layout doesn't clobber the saved widths for the standard 3-pane layout.
  const storageKey =
    storageKeyProp ??
    (showChart ? TELEMED_VIDEO_LAYOUT_STORAGE_KEY : WALKIN_LAYOUT_STORAGE_KEY);

  // ── CockpitHeader handlers ────────────────────────────────────────────────

  const handleStartConsult = useCallback(
    (modality: ConsultationModality) => {
      const isInClinic =
        modality === "in_clinic" || appt.consultation_type === "in_clinic";
      if (isInClinic) {
        if (startBusy) return;
        setStartBusy(true);
        void postAppointmentCheckIn(token, appt.id)
          .then((res) => {
            setAppt(res.data.appointment);
          })
          .catch((err: unknown) => {
            console.error("[PatientProfilePage] Start visit failed:", err);
          })
          .finally(() => {
            setStartBusy(false);
          });
        return;
      }
      if (modality === "text" || modality === "voice" || modality === "video") {
        launcherRef.current?.start(modality);
      }
    },
    [appt.consultation_type, appt.id, startBusy, token]
  );

  useEffect(() => {
    if (autoStartedIdRef.current === appt.id) return;
    if (
      !shouldAutoStartInClinicVisit({
        consultationType: appt.consultation_type ?? null,
        appointmentStatus: appt.status,
        patientCheckedInAt: appt.patient_checked_in_at ?? null,
        appointmentDate: appt.appointment_date,
      })
    ) {
      return;
    }
    autoStartedIdRef.current = appt.id;
    handleStartConsult("in_clinic");
  }, [
    appt.id,
    appt.status,
    appt.consultation_type,
    appt.patient_checked_in_at,
    appt.appointment_date,
    handleStartConsult,
  ]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const next = (event as CustomEvent<Appointment>).detail;
      if (!next?.id || next.id !== appt.id) return;
      setAppt(next);
    };
    window.addEventListener(IN_CLINIC_APPOINTMENT_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(
        IN_CLINIC_APPOINTMENT_UPDATED_EVENT,
        onUpdated
      );
    };
  }, [appt.id]);

  const handleReschedule = useCallback(() => {
    // TODO: wire to the reschedule / book-again flow.
  }, []);

  const handleCancelAppointment = useCallback(() => {
    // TODO: wire to the cancel appointment flow.
  }, []);

  const handleFinishVisit = useCallback(async (): Promise<boolean> => {
    if (finishBusy) return false;
    if (appt.status === "completed") {
      clearConsultSteppedAway(appt.id);
      return true;
    }
    if (appt.status === "cancelled" || appt.status === "no_show") {
      setFinishError(
        `Cannot finish a ${appt.status.replace("_", "-")} appointment.`
      );
      clearFinishErrorLater();
      return false;
    }
    setFinishError(null);
    setFinishBusy(true);
    try {
      const res = await postAppointmentWrapUp(token, appt.id, {});
      setAppt(res.data.appointment);
      clearConsultSteppedAway(appt.id);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to finish visit";
      setFinishError(message);
      clearFinishErrorLater();
      console.error("[PatientProfilePage] Finish visit failed:", err);
      return false;
    } finally {
      setFinishBusy(false);
    }
  }, [appt.id, appt.status, finishBusy, token, clearFinishErrorLater]);

  // Re-entering the cockpit means the doctor is actively on this visit again.
  useEffect(() => {
    if (state === "live" || state === "wrap_up") {
      clearConsultSteppedAway(appt.id);
    }
  }, [appt.id, state]);

  const handleMarkNoShow = useCallback(async () => {
    try {
      await postDoctorMarkNoShow(token, appt.id);
      setAppt((prev) => ({ ...prev, status: "no_show" as const }));
    } catch (err) {
      console.error("[PatientProfilePage] Mark no-show failed:", err);
    }
  }, [token, appt.id]);

  const handleRxSent = useCallback(() => {
    /* intentionally empty — parity with ConsultationCockpit */
  }, []);

  // ── Panes array ───────────────────────────────────────────────────────────
  // tmr-04: Doctor's preferred template override from doctor_settings.
  const cockpitTemplateOverride = useDoctorCockpitTemplateOverride(token);

  const selectedTemplateId = useMemo<CockpitTemplate>(
    () =>
      mapStateToTemplate(
        state,
        appt.consultation_type ?? null,
        cockpitTemplateOverride
      ),
    [state, appt.consultation_type, cockpitTemplateOverride]
  );

  // tmr-05: one-shot telemetry — first mount per modality template per session.
  useEffect(() => {
    const overrideActive = cockpitTemplateOverride !== null;
    switch (selectedTemplateId) {
      case "telemed-voice":
        trackCockpitV2RModVoiceLanded({
          appointmentId: appt.id,
          overrideActive,
        });
        break;
      case "telemed-text":
        trackCockpitV2RModTextLanded({
          appointmentId: appt.id,
          overrideActive,
        });
        break;
      case "review":
        trackCockpitV2RModReviewLanded({
          appointmentId: appt.id,
          overrideActive,
        });
        break;
      // telemed-video already covered by trackCockpitV2Phase2ShellFlipped.
    }
  }, [selectedTemplateId, appt.id, cockpitTemplateOverride]);

  const templateContext: TelemedVideoContext = useMemo(
    () => ({
      appointment: appt,
      token,
      state,
      launcherRef,
      hideHeader: true,
      onRxSent: handleRxSent,
      onMarkNoShow: handleMarkNoShow,
      onFinishVisit: () => void handleFinishVisit(),
      onMedicineCountChange: setRxMedicineCount,
      finishBusy,
    }),
    [
      appt,
      token,
      state,
      launcherRef,
      handleRxSent,
      handleMarkNoShow,
      handleFinishVisit,
      finishBusy,
    ]
  );

  // ── Cockpit v3 flat tab registry (cv3t-01 · Phase 5) ──────────────────────
  // v3 mounts the eight uniform leaf tabs (Consult/Visit-summary + decoupled
  // Plan/Investigations). Walk-in mirrors the 2-tab body+plan subset;
  // `panesProp` test injection still wins.
  const v3Tabs = useMemo(
    () =>
      showChart
        ? buildCockpitTabs(templateContext, selectedTemplateId)
        : buildWalkInCockpitTabs(templateContext, selectedTemplateId),
    [showChart, templateContext, selectedTemplateId]
  );

  const v3Panes = panesProp ?? v3Tabs;

  // Suppress "declared but never read" lint warning — rxMedicineCount is lifted
  // here so cc-14's CollapsedRxRail (mounted when the Rx pane is collapsed) can
  // read the live count via a future prop addition (tracked in ppr-07 notes).
  void rxMedicineCount;

  // csf-01: one RxFormProvider per appointment page — sibling panes share form state.
  const rxFormSetup = useRxFormProviderSetup({
    appointmentId: appt.id,
    patientId: appt.patient_id ?? null,
    token,
  });

  // Built-in tabs use a portal slot for Consult; test-injected `panesProp`
  // trees render their own bodies and must not mount the stable host.
  const useStableConsultHost = panesProp == null;

  const pageContent = (
    // `-m-4 md:-m-6` cancels the parent `<DashboardShell>` `p-4 md:p-6`
    // padding so the patient-profile shell bleeds edge-to-edge — matches
    // v1 (`ConsultationCockpit.tsx` ~L2103). Without this, v2 renders
    // visibly inset on every side (parity bug surfaced in ppr-11 QA).
    //
    // Height must add the cancelled vertical padding back: `h-full` only spans
    // `<main>`'s content box, so with negative margins the shell stops short
    // of the bottom. `calc(100% + padding)` fills `<main>`'s padding box so
    // the footer sits flush. Requires a definite height chain on ancestors
    // (DashboardShell row + main both use `min-h-0 flex-1`).
    <ConsultSurfaceProvider>
      <div className="-m-4 md:-m-6 flex h-[calc(100%_+_2rem)] md:h-[calc(100%_+_3rem)] min-h-0 flex-col overflow-hidden">
        {/* Mount keyboard handlers once at the page root. */}
        <CommandBar />
        <KeyboardHelpHost />
        {/* ── Cockpit header (includes CockpitQueueRail internally) ─────────── */}
        <CockpitHeader
          appointment={appt}
          state={state}
          token={token}
          onStartConsult={handleStartConsult}
          onReschedule={handleReschedule}
          onCancelAppointment={handleCancelAppointment}
          onMarkNoShow={handleMarkNoShow}
          onFinishVisit={handleFinishVisit}
          finishBusy={finishBusy}
          startBusy={startBusy}
        />

        <CockpitLeaveGuard
          appointmentId={appt.id}
          active={state === "live" || state === "wrap_up"}
          onLeaveIntent={setLeaveExit}
        />

        {/* ── Patient context ribbon (crb-03) ──────────────────────────────── */}
        {/* Mounted only for known-patient desktop views. Walk-in (!showChart)
            skips the ribbon per DL-6/7. Mobile <lg viewport hidden via Tailwind.
            Hidden during live consult so video + chart get the vertical room. */}
        {showChart && state !== "live" && (
          <div className="hidden lg:block">
            <PatientRibbon appointment={appt} token={token} />
          </div>
        )}

        {/* ── Cockpit v3 shell — takes remaining vertical space ─────────────── */}
        <div className="min-h-0 flex-1">
          <CockpitV3Shell
            panes={v3Panes}
            storageKey={storageKey}
            token={token}
            consultActive={state === "live"}
            safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
            actionDock={
              <CockpitRxActionDock
                state={state}
                appointmentId={appt.id}
                patientId={appt.patient_id ?? null}
                patientName={appt.patient_name}
                patientIdentity={{
                  phone: appt.patient_phone,
                  ageYears: appt.patient_age,
                  sex: appt.patient_sex,
                  guardianName: appt.patient_guardian_name,
                  guardianRelation: appt.patient_guardian_relation,
                  mrn: appt.patient_mrn,
                  visitDate: appt.appointment_date,
                }}
                token={token}
                finishBusy={finishBusy}
                leaveExit={leaveExit}
                onFinish={() => {
                  void handleFinishVisit().then((ok) => {
                    if (ok) leaveExitRef.current?.continueAfterFinish();
                  });
                }}
                onSent={handleRxSent}
              />
            }
            // Must be a React child of CallStageChromeProvider inside the shell
            // so portaled VideoRoom receives chat min-width / Focus widen.
            consultSurfaceHost={
              useStableConsultHost ? (
                <ConsultSurfaceHost>
                  {renderConsultBodySurface(
                    templateContext,
                    selectedTemplateId
                  )}
                </ConsultSurfaceHost>
              ) : null
            }
          />
        </div>
      </div>
    </ConsultSurfaceProvider>
  );

  // `<RxFormProvider>` mounts on first paint with empty fields (autosave off).
  // When the draft resolves, `initialFields` soft-`RESET`s the form — `key`
  // stays on `appointmentId` so PatientRibbon is not remounted (avoids a second
  // ribbon skeleton / chart refetch on every load).
  const { key: rxProviderKey, ...rxProviderProps } = rxFormSetup.providerProps;
  return (
    <RxFormProvider key={rxProviderKey} {...rxProviderProps}>
      <RxSafetyProvider token={token} patientId={appt.patient_id ?? null}>
        <RxFormActionsBridgeProvider>
          <PrescriptionFormShellProvider value={rxFormSetup}>
            {/* Side-sheet host — mounted once here, above the v3 shell (which
                lives inside `pageContent`), so any pane that calls
                `useSideSheet()` (HistoryPane, PlanSection, Rx favorites /
                previous-Rx) has a provider. This is the single documented
                mount point (see SideSheetHost.tsx). */}
            <SideSheetHost>{pageContent}</SideSheetHost>
          </PrescriptionFormShellProvider>
        </RxFormActionsBridgeProvider>
      </RxSafetyProvider>
    </RxFormProvider>
  );
}

/** tmr-04: reads `doctor_settings.cockpit_template_override` once per mount. */
function useDoctorCockpitTemplateOverride(
  token: string
): CockpitTemplateOverride {
  const [override, setOverride] = useState<CockpitTemplateOverride>(null);

  useEffect(() => {
    let cancelled = false;
    void getDoctorSettingsShared(token)
      .then((res) => {
        if (!cancelled) {
          setOverride(res.data.settings.cockpit_template_override ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setOverride(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return override;
}
