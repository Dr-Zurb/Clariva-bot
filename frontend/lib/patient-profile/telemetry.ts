/**
 * PHI-free cockpit v2 telemetry (csf-06, cce-05).
 *
 * V1 sink: `console.debug` with a `[telemetry]` prefix. Swap the body of
 * `logCockpitEvent` when a production analytics SDK ships; call-sites stay put.
 */

export type CockpitTelemetryPayload = Record<string, string | number | boolean>;

export function logCockpitEvent(
  event: string,
  payload: CockpitTelemetryPayload,
): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", event, payload);
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

declare global {
  interface Window {
    __cockpitV2PhaseFlipped?: boolean;
    __cockpitV2RChartLanded?: boolean;
    __cockpitV2RRibbonLanded?: boolean;
    __cockpitV2RModVoiceLanded?: boolean;
    __cockpitV2RModTextLanded?: boolean;
    __cockpitV2RModReviewLanded?: boolean;
    __cockpitV2RMiddleInvLanded?: boolean;
    __cockpitV2RMiddleAssessmentLanded?: boolean;
    __cockpitV2RMiddleSafetyLanded?: boolean;
    __cockpitV2RMiddleFooterLanded?: boolean;
    __cockpitV2RMiddleBodyRefactored?: boolean;
    __cockpitV2REndedConsultBodyLanded?: boolean;
    __cockpitV2RMiddleNarrowMergeLanded?: boolean;
    __cockpitV2RHistoryLanded?: boolean;
    __cockpitPolishPlanPaneDedupLanded?: boolean;
    __cockpitPolishNavClarityLanded?: boolean;
    __cockpitPolishChartDensityLanded?: boolean;
    __cockpitPolishVisualSystemLanded?: boolean;
    __cockpitV2RRxPolishDensificationLanded?: boolean;
    __cockpitV2RRxPolishFavoritesLanded?: boolean;
    __cockpitV2RRxPolishRankingLanded?: boolean;
    __cockpitV2RLayoutUxLanded?: boolean;
    __cockpitV2ProgramCompleted?: boolean;
  }
}

/** One-shot per browser session — first appointment-detail mount post decommission (cvd-02). */
export function trackCockpitV2ProgramCompleted(payload: {
  phase2BatchesShipped: number;
  phase3BatchesShipped: number;
  soakDays: number;
  killSwitchEscapeRatePct: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2ProgramCompleted) return;
  window.__cockpitV2ProgramCompleted = true;
  logCockpitEvent(
    "cockpit_v2.program_completed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per browser session — first appointment-detail mount post Phase 2 flip. */
export function trackCockpitV2Phase2ShellFlipped(appointmentId: string): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2PhaseFlipped) return;
  window.__cockpitV2PhaseFlipped = true;
  logCockpitEvent("cockpit_v2.phase2_shell_flipped", { appointmentId });
}

/** One-shot per browser session — first appointment-detail mount post R-CHART (cce-05). */
export function trackCockpitV2RChartLanded(appointmentId: string): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RChartLanded) return;
  window.__cockpitV2RChartLanded = true;
  logCockpitEvent("cockpit_v2.r_chart_landed", { appointmentId });
}

/** One-shot per browser session — first PatientRibbon mount post R-RIBBON (crb-02). */
export function trackCockpitV2RRibbonLanded(payload: {
  allergiesCount: number;
  chronicCount: number;
  dxValuePresent: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRibbonLanded) return;
  window.__cockpitV2RRibbonLanded = true;
  logCockpitEvent("cockpit_v2.r_ribbon_landed", {
    allergies_count: payload.allergiesCount,
    chronic_count: payload.chronicCount,
    dx_value_present: payload.dxValuePresent,
  });
}

/** One-shot per browser session — first Voice template mount (tmr-05). */
export function trackCockpitV2RModVoiceLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RModVoiceLanded) return;
  window.__cockpitV2RModVoiceLanded = true;
  logCockpitEvent("cockpit_v2.r_mod_voice_landed", {
    appointmentId: payload.appointmentId,
    override_active: payload.overrideActive,
  });
}

/** One-shot per browser session — first Text template mount (tmr-05). */
export function trackCockpitV2RModTextLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RModTextLanded) return;
  window.__cockpitV2RModTextLanded = true;
  logCockpitEvent("cockpit_v2.r_mod_text_landed", {
    appointmentId: payload.appointmentId,
    override_active: payload.overrideActive,
  });
}

