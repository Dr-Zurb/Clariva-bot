"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveCockpitState,
  shouldShowChartRail,
  mapStateToTemplate,
  type CockpitTemplateOverride,
} from "@/lib/patient-profile/state";
import { postAppointmentWrapUp, postDoctorMarkNoShow } from "@/lib/api";
import type { Appointment, ConsultationModality } from "@/types/appointment";
import type { CockpitLayout, ColumnSlots } from "@/components/consultation/cockpit/preset-types";
import CockpitHeader from "@/components/patient-profile/PatientProfileHeader";
import { PatientRibbon } from "@/components/patient-profile/PatientRibbon";
import SavePresetDialog from "@/components/consultation/cockpit/SavePresetDialog";
import ManagePresetsDialog from "@/components/consultation/cockpit/ManagePresetsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConsultationLauncherHandle } from "@/components/consultation/ConsultationLauncher";
import CommandBar from "@/components/patient-profile/CommandBar";
import KeyboardHelpHost from "@/components/patient-profile/KeyboardHelpHost";
import PatientProfileShell from "@/components/patient-profile/Shell";
import type { PatientProfileShellHandle } from "@/components/patient-profile/Shell";
import CockpitV3Shell from "@/components/patient-profile/v3/CockpitV3Shell";
import {
  buildCockpitTabs,
  buildWalkInCockpitTabs,
} from "@/lib/patient-profile/v3/cockpit-tabs";
import {
  cockpitV3Enabled,
  isCockpitV3BuildTimeDisabled,
  isCockpitV3KillSwitchEngaged,
} from "@/lib/patient-profile/v3/flags";
import PaneToggleBar from "@/components/patient-profile/PaneToggleBar";
import CustomizeBar, {
  LayoutCrampedNudge,
} from "@/components/patient-profile/CustomizeBar";
import {
  LayoutNode,
  PaneDefinition,
  PatientProfileLayout,
  PaneRuntimeState,
  collectPaneLeafIds,
  flattenPaneDefinitions,
} from "@/lib/patient-profile/types";
import {
  BUILT_IN_PRESETS,
  convertTemplateToTree,
  type BuiltInLayoutPreset,
} from "@/lib/patient-profile/layout-presets-builtin";
import { collectLayoutPaneIds } from "@/lib/patient-profile/layout-node-bridge";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import {
  countLeaves,
  restoreLeaf,
  moveLeafBetweenTabs,
  extractFromTabsNode,
  dropPaneIntoZone,
  type DropZone,
} from "@/lib/patient-profile/layout-tree-mutations";
import {
  listTabsContainers,
  resolveMoveSourcePaneId,
  flatToPaneTree,
  paneTreeToFlat,
  CRAMPED_ROOT_SIBLINGS,
  describeLayoutShape,
} from "@/lib/patient-profile/layout-tree";
import type { PaneContextMenuMoveOption } from "@/components/patient-profile/PaneContextMenu";
import type { CockpitLayoutPresetTree } from "@/lib/api/cockpit-layout-presets-tree";
import { useLayoutTreePresets } from "@/hooks/useLayoutTreePresets";
import {
  shouldRunSeed,
  readLegacyLayoutOnce,
  markSeedDone,
  LAYOUT_STORAGE_KEY,
  TELEMED_VIDEO_LAYOUT_STORAGE_KEY,
  WALKIN_LAYOUT_STORAGE_KEY,
} from "@/lib/patient-profile/layout";
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
  getReviewTemplate,
  type TelemedVideoContext,
  type CockpitTemplate,
} from "@/lib/patient-profile/templates";
import { getDoctorSettings } from "@/lib/api";
import { readPersistedLayout } from "@/lib/patient-profile/useShellLayout";
import { translateLegacyPreset } from "@/lib/patient-profile/preset-translation";
import {
  usePatientProfilePresets,
  type CustomPreset,
} from "@/hooks/usePatientProfilePresets";
import type { PresetsState, CockpitLayoutPreset } from "@/components/consultation/cockpit/preset-types";
import { useShellHotkeys } from "@/hooks/useShellHotkeys";
import { SafetyStickyStrip } from "@/components/cockpit/middle/SafetyStickyStrip";
import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";
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
  trackCockpitV2RLayoutUxPresetApplied,
  trackCockpitV2RLayoutUxPresetSaved,
  trackCockpitV2RLayoutUxTreeMutation,
  trackCockpitPaneFreedomMoveViaContextMenu,
  trackCockpitPaneFreedomDragDrop,
  trackCockpitPaneFreedomCustomizeToggled,
  trackCockpitPaneFreedomPresetCrud,
  trackCockpitPaneFreedomLayoutShape,
  trackCockpitV2ProgramCompleted,
  trackCockpitPolishVisualSystemLanded,
  trackCockpitV3ShellRendered,
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
 * Wave 2 (ppr-07): plugs real medical panes + the cockpit header strip into
 * `<PatientProfileShell>`. This is the ONLY file in the new shell allowed to
 * import from `@/components/consultation/**`, `@/components/ehr/**`,
 * `@/lib/consultation/**`, or `@/types/appointment` (DL-2 carve-out).
 *
 * Handlers that only ppr-09 (presets) or ppr-10 (hotkeys) will fully drive
 * are wired as no-op stubs here; each is annotated with the filling task.
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
  const shellRef = useRef<PatientProfileShellHandle>(null);
  const [rxMedicineCount, setRxMedicineCount] = useState(0);

  // ── Finish-visit state ────────────────────────────────────────────────────
  const [finishBusy, setFinishBusy] = useState(false);
  const [, setFinishError] = useState<string | null>(null);
  const finishErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // cv3x-02: which shell rendered (v3 vs legacy) — soak + kill-switch monitoring.
  useEffect(() => {
    const v3 = cockpitV3Enabled();
    trackCockpitV3ShellRendered({
      appointmentId: appt.id,
      shell: v3 ? "v3" : "legacy",
      killSwitchEngaged: isCockpitV3KillSwitchEngaged(),
      buildTimeOff: isCockpitV3BuildTimeDisabled(),
    });
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
      }),
    [appt.status, appt.consultation_session],
  );

  const hasPatientId = Boolean(appt.patient_id);
  const showChart = shouldShowChartRail(state, hasPatientId);

  // Walk-in appointments use a separate localStorage key so their 2-pane
  // layout doesn't clobber the saved widths for the standard 3-pane layout.
  // Defined early so preset callbacks (handleApplyColumnOrder, handleOpenSavePresetDialog)
  // can capture the correct key without a temporal dependency.
  const storageKey =
    storageKeyProp ??
    (showChart
      ? TELEMED_VIDEO_LAYOUT_STORAGE_KEY
      : WALKIN_LAYOUT_STORAGE_KEY);

  /** Read saved widths from pre-csf-04 keys when the telemed namespace is empty. */
  const layoutLegacyStorageKeys = useMemo(
    () =>
      !storageKeyProp && showChart ? [LAYOUT_STORAGE_KEY] : [],
    [storageKeyProp, showChart],
  );

  // ── CockpitHeader handlers ────────────────────────────────────────────────

  const handleStartConsult = useCallback(
    (modality: ConsultationModality) => {
      // Map `in_clinic` → `video` to match the launcher's resolveBookedModality.
      const m: "text" | "voice" | "video" =
        modality === "in_clinic" ? "video" : modality;
      launcherRef.current?.start(m);
    },
    [],
  );

  const handleReschedule = useCallback(() => {
    // TODO: wire to the reschedule / book-again flow.
  }, []);

  const handleCancelAppointment = useCallback(() => {
    // TODO: wire to the cancel appointment flow.
  }, []);

  const handleFinishVisit = useCallback(async () => {
    if (finishBusy) return;
    if (appt.status === "completed") return;
    if (appt.status === "cancelled" || appt.status === "no_show") {
      setFinishError(`Cannot finish a ${appt.status.replace("_", "-")} appointment.`);
      clearFinishErrorLater();
      return;
    }
    setFinishError(null);
    setFinishBusy(true);
    try {
      const res = await postAppointmentWrapUp(token, appt.id, {});
      setAppt(res.data.appointment);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to finish visit";
      setFinishError(message);
      clearFinishErrorLater();
      console.error("[PatientProfilePage] Finish visit failed:", err);
    } finally {
      setFinishBusy(false);
    }
  }, [appt.id, appt.status, finishBusy, token, clearFinishErrorLater]);

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

  // ── Stable applyLayout callback for the presets hook ─────────────────────
  // Uses a ref-forward pattern so the hook captures a stable identity even
  // though shellRef.current is null at hook-init time.
  const stableApplyLayout = useCallback((layout: PatientProfileLayout) => {
    shellRef.current?.applyLayout(layout);
  }, []);

  // ── Preset hook (ppr-09) ──────────────────────────────────────────────────
  const presetsHook = usePatientProfilePresets({ applyLayout: stableApplyLayout });
  const layoutTreePresets = useLayoutTreePresets();
  const [currentLayoutTree, setCurrentLayoutTree] = useState<LayoutNode | null>(
    null,
  );

  // ── Customize mode (cpfc-01 / P3-DL-1, P3-DL-2) ──────────────────────────────
  // Ephemeral page state — NEVER persisted. Resets to off on appointment change.
  const [customizeMode, setCustomizeMode] = useState(false);
  const [crampedDismissed, setCrampedDismissed] = useState(false);

  // P3-DL-2: reset to off whenever the appointment changes (new page context).
  useEffect(() => {
    setCustomizeMode(false);
  }, [appt.id]);

  const handleToggleCustomizeMode = useCallback(
    (source: "button" | "hotkey") => {
      setCustomizeMode((prev) => {
        const next = !prev;
        trackCockpitPaneFreedomCustomizeToggled({ enabled: next, source });
        if (!next) {
          const paneTree = shellRef.current?.getPaneTree();
          if (paneTree) {
            trackCockpitPaneFreedomLayoutShape(describeLayoutShape(paneTree));
          }
        }
        return next;
      });
    },
    [],
  );

  // ── Save / Manage dialog open state ───────────────────────────────────────
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  /**
   * Snapshot of the layout at the moment the Save dialog was opened.
   * Captured from localStorage (the shell writes there with a 200 ms debounce
   * so the value is always fresh enough for saving).
   */
  const [layoutForDialog, setLayoutForDialog] = useState<PatientProfileLayout | null>(null);

  // ── Bridged presetsState for CockpitHeader (still v1-typed) ───────────────
  // CockpitHeader expects PresetsState / CockpitLayoutPreset from useCockpitPresets.
  // We adapt by casting the PatientProfileLayout inside each CustomPreset as
  // CockpitLayout — CockpitHeader only passes the layout back via onApplyPreset,
  // which we intercept and translate below.
  const presetsState = useMemo((): PresetsState => {
    if (presetsHook.loading) return { status: "loading" };
    const presets: CockpitLayoutPreset[] = presetsHook.customs.map(
      (p: CustomPreset) => ({
        id: p.id,
        name: p.name,
        created_at: p.createdAt,
        // PatientProfileLayout (v2-tagged) passes through translateLegacyPreset
        // unchanged when onApplyPreset is called — the type cast is safe here.
        layout: p.layout as unknown as CockpitLayout,
      }),
    );
    return { status: "ready", presets };
  }, [presetsHook.loading, presetsHook.customs]);

  // ── Layout / preset handlers (ppr-09) ────────────────────────────────────

  const handleApplyPreset = useCallback(
    (layout: CockpitLayout) => {
      // For custom presets the layout is actually a PatientProfileLayout (v2-tagged)
      // passed through via the bridged presetsState above.
      // For v1 built-in presets rendered inside CockpitHeader the layout is the
      // legacy shape — translateLegacyPreset handles both cases.
      const translated = translateLegacyPreset(layout as unknown);
      if (translated) shellRef.current?.applyLayout(translated);
    },
    [],
  );

  const handleApplyColumnOrder = useCallback(
    (slots: ColumnSlots) => {
      // Reorder the shell panes to match the selected column permutation while
      // preserving the current sizes. We read from localStorage (the shell's
      // debounced write target) to get the freshest saved state.
      if (typeof window === "undefined") return;
      try {
        const current = readPersistedLayout(storageKey, layoutLegacyStorageKeys);
        if (current) {
          const flat = paneTreeToFlat(current.paneTree);
          const paneState = Object.fromEntries(
            slots.map((id) => [
              id,
              flat.paneState[id] ?? { sizePct: 33, hidden: false },
            ]),
          );
          shellRef.current?.applyLayout({
            version: 5,
            paneTree: flatToPaneTree({ paneOrder: [...slots], paneState }),
          });
          return;
        }
      } catch {
        // localStorage unavailable or corrupt — fall through to no-op
      }
    },
    [storageKey, layoutLegacyStorageKeys],
  );

  const handleOpenSavePresetDialog = useCallback(() => {
    // Snapshot the current layout from localStorage before opening the dialog.
    if (typeof window !== "undefined") {
      try {
        const layout = readPersistedLayout(storageKey, layoutLegacyStorageKeys);
        if (layout) setLayoutForDialog(layout);
      } catch {
        setLayoutForDialog(null);
      }
    }
    setSaveDialogOpen(true);
  }, [storageKey, layoutLegacyStorageKeys]);

  const handleOpenManagePresetsDialog = useCallback(() => {
    setManageDialogOpen(true);
  }, []);

  // ── Panes array ───────────────────────────────────────────────────────────
  // tmr-04: Doctor's preferred template override from doctor_settings.
  const cockpitTemplateOverride = useDoctorCockpitTemplateOverride(token);

  const selectedTemplateId = useMemo<CockpitTemplate>(
    () =>
      mapStateToTemplate(
        state,
        appt.consultation_type ?? null,
        cockpitTemplateOverride,
      ),
    [state, appt.consultation_type, cockpitTemplateOverride],
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
    ],
  );

  const dispatchedTemplate = useMemo(() => {
    switch (selectedTemplateId) {
      case "telemed-voice":
        return getTelemedVoiceTemplate(templateContext);
      case "telemed-text":
        return getTelemedTextTemplate(templateContext);
      case "review":
        return getReviewTemplate(templateContext);
      case "telemed-video":
      default:
        return getTelemedVideoTemplate(templateContext);
    }
  }, [selectedTemplateId, templateContext]);

  const panesToMount = useMemo(() => {
    if (!showChart) {
      // Walk-in fallback (DL-5): 2-pane body + plan from the dispatched template.
      const { paneById } = flattenPaneDefinitions(dispatchedTemplate);
      const body = paneById.body;
      const plan = paneById.plan;
      if (body && plan) return [body, plan];
    }
    return dispatchedTemplate;
  }, [showChart, dispatchedTemplate]);

  const panes = panesProp ?? panesToMount;

  // ── Cockpit v3 flat tab registry (cv3t-01 · Phase 5) ──────────────────────
  // v3 mounts the eight uniform leaf tabs (Consult/Visit-summary + decoupled
  // Plan/Investigations), NOT the nested column template above. The legacy
  // shell keeps consuming `panes` (the column template) until cv3x-03. Walk-in
  // mirrors the 2-tab body+plan subset; `panesProp` test injection still wins.
  const v3Tabs = useMemo(
    () =>
      showChart
        ? buildCockpitTabs(templateContext, selectedTemplateId)
        : buildWalkInCockpitTabs(templateContext, selectedTemplateId),
    [showChart, templateContext, selectedTemplateId],
  );

  const v3Panes = panesProp ?? v3Tabs;

  const templateLayoutTree = useMemo(
    () => convertTemplateToTree(dispatchedTemplate),
    [dispatchedTemplate],
  );

  const templatePaneIds = useMemo(
    () => collectLayoutPaneIds(templateLayoutTree),
    [templateLayoutTree],
  );

  const isCramped = useMemo(() => {
    const root = currentLayoutTree ?? templateLayoutTree;
    return (
      root?.kind === "split" &&
      root.direction === "horizontal" &&
      root.children.length > CRAMPED_ROOT_SIBLINGS
    );
  }, [currentLayoutTree, templateLayoutTree]);

  const paneTitleById = useMemo(() => {
    const { paneById } = flattenPaneDefinitions(panes);
    return Object.fromEntries(
      Object.entries(paneById).map(([id, def]) => [id, def.title]),
    );
  }, [panes]);

  const handleApplyLayoutTreePreset = useCallback(
    (preset: BuiltInLayoutPreset | CockpitLayoutPresetTree) => {
      const tree = preset.layoutTree;
      if (!tree) return;
      shellRef.current?.applyLayoutTree(tree);
      trackCockpitV2RLayoutUxPresetApplied({
        presetId: preset.id,
        isBuiltIn: preset.id.startsWith("builtin-"),
        paneCount: countLeaves(tree),
      });
    },
    [],
  );

  const handleSaveLayoutTreePreset = useCallback(
    async (name: string) => {
      const tree = shellRef.current?.getLayoutTree();
      if (!tree) return;
      await layoutTreePresets.savePreset(name, tree, selectedTemplateId);
      trackCockpitV2RLayoutUxPresetSaved({ paneCount: countLeaves(tree) });
    },
    [layoutTreePresets, selectedTemplateId],
  );

  const handleResetLayoutTreePreset = useCallback(
    (preset: CockpitLayoutPresetTree) => {
      if (!preset.sourceTemplateId) return;
      const builtin = BUILT_IN_PRESETS.find(
        (p) => p.sourceTemplateId === preset.sourceTemplateId,
      );
      if (!builtin) return;
      shellRef.current?.applyLayoutTree(builtin.layoutTree);
      trackCockpitV2RLayoutUxPresetApplied({
        presetId: builtin.id,
        isBuiltIn: true,
        paneCount: countLeaves(builtin.layoutTree),
      });
    },
    [],
  );

  const handleResetToDefault = useCallback(() => {
    const builtin =
      BUILT_IN_PRESETS.find((p) => p.sourceTemplateId === selectedTemplateId) ??
      BUILT_IN_PRESETS[0];
    shellRef.current?.applyLayoutTree(builtin.layoutTree);
    trackCockpitV2RLayoutUxPresetApplied({
      presetId: builtin.id,
      isBuiltIn: true,
      paneCount: countLeaves(builtin.layoutTree),
    });
  }, [selectedTemplateId]);

  const handleDeleteLayoutTreePreset = useCallback(
    async (id: string) => {
      await layoutTreePresets.deletePreset(id);
      trackCockpitPaneFreedomPresetCrud({
        op: "delete",
        presetCount: layoutTreePresets.presets.length - 1,
      });
    },
    [layoutTreePresets],
  );

  const handleRenameLayoutTreePreset = useCallback(
    async (id: string, name: string) => {
      await layoutTreePresets.renamePreset(id, name);
      trackCockpitPaneFreedomPresetCrud({
        op: "rename",
        presetCount: layoutTreePresets.presets.length,
      });
    },
    [layoutTreePresets],
  );

  const handleRestoreHiddenPane = useCallback((paneId: string) => {
    const current = shellRef.current?.getLayoutTree();
    if (!current) return;
    const result = restoreLeaf(current, paneId);
    if (!result.ok) {
      if (result.reason === "cap-reached") {
        layoutUxToast.error(
          "Layout limit reached (10 sub-panes max). Merge or hide a pane to add more.",
        );
      }
      return;
    }
    shellRef.current?.applyLayoutTree(result.tree);
    trackCockpitV2RLayoutUxTreeMutation({ op: "restore", paneId });
  }, []);

  const handleMovePaneTo = useCallback(
    (contextPaneId: string, target: PaneContextMenuMoveOption) => {
      const shell = shellRef.current;
      if (!shell) return;
      const currentTree = shell.getPaneTree();
      const sourcePaneId = resolveMoveSourcePaneId(currentTree, contextPaneId);

      if (sourcePaneId === "body" && state === "live") {
        layoutUxToast.error("Pause the consult before rearranging.");
        return;
      }

      let result:
        | ReturnType<typeof moveLeafBetweenTabs>
        | ReturnType<typeof extractFromTabsNode>;
      if (target.kind === "tab-into") {
        result = moveLeafBetweenTabs(
          currentTree,
          sourcePaneId,
          target.groupId,
        );
      } else {
        const direction =
          target.kind === "split-horizontal" ? "horizontal" : "vertical";
        result = extractFromTabsNode(currentTree, sourcePaneId, direction);
      }
      if (!result.ok) {
        layoutUxToast.error(`Could not move pane: ${result.reason}`);
        if (typeof console !== "undefined") {
          console.warn(
            "[PatientProfilePage] move pane failed:",
            result.reason,
          );
        }
        return;
      }
      shell.applyLayout({ version: 5, paneTree: result.tree });
      trackCockpitPaneFreedomMoveViaContextMenu({
        sourcePaneId,
        targetType: target.kind,
      });
    },
    [state],
  );

  const handleDropPaneOnZone = useCallback(
    (sourcePaneId: string, targetGroupId: string, zone: DropZone) => {
      const shell = shellRef.current;
      if (!shell) return;
      const currentTree = shell.getPaneTree();

      if (sourcePaneId === "body" && state === "live") {
        layoutUxToast.error("Pause the consult before rearranging.");
        return;
      }

      const result = dropPaneIntoZone(
        currentTree,
        sourcePaneId,
        targetGroupId,
        zone,
      );
      if (!result.ok) {
        if (result.reason !== "no-op") {
          layoutUxToast.error(`Could not move pane: ${result.reason}`);
          if (typeof console !== "undefined") {
            console.warn(
              "[PatientProfilePage] drop pane failed:",
              result.reason,
            );
          }
        }
        return;
      }
      shell.applyLayout({ version: 5, paneTree: result.tree });
      trackCockpitPaneFreedomDragDrop({
        sourcePaneId,
        targetGroupId,
        zone,
      });
    },
    [state],
  );

  const canDropSource = useCallback(
    (sourcePaneId: string | null, _targetGroupId: string): boolean => {
      if (!sourcePaneId) return false;
      if (sourcePaneId === "body" && state === "live") return false;
      return true;
    },
    [state],
  );

  const canTabInto = useCallback(
    (sourcePaneId: string | null, targetGroupId: string): boolean => {
      if (!sourcePaneId) return false;
      const tree = shellRef.current?.getPaneTree();
      if (!tree) return true;
      const container = listTabsContainers(tree).find(
        (c) => c.id === targetGroupId,
      );
      return !container?.paneIds.includes(sourcePaneId);
    },
    [],
  );

  const computeMoveTargets = useCallback(
    (contextPaneId: string): PaneContextMenuMoveOption[] => {
      const tree = shellRef.current?.getPaneTree();
      if (!tree) return [];
      const sourcePaneId = resolveMoveSourcePaneId(tree, contextPaneId);
      const groups = listTabsContainers(
        tree,
        (id) => paneTitleById[id] ?? id,
      );
      return groups
        .filter((g) => !g.paneIds.includes(sourcePaneId))
        .map(
          (g): PaneContextMenuMoveOption => ({
            kind: "tab-into",
            groupId: g.id,
            label: g.label,
          }),
        );
    },
    [paneTitleById],
  );

  const computeMoveDisabled = useCallback(
    (contextPaneId: string): { reason: string } | undefined => {
      const tree = shellRef.current?.getPaneTree();
      if (!tree) return undefined;
      const sourcePaneId = resolveMoveSourcePaneId(tree, contextPaneId);
      if (sourcePaneId === "body" && state === "live") {
        return { reason: "Pause the consult before rearranging." };
      }
      return undefined;
    },
    [state],
  );

  const paneMoveUx = useMemo(
    () => ({
      getMoveTargets: computeMoveTargets,
      onMovePane: handleMovePaneTo,
      getMoveDisabled: computeMoveDisabled,
      onDropPaneOnZone: handleDropPaneOnZone,
      canDropSource,
      canTabInto,
    }),
    [
      computeMoveTargets,
      handleMovePaneTo,
      computeMoveDisabled,
      handleDropPaneOnZone,
      canDropSource,
      canTabInto,
    ],
  );

  const layoutTreeUx = useMemo(() => {
    return {
      currentLayoutTree: currentLayoutTree ?? templateLayoutTree,
      templatePaneIds,
      paneTitleById,
      customPresets: layoutTreePresets.presets,
      customPresetsLoading: layoutTreePresets.loading,
      customPresetsError: layoutTreePresets.error,
      atPresetCap: layoutTreePresets.atCap,
      onApplyPreset: handleApplyLayoutTreePreset,
      onSaveCurrentLayout: handleSaveLayoutTreePreset,
      onResetToTemplate: handleResetLayoutTreePreset,
      onRestoreHiddenPane: handleRestoreHiddenPane,
      customizeMode,
      onDeletePreset: handleDeleteLayoutTreePreset,
      onRenamePreset: handleRenameLayoutTreePreset,
    };
  }, [
    currentLayoutTree,
    templateLayoutTree,
    templatePaneIds,
    paneTitleById,
    layoutTreePresets.presets,
    layoutTreePresets.loading,
    layoutTreePresets.error,
    layoutTreePresets.atCap,
    handleApplyLayoutTreePreset,
    handleSaveLayoutTreePreset,
    handleResetLayoutTreePreset,
    handleRestoreHiddenPane,
    customizeMode,
    handleDeleteLayoutTreePreset,
    handleRenameLayoutTreePreset,
  ]);

  // Nested trees (cv2-03 / csf-04): toggle bar needs every leaf id.
  const toggleBarPanes = useMemo(
    () => Object.values(flattenPaneDefinitions(panes).paneById),
    [panes],
  );

  const defaultLeafPaneOrder = useMemo(
    () => flattenPaneDefinitions(panes).paneOrder,
    [panes],
  );

  // ── Shell layout state — kept in sync for useShellHotkeys (ppr-10) ────────
  // Tracks pane order and collapsed bits from the shell's useShellLayout so the
  // hotkey hook can toggle the correct slot after a drag-to-reorder. Size
  // changes (during resize drags) do NOT trigger onLayoutChange — only order /
  // collapse changes do (see Shell.tsx collapsedKey dep).
  // Initialised as [] — Shell fires onLayoutChange after mount with the actual
  // stored order. The walk-in applyPreset wrapper falls back to panes.map()
  // when shellPaneOrder is still empty on first render.
  const [shellPaneOrder, setShellPaneOrder] = useState<string[]>([]);
  const [shellPaneState, setShellPaneState] = useState<
    Record<string, PaneRuntimeState>
  >({});

  // csl-03 (2026-05-26): runtime safety net — if Shell hands us a paneOrder
  // whose ids don't exist in the current template's `toggleBarPanes`
  // registry, fall back to defaults so the toggle bar isn't silently empty.
  // Belt-and-braces with the same check inside `useShellLayout`'s hydration
  // (which discards the stale localStorage entry one tick later). Declared
  // AFTER the shellPaneOrder state so the TDZ doesn't bite.
  const toggleBarPaneOrder = useMemo(() => {
    if (shellPaneOrder.length === 0) return defaultLeafPaneOrder;
    const hasAllTemplateLeaves = defaultLeafPaneOrder.every((id) =>
      shellPaneOrder.includes(id),
    );
    return hasAllTemplateLeaves ? shellPaneOrder : defaultLeafPaneOrder;
  }, [shellPaneOrder, defaultLeafPaneOrder]);

  const handleLayoutChange = useCallback(
    (order: string[], state: Record<string, PaneRuntimeState>) => {
      setShellPaneOrder(order);
      setShellPaneState(state);
    },
    [],
  );

  // ── Visible / hidden pane id lists for the Layout dropdown ────────────────
  // Derived from the live pane order + visibility state so the "Column order"
  // section in the Layout dropdown shows only the permutations that make
  // sense for the panes currently on screen (2 visible → 2 entries; 3 → 6).
  const effectivePaneOrder =
    shellPaneOrder.length > 0 ? shellPaneOrder : defaultLeafPaneOrder;
  const visiblePaneIds = useMemo(
    () => effectivePaneOrder.filter((id) => !shellPaneState[id]?.hidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectivePaneOrder.join(","), shellPaneState],
  );
  const hiddenPaneIds = useMemo(
    () => effectivePaneOrder.filter((id) => shellPaneState[id]?.hidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectivePaneOrder.join(","), shellPaneState],
  );

  // Stable setPaneHidden — reads from shellRef at call time.
  const handleSetPaneHidden = useCallback(
    (id: string, hidden: boolean) => {
      shellRef.current?.setPaneHidden(id, hidden);
    },
    [],
  );

  // Toggle bar callbacks — forwarded to the shell's imperative handle.
  const handleToggleHidden = useCallback(
    (paneId: string) => {
      const wasHidden = shellPaneState[paneId]?.hidden ?? false;
      shellRef.current?.setPaneHidden(paneId, !wasHidden);
    },
    [shellPaneState],
  );

  const handleReorder = useCallback((fromId: string, toId: string) => {
    shellRef.current?.reorderPane(fromId, toId);
  }, []);

  // ── Live-consult guard (ppr-15e) ──────────────────────────────────────────
  // When the Consultation pane is toggled OFF while a consult is active, show
  // a confirmation dialog before hiding. The guard fires ONLY on the toggle-bar
  // click path — hotkeys and preset-apply call `setPaneHidden` directly and
  // intentionally bypass this check (deliberate carve-out per task notes).
  // Uses the derived CockpitState (not appointment.status directly) because
  // "live" is a CockpitState value, not an AppointmentStatus value.
  const isConsultActive = state === "live";
  const [pendingHide, setPendingHide] = useState<string | null>(null);

  const handleBeforeHide = useCallback(
    (paneId: string): boolean | undefined => {
      if (paneId !== "body") return undefined;  // not Consultation → allow
      if (!isConsultActive) return undefined;   // not active → allow
      setPendingHide(paneId);                   // open the confirmation dialog
      return false;                             // cancel this toggle event
    },
    [isConsultActive],
  );

  const handleToggleColumn = useCallback(
    (columnId: string) => {
      const column = panes.find((p) => p.id === columnId);
      if (!column) return;

      const shell = shellRef.current;
      if (!shell) return;

      const templateLeafIds = collectPaneLeafIds(column);
      if (templateLeafIds.length === 0) return;

      const liveOrder = shell.paneOrder;
      const liveState = shell.paneState;
      // Prefer ids that exist in the persisted tree; fall back to template ids
      // when the shell has not yet fired onLayoutChange (first paint).
      const leafIds = templateLeafIds.filter((id) => liveOrder.includes(id));
      const targetLeafIds =
        leafIds.length > 0 ? leafIds : templateLeafIds;

      const anyVisible = targetLeafIds.some(
        (id) => !(liveState[id]?.hidden ?? false),
      );

      if (anyVisible) {
        for (const id of targetLeafIds) {
          if (liveState[id]?.hidden) continue;
          if (handleBeforeHide(id) === false) return;
        }
        const toHide = targetLeafIds.filter((id) => !liveState[id]?.hidden);
        shell.setLeafIdsHidden(toHide, true);
      } else {
        shell.setLeafIdsHidden(targetLeafIds, false);
      }
    },
    [panes, handleBeforeHide],
  );

  // Walk-in-aware applyPreset wrapper.
  // When in walk-in mode (no chart pane), any 3-pane built-in preset is
  // replaced with a balanced 2-pane layout so the shell's absorber math stays
  // coherent. A console.info documents the adjustment; wire a toast when a
  // centralised toast system is adopted (tracked in docs/Work/capture/inbox.md).
  const handleApplyPresetForHotkeys = useCallback(
    (presetId: string): boolean => {
      if (!showChart) {
        const order =
          shellPaneOrder.length > 0 ? shellPaneOrder : panes.map((p) => p.id);
        const sizePct = Math.floor(100 / order.length);
        const balanced: PatientProfileLayout = {
          version: 5,
          paneTree: flatToPaneTree({
            paneOrder: order,
            paneState: Object.fromEntries(
              order.map((id) => [id, { sizePct, hidden: false }]),
            ),
          }),
        };
        shellRef.current?.applyLayout(balanced);
        console.info(
          "[PatientProfilePage] Walk-in: applied balanced 2-pane layout " +
            `(preset "${presetId}" adjusted for walk-in).`,
        );
        return true;
      }
      return presetsHook.applyPreset(presetId);
    },
    [showChart, shellPaneOrder, panes, presetsHook],
  );

  // ── Hotkeys (ppr-10) ──────────────────────────────────────────────────────
  useShellHotkeys({
    paneOrder: shellPaneOrder,
    paneState: shellPaneState,
    setPaneHidden: handleSetPaneHidden,
    applyPreset: handleApplyPresetForHotkeys,
    onSendRx: handleRxSent, // stub — RxPane handles Cmd+Enter internally via form
    onOpenWrapUp: handleFinishVisit,
    onToggleCustomize: () => handleToggleCustomizeMode("hotkey"),
    enabled: !finishBusy,
  });

  // ── One-time legacy seed (ppr-08) ─────────────────────────────────────────
  // On the first v2 load, translate the saved v1 cockpit layout into the v2
  // shape and apply it so the doctor sees their familiar column widths
  // immediately. LEGACY_SEEDED_KEY gates re-runs — once it's set, this
  // effect becomes a no-op for the lifetime of the browser.
  useEffect(() => {
    try {
      if (panesProp) return;
      // csf-04: telemed 8-pane uses a new storage namespace; skip v1 flat seed.
      if (showChart) return;
      if (!shouldRunSeed()) return;
      const seed = readLegacyLayoutOnce({ panes, walkin: !hasPatientId });
      if (seed) {
        shellRef.current?.applyLayout(seed);
      }
      markSeedDone();
    } catch {
      // Seed errors must never crash the page — the doctor just sees the
      // default v2 layout and can customise from there.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty: run once on mount

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

  const pageContent = (
    // `-m-4 md:-m-6` cancels the parent `<DashboardShell>` `p-4 md:p-6`
    // padding so the patient-profile shell bleeds edge-to-edge — matches
    // v1 (`ConsultationCockpit.tsx` ~L2103). Without this, v2 renders
    // visibly inset on every side (parity bug surfaced in ppr-11 QA).
    <div className="-m-4 md:-m-6 flex h-screen flex-col">
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
        onApplyPreset={layoutTreeUx ? undefined : handleApplyPreset}
        onApplyColumnOrder={layoutTreeUx ? undefined : handleApplyColumnOrder}
        visiblePaneIds={layoutTreeUx ? undefined : visiblePaneIds}
        hiddenPaneIds={layoutTreeUx ? undefined : hiddenPaneIds}
        onOpenSavePresetDialog={
          layoutTreeUx ? undefined : handleOpenSavePresetDialog
        }
        presetsState={layoutTreeUx ? undefined : presetsState}
        onOpenManagePresetsDialog={
          layoutTreeUx ? undefined : handleOpenManagePresetsDialog
        }
        layoutTreeUx={layoutTreeUx}
        customizeMode={customizeMode}
        onToggleCustomizeMode={() => handleToggleCustomizeMode("button")}
        centerSlot={
          <PaneToggleBar
            panes={toggleBarPanes}
            columnPanes={panes}
            paneOrder={toggleBarPaneOrder}
            paneState={shellPaneState}
            onToggleHidden={handleToggleHidden}
            onToggleColumn={handleToggleColumn}
            onReorder={handleReorder}
            onBeforeHide={handleBeforeHide}
          />
        }
      />

      {customizeMode && (
        <div className="hidden lg:block">
          <CustomizeBar
            presetCount={layoutTreePresets.presets.length}
            atPresetCap={layoutTreePresets.atCap}
            onSaveCurrentLayout={handleSaveLayoutTreePreset}
            onResetToDefault={handleResetToDefault}
            warningSlot={
              isCramped && !crampedDismissed ? (
                <LayoutCrampedNudge onDismiss={() => setCrampedDismissed(true)} />
              ) : null
            }
          />
        </div>
      )}

      {/* ── Patient context ribbon (crb-03) ──────────────────────────────── */}
      {/* Mounted only for known-patient desktop views. Walk-in (!showChart)
          skips the ribbon per DL-6/7. Mobile <lg viewport hidden via Tailwind.
          The ribbon's Dx live-mirror calls `useRxForm()` and `<RxFormProvider>`
          is always mounted around this subtree (see end of component), so no
          extra provider gate is needed here. */}
      {showChart && (
        <div className="hidden lg:block">
          <PatientRibbon appointment={appt} token={token} />
        </div>
      )}

      {/* ── Resizable pane shell — takes remaining vertical space ─────────── */}
      <div className="min-h-0 flex-1">
        {cockpitV3Enabled() ? (
          <CockpitV3Shell
            panes={v3Panes}
            storageKey={storageKey}
            consultActive={state === "live"}
            safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
            actionDock={
              <PlanActionFooter
                state={state}
                appointmentId={appt.id}
                finishBusy={finishBusy}
              />
            }
          />
        ) : (
          <PatientProfileShell
            ref={shellRef}
            panes={panes}
            storageKey={storageKey}
            legacyStorageKeys={
              layoutLegacyStorageKeys.length > 0
                ? layoutLegacyStorageKeys
                : undefined
            }
            onLayoutChange={handleLayoutChange}
            onLayoutTreeChange={setCurrentLayoutTree}
            paneMoveUx={paneMoveUx}
            customizeMode={customizeMode}
            safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
            actionDock={
              <PlanActionFooter
                state={state}
                appointmentId={appt.id}
                finishBusy={finishBusy}
              />
            }
          />
        )}
      </div>

      {/* ── Preset dialogs (ppr-09) ────────────────────────────────────────── */}
      {!layoutTreeUx && (
      <>
      <SavePresetDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        currentLayout={layoutForDialog as unknown as CockpitLayout}
        onSave={async (name, layout) => {
          await presetsHook.savePreset(
            name,
            layout as unknown as PatientProfileLayout,
          );
        }}
        nextEvictionTarget={
          presetsHook.nextEvictionTarget()
            ? ({
                id: presetsHook.nextEvictionTarget()!.id,
                name: presetsHook.nextEvictionTarget()!.name,
                created_at: presetsHook.nextEvictionTarget()!.createdAt,
                layout: presetsHook.nextEvictionTarget()!.layout as unknown as CockpitLayout,
              } satisfies CockpitLayoutPreset)
            : null
        }
      />
      <ManagePresetsDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        presets={presetsHook.customs.map(
          (p: CustomPreset): CockpitLayoutPreset => ({
            id: p.id,
            name: p.name,
            created_at: p.createdAt,
            layout: p.layout as unknown as CockpitLayout,
          }),
        )}
        onRename={presetsHook.renamePreset}
        onDelete={presetsHook.deletePreset}
      />
      </>
      )}

      {/* ── Live-consult guard dialog (ppr-15e) ──────────────────────────── */}
      <AlertDialog
        open={pendingHide !== null}
        onOpenChange={(open) => { if (!open) setPendingHide(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide the Consultation panel?</AlertDialogTitle>
            <AlertDialogDescription>
              The consultation is currently active. Hiding the panel will not
              end the consult, but you will lose the controls for it until you
              toggle the panel back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingHide(null)}>
              Keep visible
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingHide;
                setPendingHide(null);
                if (id) shellRef.current?.setPaneHidden(id, true);
              }}
            >
              Hide anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // `<RxFormProvider>` is mounted unconditionally — during the brief draft-load
  // window it holds empty fields with autosave disabled, then re-mounts (via
  // the `key` flip from "…-loading" → "…-ready" in useRxFormProviderSetup) once
  // the draft resolves. This is what lets sibling panes that call `useRxForm()`
  // (PatientRibbon Dx mirror, AssessmentStrip, etc.) render safely on every
  // path — there is no longer an early-return that bypasses the provider.
  const { key: rxProviderKey, ...rxProviderProps } = rxFormSetup.providerProps;
  return (
    <RxFormProvider key={rxProviderKey} {...rxProviderProps}>
      <RxSafetyProvider token={token} patientId={appt.patient_id ?? null}>
        <RxFormActionsBridgeProvider>
          <PrescriptionFormShellProvider value={rxFormSetup}>
            {/* Side-sheet host — mounted once here, above BOTH the v3 and
                legacy shells (the shell ternary lives inside `pageContent`),
                so any pane that calls `useSideSheet()` (HistoryPane,
                PlanSection, Rx favorites / previous-Rx) has a provider. This
                is the single documented mount point (see SideSheetHost.tsx);
                the legacy Shell stays byte-identical (P0-DL-1), and only one
                shell mounts at a time, so a page-root host covers both. */}
            <SideSheetHost>{pageContent}</SideSheetHost>
          </PrescriptionFormShellProvider>
        </RxFormActionsBridgeProvider>
      </RxSafetyProvider>
    </RxFormProvider>
  );
}

/** tmr-04: reads `doctor_settings.cockpit_template_override` once per mount. */
function useDoctorCockpitTemplateOverride(
  token: string,
): CockpitTemplateOverride {
  const [override, setOverride] = useState<CockpitTemplateOverride>(null);

  useEffect(() => {
    let cancelled = false;
    getDoctorSettings(token)
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
