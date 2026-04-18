"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ServiceCatalogEditor } from "@/components/practice-setup/ServiceCatalogEditor";
import { MyServiceCatalogTemplatesModal } from "@/components/practice-setup/MyServiceCatalogTemplatesModal";
import { SaveServiceCatalogTemplateModal } from "@/components/practice-setup/SaveServiceCatalogTemplateModal";
import { SaveButton } from "@/components/ui/SaveButton";
import {
  getDoctorSettings,
  patchDoctorSettings,
  postCatalogAiSuggest,
  describeAiSuggestWarning,
  type AiSuggestRequest,
} from "@/lib/api";
import {
  aiSuggestedCardToDraft,
  applyAiSuggestionToDraft,
  catalogToServiceDrafts,
  catchAllServiceDraft,
  draftsSaveBlockingReason,
  draftsToCatalogOrNull,
  normalizeDraftOrder,
  type ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import {
  safeParseServiceCatalogV1,
  type ServiceCatalogV1,
} from "@/lib/service-catalog-schema";
import { createClient } from "@/lib/supabase/client";
import { UnsavedLeaveGuard } from "@/components/ui/UnsavedLeaveGuard";
import type {
  CatalogMode,
  DoctorSettings,
  PatchDoctorSettingsPayload,
  ServiceCatalogTemplatesJsonV1,
} from "@/types/doctor-settings";
import type {
  QualityIssue,
  QualityIssueSuggestion,
} from "@/lib/catalog-quality-issues";
import { sortQualityIssues } from "@/lib/catalog-quality-issues";
import {
  countIssuesBySeverity,
  runLocalCatalogChecks,
} from "@/lib/catalog-quality-local";
import { CatalogReviewPanel } from "@/components/practice-setup/CatalogReviewPanel";
import { CatalogModeSelector } from "@/components/practice-setup/CatalogModeSelector";
import { SingleFeeCatalogEditor } from "@/components/practice-setup/SingleFeeCatalogEditor";
import {
  ModeSwitchConfirmDialog,
  type ModeSwitchAction,
} from "@/components/practice-setup/ModeSwitchConfirmDialog";

function snapshot(services: ServiceOfferingDraft[]): string {
  return JSON.stringify({ services });
}

export default function ServicesCatalogPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [services, setServices] = useState<ServiceOfferingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [myTemplatesModalOpen, setMyTemplatesModalOpen] = useState(false);
  const [userTemplatesBusy, setUserTemplatesBusy] = useState(false);

  // Plan 02 / Task 07 — Catalog quality review state.
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewTriggeredBySave, setReviewTriggeredBySave] = useState(false);
  /** Server-reviewed issues — `null` before the first run. Local deterministic issues are merged on top. */
  const [serverReviewIssues, setServerReviewIssues] = useState<QualityIssue[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [fixInFlightKey, setFixInFlightKey] = useState<string | null>(null);
  /** After the user hits "Save anyway" during the save-gated review flow. */
  const [bypassSaveGate, setBypassSaveGate] = useState(false);

  // Plan 03 / Task 12 — catalog-mode selection + mode-switch flows.
  /** Non-null while a mode-change PATCH (null → mode OR single↔multi) is in flight. */
  const [pendingModeSelection, setPendingModeSelection] = useState<CatalogMode | null>(null);
  /**
   * Which direction of switch confirmation is on screen. `null` means no modal.
   * "to_single" = multi → single; "to_multi" = single → multi.
   */
  const [modeSwitchPrompt, setModeSwitchPrompt] = useState<
    "to_single" | "to_multi" | null
  >(null);

  const fetchSettings = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getDoctorSettings(token);
      const s = res.data.settings;
      setSettings(s);
      const cat = s.service_offerings_json ?? null;
      const serverDrafts = catalogToServiceDrafts(cat);
      let displayDrafts = serverDrafts;
      if (!cat && serverDrafts.length === 0) {
        displayDrafts = [catchAllServiceDraft()];
      }
      setServices(displayDrafts);
      setLastSaved(snapshot(displayDrafts));
      setSaveSuccess(false);
      setClientError(null);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isDirty = useMemo(
    () => lastSaved !== "" && snapshot(services) !== lastSaved,
    [services, lastSaved]
  );

  const saveDisableReason = useMemo(
    () => (isDirty ? draftsSaveBlockingReason(services) : null),
    [isDirty, services]
  );

  const hasStructuredCatalog = Boolean(settings?.service_offerings_json);

  const userSavedTemplates = settings?.service_catalog_templates_json?.templates ?? [];

  // Plan 03 / Task 12: effective catalog mode. `undefined` on legacy API
  // responses (pre-migration 048) is treated as `'multi_service'` so the
  // existing Plan 01/02 experience keeps working without a schema touch.
  const catalogMode: CatalogMode | null = useMemo(() => {
    if (!settings) return null;
    if (settings.catalog_mode === null || settings.catalog_mode === undefined) {
      // Undecided OR legacy row. After migration 048, undecided stays `null`
      // (selector renders); legacy rows get `single_fee`. The fallback below
      // keeps pre-migration environments on the multi-service branch so we
      // never lose the old UI.
      return settings.catalog_mode === null
        ? null
        : "multi_service";
    }
    return settings.catalog_mode;
  }, [settings]);

  /**
   * Plan 03 / Task 12: inspect `service_offerings_json` for the single-fee
   * backup sibling stashed by backend Task 09 when the doctor flipped from
   * multi → single. Present = restore-from-backup is possible. The backend
   * does not yet expose a dedicated restore endpoint; the frontend can PATCH
   * `service_offerings_json` directly with the backup catalog.
   *
   * NOTE: we read this from `settings.service_offerings_json` at runtime with
   * a widened cast because `ServiceCatalogV1` does not model the unknown
   * `_backup_pre_single_fee` sibling (it's stored on the parent JSONB object,
   * not inside the schema). Parity with the backend constant is asserted by
   * the name match — if backend renames the key, this lookup will start
   * returning `null` and we fall back to "start fresh" cleanly.
   */
  const singleFeeBackupCatalog = useMemo(() => {
    const json = settings?.service_offerings_json as
      | (Record<string, unknown> & { _backup_pre_single_fee?: unknown })
      | null
      | undefined;
    const backup = json?._backup_pre_single_fee;
    if (!backup || typeof backup !== "object") return null;
    const parsed = safeParseServiceCatalogV1(backup);
    return parsed.ok ? parsed.data : null;
  }, [settings]);

  // Plan 02 / Task 07: local deterministic checks update as the doctor types.
  const localIssues = useMemo(() => runLocalCatalogChecks(services), [services]);

  // Merge local + latest server issues, with deduplication by (type, services[]).
  const mergedIssues = useMemo<QualityIssue[]>(() => {
    const key = (i: QualityIssue) => `${i.type}::${[...i.services].sort().join(",")}`;
    const seen = new Set<string>();
    const out: QualityIssue[] = [];
    for (const i of localIssues) {
      const k = key(i);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(i);
      }
    }
    for (const i of serverReviewIssues ?? []) {
      const k = key(i);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(i);
      }
    }
    return sortQualityIssues(out);
  }, [localIssues, serverReviewIssues]);

  const localSeverityCounts = useMemo(
    () => countIssuesBySeverity(localIssues),
    [localIssues]
  );

  const labelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of services) {
      const k = s.service_key.trim().toLowerCase();
      if (k) m[k] = s.label.trim() || s.service_key;
    }
    return m;
  }, [services]);

  const handleTemplatesLibraryChange = async (next: ServiceCatalogTemplatesJsonV1) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not signed in");
    setUserTemplatesBusy(true);
    setClientError(null);
    try {
      const res = await patchDoctorSettings(token, { service_catalog_templates_json: next });
      setSettings(res.data.settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update saved templates.";
      setClientError(msg);
      throw err;
    } finally {
      setUserTemplatesBusy(false);
    }
  };

  /**
   * Plan 02 / Task 06: thin wrapper around `POST /api/v1/catalog/ai-suggest` that
   * the editor + drawer call when doctors hit the starter panel, the new-card
   * banner, or the sparkle button. Auth is handled here so child components can
   * stay supabase-free and stub the callback in tests.
   */
  const handleAiSuggest = useCallback(async (req: AiSuggestRequest) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      const err = new Error("Not signed in") as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    return postCatalogAiSuggest(token, req);
  }, []);

  /**
   * Plan 02 / Task 07: runs the full catalog review through the AI endpoint.
   * Merges server-reviewed issues into {@link serverReviewIssues}; the memoized
   * {@link mergedIssues} combines them with local deterministic ones.
   *
   * Bug-fix (post Plan 04): we always send the current on-screen draft in the
   * `catalog` field. Previously the backend reloaded `service_offerings_json`
   * from the DB every call, so a doctor could `add_card` from the review
   * panel, click "Review again", and get the same gap suggestion back —
   * because the suggested card lived only in local React state until they
   * hit Save. Sending the draft makes the review a critique of "what's on
   * the doctor's screen right now" instead of "what's in the DB".
   *
   * Validation symmetry: we run the same `draftsToCatalogOrNull` +
   * `safeParseServiceCatalogV1` pipeline as `performSave`. If the draft
   * fails validation mid-edit (e.g. the doctor cleared the catch-all row,
   * or a card has an empty label), we refuse the round-trip and surface the
   * error in the review panel rather than silently stripping invalid rows
   * and shipping a misleading critique. The deterministic `localIssues`
   * panel still renders, so the doctor isn't left without feedback.
   */
  const runServerReview = useCallback(async (): Promise<QualityIssue[] | null> => {
    setReviewError(null);

    // Build the override payload from the current draft. The three explicit
    // states map 1:1 to the backend contract on `AiSuggestRequest.catalog`:
    //   - empty editor → send `null` so the backend treats the doctor as
    //                    having no catalog (deterministic `missing_catchall`
    //                    fires from server-side review).
    //   - valid draft  → send the parsed `ServiceCatalogV1`.
    //   - invalid draft → bail with a doctor-facing error (no network call).
    let catalogOverride: ServiceCatalogV1 | null;
    try {
      const built = draftsToCatalogOrNull(services);
      if (built === null) {
        catalogOverride = null;
      } else {
        const parsed = safeParseServiceCatalogV1(built);
        if (!parsed.ok) {
          setReviewError(parsed.message);
          setServerReviewIssues([]);
          return null;
        }
        catalogOverride = parsed.data;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read your current draft.";
      setReviewError(msg);
      setServerReviewIssues([]);
      return null;
    }

    setReviewLoading(true);
    try {
      const res = await handleAiSuggest({ mode: "review", catalog: catalogOverride });
      if (res.data.mode !== "review") {
        throw new Error("Unexpected AI response for review mode");
      }
      // The server only emits LLM-class issues; local deterministic ones are
      // already in `localIssues`, so keep them separate here and let the
      // `mergedIssues` memo handle dedup.
      setServerReviewIssues(res.data.issues);
      return res.data.issues;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Review failed";
      setReviewError(msg);
      setServerReviewIssues([]);
      return null;
    } finally {
      setReviewLoading(false);
    }
  }, [handleAiSuggest, services]);

  const performSave = useCallback(async (options?: { bypassGate?: boolean }): Promise<boolean> => {
    setClientError(null);
    const bypass = options?.bypassGate === true || bypassSaveGate;

    // Plan 02 / Task 07: block on deterministic error-severity issues unless
    // the doctor has explicitly clicked "Save anyway" in the review panel.
    // Per the task doc, strict-with-empty-hints and missing-catchall are hard
    // save blockers because they produce a catalog that cannot match anything.
    if (!bypass) {
      const errors = localIssues.filter((i) => i.severity === "error");
      if (errors.length > 0) {
        setServerReviewIssues(null);
        setReviewError(null);
        setReviewTriggeredBySave(true);
        setReviewPanelOpen(true);
        setClientError(
          `Can't save yet: ${errors.length} issue${errors.length === 1 ? "" : "s"} would break matching. Review the panel and either fix them or click "Save anyway".`
        );
        return false;
      }
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setClientError("Not signed in");
      return false;
    }

    let catalog: ReturnType<typeof draftsToCatalogOrNull>;
    try {
      catalog = draftsToCatalogOrNull(services);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Check your service rows and follow-up fields.");
      return false;
    }
    if (catalog === null) {
      setClientError(
        'Add at least one service to save, or use "Clear structured catalog" to remove the catalog (priced teleconsults require services on file).'
      );
      return false;
    }

    const parsed = safeParseServiceCatalogV1(catalog);
    if (!parsed.ok) {
      setClientError(parsed.message);
      return false;
    }

    const payload: PatchDoctorSettingsPayload = {
      service_offerings_json: parsed.data,
    };

    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
      const s = res.data.settings;
      const catNext = s.service_offerings_json ?? null;
      const serverDrafts = catalogToServiceDrafts(catNext);
      let displayDrafts = serverDrafts;
      if (!catNext && serverDrafts.length === 0) {
        displayDrafts = [catchAllServiceDraft()];
      }
      setServices(displayDrafts);
      setLastSaved(snapshot(displayDrafts));
      setSaveSuccess(true);
      // Plan 02 / Task 07: reset the save gate so the next save runs fresh.
      setBypassSaveGate(false);
      setReviewTriggeredBySave(false);
      // Plan 02 / Task 07: background server review after save. If the LLM
      // surfaces error-severity issues the catalog wouldn't catch with local
      // checks alone (overlaps, contradictions, modality mismatches), auto-
      // reopen the panel so the doctor knows before the bot runs into them on
      // a real conversation. Failures are non-blocking — the save already won.
      //
      // Plan 03 / Task 12: gated on multi-service mode. Single-fee catalogs
      // are auto-generated from `appointment_fee_minor` + `consultation_types`
      // and don't have the ambiguity the review LLM exists to catch, so we
      // skip the network call entirely in that mode.
      if (res.data.settings.catalog_mode !== "single_fee") {
        void runServerReview().then((issues) => {
          if (!issues) return;
          const severe = issues.some((i) => i.severity === "error" || i.severity === "warning");
          if (severe) {
            setReviewTriggeredBySave(false);
            setReviewPanelOpen(true);
          }
        });
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setClientError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [services, localIssues, bypassSaveGate, runServerReview]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSave();
  };

  const handleOpenReview = useCallback(() => {
    setReviewTriggeredBySave(false);
    setReviewPanelOpen(true);
    // Run once on open if we don't already have server results — doctors
    // expect the panel to show findings immediately, not after another click.
    if (serverReviewIssues === null) {
      void runServerReview();
    }
  }, [runServerReview, serverReviewIssues]);

  const handleSaveAnyway = useCallback(async () => {
    // One-shot flag. `performSave` consumes the option argument and `useCallback`
    // in the next save re-reads the (now-reset) `bypassSaveGate` state.
    setBypassSaveGate(true);
    setReviewPanelOpen(false);
    await performSave({ bypassGate: true });
  }, [performSave]);

  /**
   * Plan 02 / Task 07: apply one-tap fixes from the review panel.
   *
   * Most actions are pure local draft mutations so doctors feel instant
   * feedback. AI-backed actions (`fill_with_ai`, `switch_to_strict_and_fill`)
   * call the single-card suggest endpoint and merge the result back into the
   * targeted draft. `add_card` seeds a new row from `issue.suggestedCard`.
   *
   * After any mutation we invalidate server review state — the next open will
   * refresh it.
   */
  const handleApplyFix = useCallback<
    (issue: QualityIssue, suggestion: QualityIssueSuggestion) => Promise<void>
  >(
    async (issue, suggestion) => {
      const fixKey = `${issue.type}::${issue.services.join(",")}::${suggestion.action}`;
      setFixInFlightKey(fixKey);
      try {
        const findDraft = (key: string) =>
          services.find((s) => s.service_key.trim().toLowerCase() === key);

        let nextServices = services;
        const primaryKey = issue.services[0] ?? null;

        switch (suggestion.action) {
          case "switch_to_strict": {
            if (!primaryKey) return;
            nextServices = services.map((s) =>
              s.service_key.trim().toLowerCase() === primaryKey ? { ...s, scopeMode: "strict" as const } : s
            );
            break;
          }
          case "switch_to_flexible": {
            if (!primaryKey) return;
            nextServices = services.map((s) =>
              s.service_key.trim().toLowerCase() === primaryKey ? { ...s, scopeMode: "flexible" as const } : s
            );
            break;
          }
          case "add_card": {
            if (!issue.suggestedCard) return;
            const newDraft = aiSuggestedCardToDraft({
              service_key: issue.suggestedCard.service_key,
              label: issue.suggestedCard.label,
              description: issue.suggestedCard.description,
              scope_mode: issue.suggestedCard.scope_mode,
              matcher_hints: issue.suggestedCard.matcher_hints,
              modalities: issue.suggestedCard.modalities ?? { text: { enabled: false, price_minor: 0 } },
            });
            nextServices = normalizeDraftOrder([...services, newDraft]);
            break;
          }
          case "fill_with_ai":
          case "switch_to_strict_and_fill": {
            if (!primaryKey) return;
            const targetDraft = findDraft(primaryKey);
            if (!targetDraft) return;
            const res = await handleAiSuggest({
              mode: "single_card",
              payload: {
                label: targetDraft.label.trim() || targetDraft.service_key,
                freeformDescription: targetDraft.description.trim() || undefined,
                existingHints: {
                  keywords: targetDraft.matcherKeywords.trim() || undefined,
                  include_when: targetDraft.matcherIncludeWhen.trim() || undefined,
                  exclude_when: targetDraft.matcherExcludeWhen.trim() || undefined,
                },
              },
            });
            if (res.data.mode !== "single_card" || res.data.cards.length === 0) return;
            const card = res.data.cards[0];
            const warnings = res.data.warnings ?? [];
            const docFacing = warnings.map((w) => ({
              kind: w.kind,
              message: describeAiSuggestWarning(w),
            }));
            nextServices = services.map((s) =>
              s.service_key.trim().toLowerCase() === primaryKey
                ? applyAiSuggestionToDraft(
                    suggestion.action === "switch_to_strict_and_fill"
                      ? { ...s, scopeMode: "strict" as const }
                      : s,
                    card,
                    "review_apply",
                    docFacing
                  )
                : s
            );
            break;
          }
          case "apply_exclude_when_suggestion": {
            if (!primaryKey || !issue.suggestion) return;
            nextServices = services.map((s) => {
              if (s.service_key.trim().toLowerCase() !== primaryKey) return s;
              const existing = s.matcherExcludeWhen?.trim() ?? "";
              const merged = existing ? `${existing}\n${issue.suggestion}` : issue.suggestion!;
              return { ...s, matcherExcludeWhen: merged };
            });
            break;
          }
          case "enable_modality":
          case "reprice": {
            // These actions need server-side context we don't model on the client yet
            // (which modality to toggle, what price to apply). Log and no-op to keep
            // the panel responsive — the doctor can still edit the card manually.
            console.warn(`[catalog-review] ${suggestion.action} not yet implemented`);
            return;
          }
          default: {
            // Exhaustiveness guard — new actions MUST be wired here.
            const _exhaustive: never = suggestion.action;
            void _exhaustive;
            return;
          }
        }

        if (nextServices !== services) {
          setServices(nextServices);
          setSaveSuccess(false);
          setClientError(null);
          // Applying a fix changes the catalog — the old server review is stale.
          setServerReviewIssues(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not apply fix";
        setReviewError(msg);
      } finally {
        setFixInFlightKey(null);
      }
    },
    [handleAiSuggest, services]
  );

  /**
   * Plan 03 / Task 12: PATCH `catalog_mode` and refresh local state from the
   * server response so the render tree re-branches with a fresh
   * `service_offerings_json`. Backend Task 09 handles the backup-on-flip,
   * single-fee catalog materialization, and the empty-catalog-on-mode-reset
   * semantics. The frontend is a thin wrapper.
   *
   * When `nextJson` is provided, it is sent alongside the mode change
   * (used by the restore-from-backup flow: {@link singleFeeBackupCatalog}
   * is promoted back into `service_offerings_json` as the doctor flips
   * `single_fee → multi_service`).
   */
  const patchCatalogMode = useCallback(
    async (
      nextMode: CatalogMode,
      extra?: Pick<PatchDoctorSettingsPayload, "service_offerings_json">
    ): Promise<boolean> => {
      setClientError(null);
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setClientError("Not signed in");
        return false;
      }
      setPendingModeSelection(nextMode);
      try {
        const payload: PatchDoctorSettingsPayload = {
          catalog_mode: nextMode,
          ...(extra ?? {}),
        };
        const res = await patchDoctorSettings(token, payload);
        const s = res.data.settings;
        setSettings(s);
        const catNext = s.service_offerings_json ?? null;
        const serverDrafts = catalogToServiceDrafts(catNext);
        let displayDrafts = serverDrafts;
        if (!catNext && serverDrafts.length === 0) {
          displayDrafts = [catchAllServiceDraft()];
        }
        setServices(displayDrafts);
        setLastSaved(snapshot(displayDrafts));
        // Clear any multi-service review state — it's stale after a mode flip.
        setServerReviewIssues(null);
        setReviewPanelOpen(false);
        setReviewError(null);
        setReviewTriggeredBySave(false);
        setFixInFlightKey(null);
        setBypassSaveGate(false);
        setSaveSuccess(true);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not change mode";
        setClientError(msg);
        return false;
      } finally {
        setPendingModeSelection(null);
      }
    },
    []
  );

  /** Mode selector click (null → chosen mode). No confirmation — nothing to overwrite. */
  const handleSelectMode = useCallback(
    async (mode: CatalogMode) => {
      await patchCatalogMode(mode);
    },
    [patchCatalogMode]
  );

  /**
   * Plan 03 / Task 12: single-fee editor save. PATCHes the seeds
   * (`appointment_fee_minor`, `appointment_fee_currency`,
   * `consultation_types`); backend Task 09 regenerates
   * `service_offerings_json`. We refresh settings from the response so the
   * preview reflects server truth.
   */
  const handleSingleFeeSave = useCallback(
    async (patch: PatchDoctorSettingsPayload): Promise<boolean> => {
      setClientError(null);
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setClientError("Not signed in");
        return false;
      }
      setSaving(true);
      setSaveSuccess(false);
      try {
        const res = await patchDoctorSettings(token, patch);
        const s = res.data.settings;
        setSettings(s);
        const catNext = s.service_offerings_json ?? null;
        const serverDrafts = catalogToServiceDrafts(catNext);
        let displayDrafts = serverDrafts;
        if (!catNext && serverDrafts.length === 0) {
          displayDrafts = [catchAllServiceDraft()];
        }
        setServices(displayDrafts);
        setLastSaved(snapshot(displayDrafts));
        setSaveSuccess(true);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setClientError(msg);
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  /** Multi → Single: open confirmation; on confirm PATCH `catalog_mode: 'single_fee'`. */
  const handleRequestSwitchToSingleFee = useCallback(() => {
    setModeSwitchPrompt("to_single");
  }, []);

  /** Single → Multi: open confirmation (offers restore or start-fresh if a backup exists). */
  const handleRequestSwitchToMultiService = useCallback(() => {
    setModeSwitchPrompt("to_multi");
  }, []);

  const handleConfirmSwitchToSingleFee = useCallback(async () => {
    const ok = await patchCatalogMode("single_fee");
    if (ok) setModeSwitchPrompt(null);
  }, [patchCatalogMode]);

  const handleConfirmStartFreshMultiService = useCallback(async () => {
    // Backend Task 09: flipping mode to multi_service alone does NOT clear the
    // auto-generated single-fee catalog. We nuke it explicitly so the doctor
    // lands in the empty-state starter flow (which then gates on user click).
    const ok = await patchCatalogMode("multi_service", {
      service_offerings_json: null,
    });
    if (ok) setModeSwitchPrompt(null);
  }, [patchCatalogMode]);

  const handleConfirmRestoreMultiService = useCallback(async () => {
    if (!singleFeeBackupCatalog) return;
    const ok = await patchCatalogMode("multi_service", {
      service_offerings_json: singleFeeBackupCatalog,
    });
    if (ok) setModeSwitchPrompt(null);
  }, [patchCatalogMode, singleFeeBackupCatalog]);

  const handleClearCatalog = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Remove structured service catalog? Priced teleconsult booking and quotes need at least one service row — add a catalog again before taking paid remote bookings."
      )
    ) {
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    setClearing(true);
    setClientError(null);
    try {
      const res = await patchDoctorSettings(token, { service_offerings_json: null });
      setSettings(res.data.settings);
      setServices([catchAllServiceDraft()]);
      setLastSaved(snapshot([catchAllServiceDraft()]));
      setSaveSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not clear catalog";
      setClientError(msg);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  // Plan 03 / Task 12: the unsaved-changes guard only has meaningful work to
  // do in multi-service mode (where `isDirty` tracks local draft edits).
  // In single-fee mode the editor owns its own dirty state and save flow; in
  // mode-selector mode there is nothing dirty to guard. Forcing the guard
  // inert in those branches avoids phantom "leave without saving?" prompts.
  const guardIsDirty = catalogMode === "multi_service" ? isDirty : false;

  const modeSwitchDialog = (
    <>
      <ModeSwitchConfirmDialog
        open={modeSwitchPrompt === "to_single"}
        title="Switch to one flat fee?"
        body={[
          "Your current services will be saved as a backup and replaced with a single \u201CConsultation\u201D entry priced at your flat fee.",
          "You can switch back to multi-service mode later and we\u2019ll offer to restore the backup.",
        ]}
        onCancel={() => setModeSwitchPrompt(null)}
        busy={pendingModeSelection !== null}
        actions={[
          {
            id: "confirm-to-single",
            label:
              pendingModeSelection === "single_fee"
                ? "Switching\u2026"
                : "Switch to one flat fee",
            onClick: handleConfirmSwitchToSingleFee,
            variant: "primary",
            testId: "confirm-switch-to-single-fee",
          } satisfies ModeSwitchAction,
        ]}
      />
      <ModeSwitchConfirmDialog
        open={modeSwitchPrompt === "to_multi"}
        title="Switch to multi-service mode?"
        body={
          singleFeeBackupCatalog
            ? [
                "We saved your previous multi-service catalog before you switched to a flat fee. You can restore it now, or start fresh with an empty catalog.",
                "Starting fresh will discard the backup.",
              ]
            : [
                "Switching to multi-service mode opens the full editor so you can define different fees per service. Your current flat fee stays as a fallback.",
              ]
        }
        onCancel={() => setModeSwitchPrompt(null)}
        busy={pendingModeSelection !== null}
        actions={
          singleFeeBackupCatalog
            ? ([
                {
                  id: "confirm-restore",
                  label: "Restore previous catalog",
                  onClick: handleConfirmRestoreMultiService,
                  variant: "primary",
                  testId: "confirm-switch-to-multi-restore",
                },
                {
                  id: "confirm-start-fresh",
                  label: "Start fresh",
                  onClick: handleConfirmStartFreshMultiService,
                  variant: "secondary",
                  testId: "confirm-switch-to-multi-start-fresh",
                },
              ] satisfies ModeSwitchAction[])
            : ([
                {
                  id: "confirm-start-fresh",
                  label: "Switch to multi-service",
                  onClick: handleConfirmStartFreshMultiService,
                  variant: "primary",
                  testId: "confirm-switch-to-multi-start-fresh",
                },
              ] satisfies ModeSwitchAction[])
        }
      />
    </>
  );

  return (
    <div>
      <UnsavedLeaveGuard
        isDirty={guardIsDirty}
        isSaving={saving}
        saveBlockedReason={saveDisableReason}
        onSave={performSave}
      />
      <h1 className="text-2xl font-semibold text-gray-900">Services catalog</h1>
      <p className="mt-1 text-gray-600">
        Set up your consultation types and teleconsult prices (text, voice, video). Follow-up discounts can differ by
        channel. These prices feed into quotes and checkout when patients book remote visits.
      </p>

      {/*
       * Plan 03 / Task 12 — catalog mode branch.
       *
       * `null`           → first-run selector, nothing else on screen.
       * `'single_fee'`   → compact editor; all Plan 02 surfaces (review panel,
       *                     templates, starter prompts, AI sparkle, scope-mode
       *                     nudges) are intentionally absent.
       * `'multi_service'`→ verbatim Plan 01/02 editor (unchanged behavior).
       */}
      {catalogMode === null && (
        <div className="mt-6">
          <CatalogModeSelector
            onSelect={handleSelectMode}
            isSaving={pendingModeSelection !== null}
            pendingMode={pendingModeSelection}
          />
          {clientError && (
            <div
              className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              role="alert"
            >
              {clientError}
            </div>
          )}
          {modeSwitchDialog}
        </div>
      )}

      {catalogMode === "single_fee" && settings && (
        <div className="mt-6 space-y-4">
          <SingleFeeCatalogEditor
            doctorSettings={settings}
            onSave={handleSingleFeeSave}
            isSaving={saving}
            saveSuccess={saveSuccess}
            onRequestSwitchToMultiService={handleRequestSwitchToMultiService}
            practiceName={settings.practice_name ?? null}
          />
          {clientError && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              role="alert"
            >
              {clientError}
            </div>
          )}
          {modeSwitchDialog}
        </div>
      )}

      {catalogMode === "multi_service" && (
        <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleRequestSwitchToSingleFee}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="switch-to-single-fee"
          >
            Switch to one flat fee
          </button>
          <button
            type="button"
            onClick={() => setSaveTemplateModalOpen(true)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save template
          </button>
          <button
            type="button"
            onClick={() => setMyTemplatesModalOpen(true)}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            My templates
          </button>
        </div>

        <SaveServiceCatalogTemplateModal
          open={saveTemplateModalOpen}
          onClose={() => setSaveTemplateModalOpen(false)}
          currentServices={services}
          templates={userSavedTemplates}
          onTemplatesChange={handleTemplatesLibraryChange}
          busy={userTemplatesBusy}
        />

        <MyServiceCatalogTemplatesModal
          open={myTemplatesModalOpen}
          onClose={() => setMyTemplatesModalOpen(false)}
          currentServicesCount={services.length}
          onApplyCatalog={(next) => {
            setServices(next);
            setSaveSuccess(false);
            setClientError(null);
          }}
          templates={userSavedTemplates}
          onTemplatesChange={handleTemplatesLibraryChange}
          busy={userTemplatesBusy}
        />

        <ServiceCatalogEditor
          services={services}
          onServicesChange={(next) => {
            setSaveSuccess(false);
            setClientError(null);
            setServices(next);
            // Plan 02 / Task 07: structural edits invalidate the last server
            // review. Local deterministic issues recompute automatically via
            // the memo, so nothing else to do here.
            setServerReviewIssues(null);
          }}
          onAiSuggest={handleAiSuggest}
          qualityIssues={mergedIssues}
          onOpenReview={handleOpenReview}
        />

        <CatalogReviewPanel
          open={reviewPanelOpen}
          onClose={() => setReviewPanelOpen(false)}
          // `null` means "server review hasn't run yet and no local issues" —
          // renders the CTA. Once either surface has content, pass the merged
          // list so we show both deterministic + LLM findings together.
          issues={
            serverReviewIssues === null && localIssues.length === 0
              ? null
              : mergedIssues
          }
          loading={reviewLoading}
          error={reviewError}
          onRunReview={() => void runServerReview()}
          onApplyFix={handleApplyFix}
          labelByKey={labelByKey}
          triggeredBySave={reviewTriggeredBySave}
          onSaveAnyway={handleSaveAnyway}
          fixInFlightKey={fixInFlightKey}
        />

        {(clientError || error) && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
            {clientError || error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <SaveButton
            isDirty={isDirty}
            saving={saving}
            saveSuccess={saveSuccess}
            disableReason={saveDisableReason}
          />
          {(hasStructuredCatalog || services.length > 0) && (
            <button
              type="button"
              onClick={handleClearCatalog}
              disabled={clearing}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear structured catalog"}
            </button>
          )}
        </div>
        {modeSwitchDialog}
        </form>
      )}
    </div>
  );
}
