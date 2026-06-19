"use client";

/**
 * AllergiesSection — patient_allergies with capture bar + collapsible cards (Subjective tab).
 */

import { useCallback, useEffect, useId, useMemo, useState, type RefObject } from "react";
import { AllergyCard, type AllergyCardPatch } from "@/components/ehr/chart/AllergyCard";
import { ChartCatalogCombobox } from "@/components/ehr/chart/ChartCatalogCombobox";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import {
  archivePatientAllergy,
  createPatientAllergy,
  listPatientAllergies,
  updatePatientAllergy,
} from "@/lib/api";
import {
  COMMON_ALLERGEN_CATALOG,
  COMMON_ALLERGEN_QUICK_ADD,
  commonAllergenLabel,
  filterCommonAllergenCatalog,
  resolveCommonAllergen,
} from "@/lib/cockpit/common-allergens";
import { useStableMedKey } from "@/lib/chart/use-stable-med-key";
import { formatApplySummary, type ApplyRowResult } from "@/lib/chart/use-pmh-template-apply";
import {
  allergiesHaveContent,
  snapshotAllergies,
  useAllergyTemplateApply,
} from "@/lib/chart/use-allergy-template-apply";
import {
  type SectionTemplateControlsBinding,
} from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { ALLERGIES_CAPTURE_SECTION_ID } from "@/lib/chart/chart-allergy-scroll";
import type {
  PatientAllergy,
  PatientAllergySeverity,
  PatientChartLayout,
  PatientChartMode,
} from "@/types/patient-chart";

interface AllergiesSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  onCountChange?: (count: number) => void;
  /** Header-mounted template controls read live bindings from this ref. */
  templateControlsRef?: RefObject<SectionTemplateControlsBinding | null>;
  onTemplateControlsReadyChange?: (ready: boolean) => void;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isDuplicateAllergen(rows: PatientAllergy[], allergen: string): boolean {
  const key = normalizeKey(allergen);
  return rows.some((row) => normalizeKey(row.allergen) === key);
}