/** One-shot per browser session — first Review template mount (tmr-05). */
export function trackCockpitV2RModReviewLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RModReviewLanded) return;
  window.__cockpitV2RModReviewLanded = true;
  logCockpitEvent("cockpit_v2.r_mod_review_landed", {
    appointmentId: payload.appointmentId,
    override_active: payload.overrideActive,
  });
}

/** One-shot per browser session — first InvestigationsPane mount (cmi-03). */
export function trackCockpitV2RMiddleInvLanded(payload: {
  appointmentId: string;
  investigationsLength: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleInvLanded) return;
  window.__cockpitV2RMiddleInvLanded = true;
  logCockpitEvent("cockpit_v2.r_middle_inv_landed", {
    appointmentId: payload.appointmentId,
    investigations_length: payload.investigationsLength,
  });
}

/** One-shot per browser session — first AssessmentStrip mount (cmr-01 / cmr-07). */
export function trackCockpitV2RMiddleAssessmentLanded(payload: {
  appointmentId: string;
  hasDxValue: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleAssessmentLanded) return;
  window.__cockpitV2RMiddleAssessmentLanded = true;
  logCockpitEvent("cockpit_v2.r_middle_assessment_landed", {
    appointmentId: payload.appointmentId,
    has_dx_value: payload.hasDxValue,
  });
}

/** One-shot per browser session — first SafetyStickyStrip visible mount (cmr-02). */
export function trackCockpitV2RMiddleSafetyLanded(payload: {
  appointmentId: string;
  banner_visible: boolean;
  ddi_chip_count: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleSafetyLanded) return;
  window.__cockpitV2RMiddleSafetyLanded = true;
  logCockpitEvent("cockpit_v2.r_middle_safety_landed", {
    appointmentId: payload.appointmentId,
    banner_visible: payload.banner_visible,
    ddi_chip_count: payload.ddi_chip_count,
  });
}

/** One-shot per browser session — first PlanActionFooter mount (cmr-03). */
export function trackCockpitV2RMiddleFooterLanded(payload: {
  appointmentId: string;
  canSend: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleFooterLanded) return;
  window.__cockpitV2RMiddleFooterLanded = true;
  logCockpitEvent("cockpit_v2.r_middle_footer_landed", {
    appointmentId: payload.appointmentId,
    can_send: payload.canSend,
  });
}

/** One-shot per browser session — first BodyZone mount (cmr-04). */
export function trackCockpitV2RMiddleBodyRefactored(payload: {
  appointmentId: string;
  variant: "video" | "voice" | "text";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleBodyRefactored) return;
  window.__cockpitV2RMiddleBodyRefactored = true;
  logCockpitEvent("cockpit_v2.r_middle_body_refactored", {
    appointmentId: payload.appointmentId,
    variant: payload.variant,
  });
}

/**
 * One-shot per browser session — first `<EndedConsultBody>` mount (ecb-01).
 *
 * The body pane in `'review'` template was previously omitted by
 * `makeMiddleColumn` when `bodyVariant === 'review'`. ecb-01 fills that
 * slot with a compact placeholder so the middle column reads as
 * intentional (rather than mysteriously blank) for completed / cancelled
 * appointments. The `mode` payload key narrows the four branches the
 * component renders.
 */
export function trackCockpitV2REndedConsultBodyLanded(payload: {
  appointmentId: string;
  mode: "completed-with-session" | "completed-no-session" | "cancelled" | "no-show";
  modality: "text" | "voice" | "video" | "n/a";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2REndedConsultBodyLanded) return;
  window.__cockpitV2REndedConsultBodyLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_ended_consult_body_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per browser session — first InvestigationsAutoMerge mount (cmr-05). */
export function trackCockpitV2RMiddleNarrowMergeLanded(
  _payload: Record<string, never>,
): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RMiddleNarrowMergeLanded) return;
  window.__cockpitV2RMiddleNarrowMergeLanded = true;
  logCockpitEvent("cockpit_v2.r_middle_narrow_merge_landed", {});
}