export default function AllergiesSection({
  patientId,
  token,
  layout: _layout,
  mode,
  addOpen = false,
  onAddOpenChange,
  onCountChange,
  templateControlsRef,
  onTemplateControlsReadyChange,
}: AllergiesSectionProps) {
  const inputId = useId();
  const { stableKey, linkRealId } = useStableMedKey();
  const [rows, setRows] = useState<PatientAllergy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [focusCombobox, setFocusCombobox] = useState(false);

  const readonly = mode === "readonly";

  const reloadAllergies = useCallback(async () => {
    try {
      const res = await listPatientAllergies(token, patientId);
      const data = res.data.allergies ?? [];
      setRows(data);
      onCountChange?.(data.length);
    } catch {
      // Keep the current optimistic state if the resync fails.
    }
  }, [onCountChange, patientId, token]);

  useEffect(() => {
    if (addOpen) setFocusCombobox(true);
  }, [addOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientAllergies(token, patientId);
        if (cancelled) return;
        const data = res.data.allergies ?? [];
        setRows(data);
        onCountChange?.(data.length);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load allergies");
        setRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, onCountChange]);

  const catalogOptions = useMemo(() => {
    const selected = new Set((rows ?? []).map((row) => normalizeKey(row.allergen)));
    return COMMON_ALLERGEN_CATALOG.filter((def) => !selected.has(normalizeKey(def.label))).map(
      (def) => ({ value: def.value, label: def.label }),
    );
  }, [rows]);

  const quickAddLabels = useMemo(() => {
    const selected = new Set((rows ?? []).map((row) => normalizeKey(row.allergen)));
    return COMMON_ALLERGEN_QUICK_ADD.map((value) => commonAllergenLabel(value)).filter(
      (label) => !selected.has(normalizeKey(label)),
    );
  }, [rows]);

  const commitAllergen = useCallback(
    async (
      allergen: string,
      severity: PatientAllergySeverity = "unknown",
      opts?: { reaction?: string | null },
    ): Promise<ApplyRowResult> => {
      const trimmed = allergen.trim();
      if (!trimmed || readonly) return "duplicate";
      if (rows && isDuplicateAllergen(rows, trimmed)) return "duplicate";

      setActionError(null);

      const reaction = opts?.reaction ?? null;
      const tempId = `temp-${Date.now()}`;
      const optimistic: PatientAllergy = {
        id: tempId,
        doctor_id: "",
        patient_id: patientId,
        allergen: trimmed,
        severity,
        reaction,
        note: null,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setRows((prev) => {
        const next = [optimistic, ...(prev ?? [])];
        onCountChange?.(next.length);
        return next;
      });

      try {
        const res = await createPatientAllergy(token, patientId, {
          allergen: trimmed,
          severity,
          ...(reaction ? { reaction } : {}),
        });
        const created = res.data.allergy;
        linkRealId(tempId, created.id);

        // Preserve any edits the user made on the temp row during the create
        // round-trip (e.g. tapping a severity chip) and persist them after.
        let pendingEdits: AllergyCardPatch | null = null;
        setRows((prev) => {
          if (!prev) return [created];
          return prev.map((r) => {
            if (r.id !== tempId) return r;
            const merged: PatientAllergy = { ...created };
            const edits: AllergyCardPatch = {};
            if (r.severity !== created.severity) {
              merged.severity = r.severity;
              edits.severity = r.severity;
            }
            if (r.reaction !== created.reaction) {
              merged.reaction = r.reaction;
              edits.reaction = r.reaction;
            }
            if (r.note !== created.note) {
              merged.note = r.note;
              edits.note = r.note;
            }
            if (Object.keys(edits).length > 0) pendingEdits = edits;
            return merged;
          });
        });
        onAddOpenChange?.(false);
        setActionError(null);

        if (pendingEdits) {
          try {
            await updatePatientAllergy(token, patientId, created.id, pendingEdits);
          } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to update allergy");
          }
        }
        return "created";
      } catch (err) {
        setRows((prev) => {
          if (!prev) return prev;
          const next = prev.filter((r) => r.id !== tempId);
          onCountChange?.(next.length);
          return next;
        });
        setActionError(err instanceof Error ? err.message : "Failed to add allergy");
        return "error";
      }
    },
    [linkRealId, onAddOpenChange, onCountChange, patientId, readonly, rows, token],
  );

  const applyTemplate = useAllergyTemplateApply({
    getExisting: () => (rows ?? []).map((r) => ({ allergen: r.allergen })),
    createAllergy: (entry) =>
      commitAllergen(entry.allergen, entry.severity ?? "unknown", {
        reaction: entry.reaction ?? null,
      }),
    reload: reloadAllergies,
    onSummary: (summary) => setTemplateNotice(formatApplySummary(summary, "allergies")),
  });

  const buildTemplateSave = useCallback(() => {
    if (!allergiesHaveContent(rows)) return null;
    return { scope: "allergies" as const, allergies: snapshotAllergies(rows ?? []) };
  }, [rows]);

  const controlsReady = !readonly && rows !== null && !!templateControlsRef;

  useEffect(() => {
    if (!templateControlsRef) return;
    if (controlsReady) {
      templateControlsRef.current = {
        applyOverride: applyTemplate,
        buildSaveOverride: buildTemplateSave,
        defaultSaveName: "Allergies",
      };
    } else {
      templateControlsRef.current = null;
    }
  }, [applyTemplate, buildTemplateSave, controlsReady, templateControlsRef]);

  useEffect(() => {
    onTemplateControlsReadyChange?.(controlsReady);
    return () => onTemplateControlsReadyChange?.(false);
  }, [controlsReady, onTemplateControlsReadyChange]);

  const archive = async (row: PatientAllergy) => {
    if (row.id.startsWith("temp-")) return;
    setActionError(null);
    const snapshot = rows ?? [];
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.id !== row.id);
      onCountChange?.(next.length);
      return next;
    });
    try {
      await archivePatientAllergy(token, patientId, row.id);
      setActionError(null);
    } catch (err) {
      setRows(snapshot);
      onCountChange?.(snapshot.length);
      setActionError(err instanceof Error ? err.message : "Failed to remove allergy");
    }
  };

  const patchAllergy = async (row: PatientAllergy, patch: AllergyCardPatch) => {
    const unchanged =
      (patch.severity === undefined || patch.severity === row.severity) &&
      (patch.reaction === undefined || patch.reaction === row.reaction) &&
      (patch.note === undefined || patch.note === row.note);
    if (unchanged) return;

    // Optimistic local update — the chip/field reflects the choice instantly.
    // We never disable the controls while saving, so there is no grey flash.
    setRows((prev) =>
      prev?.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) ?? prev,
    );

    // Temp row: the create reconcile persists these edits once the real id
    // arrives, so there is nothing to PATCH yet.
    if (row.id.startsWith("temp-")) return;

    try {
      await updatePatientAllergy(token, patientId, row.id, patch);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update allergy");
      // Resync from the server so the UI reflects the true persisted state
      // instead of a guessed rollback.
      void reloadAllergies();
    }
  };

  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading allergies…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {templateNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {templateNotice}
        </p>
      ) : null}

      {!readonly && (
        <div id={ALLERGIES_CAPTURE_SECTION_ID} className="scroll-mt-2 space-y-3">
          <ChartCatalogCombobox
            inputId={inputId}
            testId="allergies-combobox"
            placeholder="Search or enter allergen…"
            catalogOptions={catalogOptions}
            filterCatalog={filterCommonAllergenCatalog}
            resolveCatalog={resolveCommonAllergen}
            customLabel={(text) => `Add "${text}" as allergen`}
            focusRequest={focusCombobox}
            onFocusRequestHandled={() => {
              setFocusCombobox(false);
              onAddOpenChange?.(false);
            }}
            onCommit={(payload) => {
              const allergen = payload.kind === "catalog" ? payload.label : payload.text;
              void commitAllergen(allergen);
            }}
          />
          <ChartQuickAddChips
            labels={quickAddLabels}
            groupLabel="Common allergens"
            testId="allergies-quick-add"
            onAdd={(label) => void commitAllergen(label)}
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2" data-testid="allergies-chip-list">
          {rows.map((row) => (
            <AllergyCard
              key={stableKey(row.id)}
              allergy={row}
              readonly={readonly}
              defaultCollapsed
              captureInputId={inputId}
              sectionId={ALLERGIES_CAPTURE_SECTION_ID}
              onPatch={(patch) => void patchAllergy(row, patch)}
              onRemove={() => void archive(row)}
            />
          ))}
        </div>
      )}

      {rows.length === 0 && readonly && (
        <p className="px-1 py-1 text-xs text-muted-foreground">No allergies recorded.</p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
    </div>
  );
}