/** Per-use — Plan-pane keyboard shortcut fired (rx-polish-shortcuts / rxs-03). */
export function trackCockpitV2RRxPolishShortcutUsed(payload: {
  combo: string;
  action: string;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_shortcut_used",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per open — previous-Rx side sheet mounted (rx-polish-side-sheet / rxss-04). */
export function trackCockpitV2RRxPolishSideSheetOpened(payload: {
  priorRxCount: number;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_side_sheet_opened",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per filter change — chip or search updated (rx-polish-side-sheet / rxss-04). */
export function trackCockpitV2RRxPolishSideSheetFilterChanged(payload: {
  chip: string;
  hasSearch: boolean;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_side_sheet_filter_changed",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per confirm — prior Rx applied to draft (rx-polish-side-sheet / rxss-03). */
export function trackCockpitV2RRxPolishSideSheetApplied(payload: {
  priorRxId: string;
  mode: "append" | "replace";
  medicineCount: number;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_side_sheet_applied",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per browser session — first `<FavoritesChipStrip>` mount (rx-polish-favorites / rxf-07). */
export function trackCockpitV2RRxPolishFavoritesLanded(payload: {
  favoritesCount: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishFavoritesLanded) return;
  window.__cockpitV2RRxPolishFavoritesLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_favorites_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per tap — favorite chip applied to draft (rx-polish-favorites / rxf-06). */
export function trackCockpitV2RRxPolishFavoriteApplied(payload: {
  favoriteId: string;
  fromCount: number;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_favorite_applied",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per browser session — first autocomplete render with personal ranking active (rx-polish-favorites / rxf-07). */
export function trackCockpitV2RRxPolishRankingLanded(payload: {
  topResultPersonalScore: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishRankingLanded) return;
  window.__cockpitV2RRxPolishRankingLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_ranking_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per session — first `<MedicineRow>` mount in summary mode (rxd-04). */
export function trackCockpitV2RRxPolishDensificationLanded(payload: {
  appointmentId: string;
  completedRowsCount: number;
  editorRowsCount: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishDensificationLanded) return;
  window.__cockpitV2RRxPolishDensificationLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_densification_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per open — pane header context menu opened (clpm-03). */
export function trackCockpitV2RLayoutUxContextMenuOpened(payload: {
  paneId: string;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_layout_ux_context_menu_opened",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per split / merge / collapse / hide / restore (clpm-05). */
export function trackCockpitV2RLayoutUxTreeMutation(payload: {
  op: string;
  paneId: string;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_layout_ux_tree_mutation",
    payload as Record<string, string | number | boolean>,
  );
}

/** cpf-05 — pane moved via context-menu "Move pane to…" submenu. */
export function trackCockpitPaneFreedomMoveViaContextMenu(payload: {
  sourcePaneId: string;
  targetType: "tab-into" | "split-horizontal" | "split-vertical";
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.move_via_context_menu",
    payload as Record<string, string | number | boolean>,
  );
}

/** cpfd-03 — pane moved via drag-drop onto a 5-zone overlay. */
export function trackCockpitPaneFreedomDragDrop(payload: {
  sourcePaneId: string;
  targetGroupId: string;
  zone: "center" | "north" | "south" | "east" | "west";
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.drag_drop",
    payload as Record<string, string | number | boolean>,
  );
}

/** cv3d-03 — pane moved via Cockpit v3 drag-drop. */
export function trackCockpitV3DragDrop(payload: {
  sourcePaneId: string;
  targetGroupId: string;
  zone: "center" | "north" | "south" | "east" | "west";
}): void {
  logCockpitEvent(
    "cockpit_v3.drag_drop",
    payload as Record<string, string | number | boolean>,
  );
}

declare global {
  interface Window {
    /** cv3x-02 — first shell mount per session (soak / kill-switch monitoring). */
    __cockpitV3ShellRendered?: boolean;
  }
}

/**
 * cv3x-02 — which cockpit shell rendered (v3 vs legacy). PHI-free.
 * One-shot per browser session; re-fires if the shell variant changes
 * (e.g. kill-switch toggled mid-session).
 */
export function trackCockpitV3ShellRendered(payload: {
  appointmentId: string;
  shell: "v3" | "legacy";
  killSwitchEngaged: boolean;
  buildTimeOff: boolean;
}): void {
  if (typeof window === "undefined") return;
  const tag = `${payload.shell}:${payload.killSwitchEngaged}:${payload.buildTimeOff}`;
  const prev = (window as Window & { __cockpitV3ShellRenderedTag?: string })
    .__cockpitV3ShellRenderedTag;
  if (window.__cockpitV3ShellRendered && prev === tag) return;
  window.__cockpitV3ShellRendered = true;
  (window as Window & { __cockpitV3ShellRenderedTag?: string }).__cockpitV3ShellRenderedTag =
    tag;
  logCockpitEvent("cockpit_v3.shell_rendered", {
    appointmentId: payload.appointmentId,
    shell: payload.shell,
    kill_switch_engaged: payload.killSwitchEngaged,
    build_time_off: payload.buildTimeOff,
  });
}

/** cpfc-01 — customize-layout mode toggled (button or hotkey). */
export function trackCockpitPaneFreedomCustomizeToggled(payload: {
  enabled: boolean;
  source: "button" | "hotkey";
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.customize_toggled",
    payload as Record<string, string | number | boolean>,
  );
}

/** cpfc-03 — custom preset renamed or deleted from PresetPicker. */
export function trackCockpitPaneFreedomPresetCrud(payload: {
  op: "rename" | "delete";
  presetCount: number;
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.preset_crud",
    payload as Record<string, string | number | boolean>,
  );
}

/** cpfc-04 — layout shape sampled when customize mode is turned off. */
export function trackCockpitPaneFreedomLayoutShape(payload: {
  leafCount: number;
  tabContainers: number;
  maxRootSiblings: number;
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.layout_shape",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per custom layout preset save (clpm-05). */
export function trackCockpitV2RLayoutUxPresetSaved(payload: {
  paneCount: number;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_layout_ux_preset_saved",
    payload as Record<string, string | number | boolean>,
  );
}

/** Per preset apply — built-in or custom (clpm-05). */
export function trackCockpitV2RLayoutUxPresetApplied(payload: {
  presetId: string;
  isBuiltIn: boolean;
  paneCount: number;
}): void {
  logCockpitEvent(
    "cockpit_v2.r_layout_ux_preset_applied",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per session — first cockpit mount post nav-clarity batch (cnc-05). */
export function trackCockpitPolishNavClarityLanded(payload: {
  appointmentId: string;
  cockpitMode: true;
  rxSectionNavHidden: true;
  rightColumnTitle: "Chart Notes";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishNavClarityLanded) return;
  window.__cockpitPolishNavClarityLanded = true;
  logCockpitEvent(
    "cockpit_polish.nav_clarity_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per session — first chart-rail mount post chart-density batch (ccd-04). */
export function trackCockpitPolishChartDensityLanded(payload: {
  appointmentId: string;
  emptyPaneCount: number;
  unifiedEmptyState: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishChartDensityLanded) return;
  window.__cockpitPolishChartDensityLanded = true;
  logCockpitEvent(
    "cockpit_polish.chart_density_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per session — first cockpit mount post visual-polish batch (cpv-08). */
export function trackCockpitPolishVisualSystemLanded(payload: {
  appointmentId: string;
  batch: "cpv";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishVisualSystemLanded) return;
  window.__cockpitPolishVisualSystemLanded = true;
  logCockpitEvent(
    "cockpit_polish.visual_system_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per session — first cockpit mount post plan-pane dedup batch (ppd-05). */
export function trackCockpitPolishPlanPaneDedupLanded(payload: {
  appointmentId: string;
  subjectiveLifted: true;
  objectiveLifted: true;
  entryModeLifted: true;
  photoLifted: true;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishPlanPaneDedupLanded) return;
  window.__cockpitPolishPlanPaneDedupLanded = true;
  logCockpitEvent(
    "cockpit_polish.plan_pane_dedup_landed",
    payload as Record<string, string | number | boolean>,
  );
}

/** One-shot per browser session — first ObjectivePane mount (chp-03). */
export function trackCockpitV2RHistoryLanded(payload: {
  appointmentId: string;
  vitalsFilledCount: number;
  hasGeneralExam: boolean;
  hasSystemicExam: boolean;
  hasTestResults: boolean;
  hasBmi: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RHistoryLanded) return;
  window.__cockpitV2RHistoryLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_history_landed",
    payload as Record<string, string | number | boolean>,
  );
}
