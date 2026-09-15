"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ChartCatalogCombobox,
  type ChartCatalogOption,
} from "@/components/ehr/chart/ChartCatalogCombobox";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import {
  CHART_CHIP_CLASS,
  CHART_COMPACT_INPUT_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import { Button } from "@/components/ui/button";
import {
  deskErrorMessage,
  getDeskHistorySubmission,
  saveDeskHistorySubmission,
} from "@/lib/desk/api";
import {
  COMMON_DESK_MEDS,
  COMMON_DESK_MED_QUICK_ADD,
  filterDeskMedCatalog,
  resolveDeskMed,
} from "@/lib/desk/common-meds";
import {
  PMH_ICD_SHORTCUTS,
  normalizeConditionKey,
} from "@/lib/chart/pmh-icd-shortcuts";
import {
  COMMON_ALLERGEN_CATALOG,
  COMMON_ALLERGEN_QUICK_ADD,
  commonAllergenLabel,
  filterCommonAllergenCatalog,
  resolveCommonAllergen,
} from "@/lib/cockpit/common-allergens";
import { useDeskSectionOpen } from "@/lib/desk/use-section-open";
import { cn } from "@/lib/utils";
import {
  HISTORY_LIST_MAX,
  type HistoryAllergyItem,
  type HistoryChartSnapshot,
  type HistoryConditionItem,
  type HistoryMedicineItem,
  type PatientHistorySubmission,
  type UpsertHistorySubmissionBody,
} from "@/types/patient-history-submissions";

type AllergyRow = { name: string; reaction: string };
type MedicineRow = { name: string; dose: string };
type ConditionRow = { name: string; code?: string };

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function listSummary(
  none: boolean,
  items: Array<{ name: string }>,
  emptyLabel: string,
): string {
  if (none) return emptyLabel;
  const names = items.map((item) => item.name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(" · ") : emptyLabel;
}

function summaryLine(row: PatientHistorySubmission): string {
  return [
    listSummary(row.allergies.none, row.allergies.items, "No allergies"),
    listSummary(row.conditions.none, row.conditions.items, "No conditions"),
    listSummary(row.medicines.none, row.medicines.items, "No medicines"),
  ].join(" · ");
}

function fromSubmission(row: PatientHistorySubmission): {
  allergyNone: boolean;
  allergies: AllergyRow[];
  medicineNone: boolean;
  medicines: MedicineRow[];
  conditions: ConditionRow[];
} {
  return {
    allergyNone: row.allergies.none,
    allergies: row.allergies.none
      ? []
      : row.allergies.items.map((item) => ({
          name: item.name,
          reaction: item.reaction ?? "",
        })),
    medicineNone: row.medicines.none,
    medicines: row.medicines.none
      ? []
      : row.medicines.items.map((item) => ({
          name: item.name,
          dose: item.dose ?? "",
        })),
    conditions: row.conditions.none
      ? []
      : row.conditions.items.map((item) => ({
          name: item.name,
          ...(item.code ? { code: item.code } : {}),
        })),
  };
}

function fromChart(chart: HistoryChartSnapshot): {
  allergyNone: boolean;
  allergies: AllergyRow[];
  medicineNone: boolean;
  medicines: MedicineRow[];
  conditions: ConditionRow[];
} {
  return {
    allergyNone: chart.noKnownAllergies && chart.allergies.length === 0,
    allergies: chart.allergies.map((item) => ({
      name: item.allergen,
      reaction: item.reaction ?? "",
    })),
    medicineNone: false,
    medicines: chart.medications.map((item) => ({
      name: item.drug_name,
      dose: item.dose ?? "",
    })),
    conditions: chart.conditions.map((item) => ({
      name: item.condition,
      ...(item.code ? { code: item.code } : {}),
    })),
  };
}

function cleanItems<T extends { name: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.name.trim().length > 0).slice(0, HISTORY_LIST_MAX);
}

function buildBody(input: {
  allergyNone: boolean;
  allergies: AllergyRow[];
  medicineNone: boolean;
  medicines: MedicineRow[];
  conditions: ConditionRow[];
}): { ok: true; body: UpsertHistorySubmissionBody } | { ok: false; error: string } {
  const allergyItems: HistoryAllergyItem[] = input.allergyNone
    ? []
    : cleanItems(input.allergies).map((row) => ({
        name: row.name.trim(),
        ...(row.reaction.trim() ? { reaction: row.reaction.trim() } : {}),
      }));
  const medicineItems: HistoryMedicineItem[] = input.medicineNone
    ? []
    : cleanItems(input.medicines).map((row) => ({
        name: row.name.trim(),
        ...(row.dose.trim() ? { dose: row.dose.trim() } : {}),
      }));
  const conditionItems: HistoryConditionItem[] = cleanItems(input.conditions).map((row) => ({
    name: row.name.trim(),
    ...(row.code ? { code: row.code, codeTitle: row.name.trim() } : {}),
  }));

  return {
    ok: true,
    body: {
      whyToday: "",
      allergies: { none: input.allergyNone, items: allergyItems },
      medicines: { none: input.medicineNone, items: medicineItems },
      conditions: { none: conditionItems.length === 0, items: conditionItems },
    },
  };
}

function filterAllergenOptions(
  options: ChartCatalogOption[],
  query: string,
): ChartCatalogOption[] {
  const defs = COMMON_ALLERGEN_CATALOG.filter((def) =>
    options.some((opt) => opt.value === def.value),
  );
  return filterCommonAllergenCatalog(defs, query).map((def) => ({
    value: def.value,
    label: def.label,
  }));
}

function ThinChip({
  label,
  extra,
  extraPlaceholder,
  onExtraChange,
  onRemove,
  removeLabel,
}: {
  label: string;
  extra: string;
  extraPlaceholder: string;
  onExtraChange: (value: string) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className={cn(CHART_CHIP_CLASS, "max-w-full")}>
      <span className="min-w-0 truncate font-medium">{label}</span>
      <input
        value={extra}
        placeholder={extraPlaceholder}
        className={cn(CHART_COMPACT_INPUT_CLASS, "w-28")}
        onChange={(event) => onExtraChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={removeLabel}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

export function DeskHistoryForm({
  token,
  appointmentId,
  onFinished,
  skipFetch = false,
  open: openProp,
  onOpenChange,
  saveLabel = "Save",
  emptySummary = "Skipped",
}: {
  token: string;
  appointmentId: string;
  /** After a fresh check-in: Save or Skip continues the intake sequence. */
  onFinished?: () => void;
  /** Kept for intake callers — the GET still loads existing chart chips. */
  skipFetch?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  saveLabel?: string;
  emptySummary?: string;
}) {
  const { open, setOpen, controlled } = useDeskSectionOpen(openProp, onOpenChange, true);
  const controlledRef = useRef(controlled);
  const setOpenRef = useRef(setOpen);
  controlledRef.current = controlled;
  setOpenRef.current = setOpen;
  const [allergyNone, setAllergyNone] = useState(false);
  const [allergies, setAllergies] = useState<AllergyRow[]>([]);
  const [medicineNone, setMedicineNone] = useState(false);
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [saved, setSaved] = useState<PatientHistorySubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getDeskHistorySubmission(token, appointmentId);
        if (cancelled) return;
        if (res.data.submission) {
          const next = fromSubmission(res.data.submission);
          setAllergyNone(next.allergyNone);
          setAllergies(next.allergies);
          setMedicineNone(next.medicineNone);
          setMedicines(next.medicines);
          setConditions(next.conditions);
          setSaved(res.data.submission);
          if (!controlledRef.current) setOpenRef.current(!skipFetch);
        } else if (res.data.chart) {
          const next = fromChart(res.data.chart);
          setAllergyNone(next.allergyNone);
          setAllergies(next.allergies);
          setMedicineNone(next.medicineNone);
          setMedicines(next.medicines);
          setConditions(next.conditions);
          setSaved(null);
          if (!controlledRef.current) setOpenRef.current(true);
        } else {
          setAllergyNone(false);
          setAllergies([]);
          setMedicineNone(false);
          setMedicines([]);
          setConditions([]);
          setSaved(null);
          if (!controlledRef.current) setOpenRef.current(true);
        }
      } catch (err) {
        if (!cancelled) setError(deskErrorMessage(err, "Could not load history"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen via ref
  }, [token, appointmentId, skipFetch]);

  const allergenOptions = useMemo(
    () =>
      COMMON_ALLERGEN_CATALOG.filter(
        (def) => !allergies.some((row) => nameKey(row.name) === nameKey(def.label)),
      ).map((def) => ({ value: def.value, label: def.label })),
    [allergies],
  );
  const allergenQuickAdd = useMemo(
    () =>
      COMMON_ALLERGEN_QUICK_ADD.map((value) => commonAllergenLabel(value)).filter(
        (label) => !allergies.some((row) => nameKey(row.name) === nameKey(label)),
      ),
    [allergies],
  );
  const medOptions = useMemo(
    () =>
      COMMON_DESK_MEDS.filter(
        (opt) => !medicines.some((row) => nameKey(row.name) === nameKey(opt.label)),
      ),
    [medicines],
  );
  const medQuickAdd = useMemo(
    () =>
      COMMON_DESK_MED_QUICK_ADD.filter(
        (label) => !medicines.some((row) => nameKey(row.name) === nameKey(label)),
      ),
    [medicines],
  );
  const conditionQuickAdd = useMemo(
    () =>
      PMH_ICD_SHORTCUTS.filter(
        (item) =>
          !conditions.some(
            (row) =>
              normalizeConditionKey(row.name) === normalizeConditionKey(item.title) ||
              (row.code && row.code === item.code),
          ),
      ).map((item) => ({ id: item.id, label: item.title, badge: item.code })),
    [conditions],
  );

  function addAllergy(name: string) {
    const trimmed = name.trim();
    if (!trimmed || allergies.length >= HISTORY_LIST_MAX) return;
    if (allergies.some((row) => nameKey(row.name) === nameKey(trimmed))) return;
    setAllergyNone(false);
    setAllergies((prev) => [...prev, { name: trimmed, reaction: "" }]);
  }

  function addMedicine(name: string) {
    const trimmed = name.trim();
    if (!trimmed || medicines.length >= HISTORY_LIST_MAX) return;
    if (medicines.some((row) => nameKey(row.name) === nameKey(trimmed))) return;
    setMedicineNone(false);
    setMedicines((prev) => [...prev, { name: trimmed, dose: "" }]);
  }

  function addCondition(name: string, code?: string) {
    const trimmed = name.trim();
    if (!trimmed || conditions.length >= HISTORY_LIST_MAX) return;
    if (
      conditions.some(
        (row) =>
          normalizeConditionKey(row.name) === normalizeConditionKey(trimmed) ||
          (code && row.code === code),
      )
    ) {
      return;
    }
    setConditions((prev) => [...prev, { name: trimmed, ...(code ? { code } : {}) }]);
  }

  async function onSave() {
    const parsed = buildBody({
      allergyNone,
      allergies,
      medicineNone,
      medicines,
      conditions,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveDeskHistorySubmission(token, appointmentId, parsed.body);
      const next = fromSubmission(res.data.submission);
      setAllergyNone(next.allergyNone);
      setAllergies(next.allergies);
      setMedicineNone(next.medicineNone);
      setMedicines(next.medicines);
      setConditions(next.conditions);
      setSaved(res.data.submission);
      setOpen(false);
      onFinished?.();
    } catch (err) {
      setError(deskErrorMessage(err, "Could not save history"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading health record…</p>;
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Health record
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {saved
              ? summaryLine(saved)
              : allergyNone ||
                  medicineNone ||
                  allergies.length > 0 ||
                  medicines.length > 0 ||
                  conditions.length > 0
                ? [
                    listSummary(allergyNone, allergies, "No allergies"),
                    listSummary(false, conditions, "No conditions"),
                    listSummary(medicineNone, medicines, "No medicines"),
                  ].join(" · ")
                : emptySummary}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2"
          onClick={() => setOpen(true)}
        >
          {saved ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Health record
        </p>
        <p className="text-xs text-muted-foreground">Optional</p>
      </div>
      <p className="text-sm text-muted-foreground">
        These details go on the health record.
      </p>
      <p className="text-xs text-muted-foreground">
        Collection notice slot — wording pending counsel. Version not set.
      </p>

      <section className="space-y-2" aria-label="Allergies">
        <p className="text-sm font-medium">Allergies</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Allergy status">
          <button
            type="button"
            aria-pressed={allergyNone}
            className={chartSelectChipClass(allergyNone)}
            onClick={() => {
              const next = !allergyNone;
              setAllergyNone(next);
              if (next) setAllergies([]);
            }}
          >
            No known allergies
          </button>
        </div>
        {allergies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {allergies.map((row, index) => (
              <ThinChip
                key={`${row.name}-${index}`}
                label={row.name}
                extra={row.reaction}
                extraPlaceholder="Reaction"
                onExtraChange={(value) => {
                  const next = [...allergies];
                  next[index] = { ...row, reaction: value };
                  setAllergies(next);
                }}
                onRemove={() => setAllergies(allergies.filter((_, i) => i !== index))}
                removeLabel={`Remove allergy ${row.name}`}
              />
            ))}
          </div>
        ) : null}
        {!allergyNone ? (
          <>
            <ChartCatalogCombobox
              inputId="desk-history-allergen"
              testId="desk-allergies-combobox"
              placeholder="Search or enter allergen…"
              catalogOptions={allergenOptions}
              filterCatalog={filterAllergenOptions}
              resolveCatalog={resolveCommonAllergen}
              customLabel={(text) => `Add "${text}" as allergen`}
              onCommit={(payload) => {
                addAllergy(payload.kind === "catalog" ? payload.label : payload.text);
              }}
            />
            <ChartQuickAddChips
              labels={allergenQuickAdd}
              groupLabel="Common allergens"
              testId="desk-allergies-quick-add"
              onAdd={addAllergy}
            />
          </>
        ) : null}
      </section>

      <section className="space-y-2" aria-label="Known conditions">
        <p className="text-sm font-medium">Known conditions</p>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((row, index) => (
              <div key={`${row.name}-${index}`} className={cn(CHART_CHIP_CLASS, "max-w-full")}>
                <span className="min-w-0 truncate font-medium">{row.name}</span>
                {row.code ? (
                  <span className="rounded border border-border/70 bg-muted/50 px-1 py-px font-mono text-[10px] uppercase text-muted-foreground">
                    {row.code}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove condition ${row.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setConditions(conditions.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <ChartQuickAddChips
          items={conditionQuickAdd}
          groupLabel="Common conditions"
          testId="desk-conditions-quick-add"
          onAddItem={(item) => {
            const shortcut = PMH_ICD_SHORTCUTS.find((row) => row.id === item.id);
            addCondition(item.label, shortcut?.code);
          }}
        />
        <ChartCatalogCombobox
          inputId="desk-history-condition"
          testId="desk-conditions-combobox"
          placeholder="Search or enter condition…"
          catalogOptions={conditionQuickAdd.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          filterCatalog={(options, query) => {
            const q = query.trim().toLowerCase();
            if (!q) return options;
            return options.filter((opt) => opt.label.toLowerCase().includes(q));
          }}
          resolveCatalog={(query) => {
            const match = PMH_ICD_SHORTCUTS.find(
              (item) => item.title.toLowerCase() === query.trim().toLowerCase(),
            );
            return match?.id;
          }}
          customLabel={(text) => `Add "${text}" as condition`}
          onCommit={(payload) => {
            if (payload.kind === "catalog") {
              const shortcut = PMH_ICD_SHORTCUTS.find((row) => row.id === payload.value);
              addCondition(payload.label, shortcut?.code);
              return;
            }
            addCondition(payload.text);
          }}
        />
      </section>

      <section className="space-y-2" aria-label="Current medicines">
        <p className="text-sm font-medium">Current medicines</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Medicine status">
          <button
            type="button"
            aria-pressed={medicineNone}
            className={chartSelectChipClass(medicineNone)}
            onClick={() => {
              const next = !medicineNone;
              setMedicineNone(next);
              if (next) setMedicines([]);
            }}
          >
            Not on medicines
          </button>
        </div>
        {medicines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {medicines.map((row, index) => (
              <ThinChip
                key={`${row.name}-${index}`}
                label={row.name}
                extra={row.dose}
                extraPlaceholder="Dose"
                onExtraChange={(value) => {
                  const next = [...medicines];
                  next[index] = { ...row, dose: value };
                  setMedicines(next);
                }}
                onRemove={() => setMedicines(medicines.filter((_, i) => i !== index))}
                removeLabel={`Remove medicine ${row.name}`}
              />
            ))}
          </div>
        ) : null}
        {!medicineNone ? (
          <>
            <ChartCatalogCombobox
              inputId="desk-history-medicine"
              testId="desk-medicines-combobox"
              placeholder="Search or enter medicine…"
              catalogOptions={[...medOptions]}
              filterCatalog={filterDeskMedCatalog}
              resolveCatalog={resolveDeskMed}
              customLabel={(text) => `Add "${text}" as medicine`}
              onCommit={(payload) => {
                addMedicine(payload.kind === "catalog" ? payload.label : payload.text);
              }}
            />
            <ChartQuickAddChips
              labels={medQuickAdd}
              groupLabel="Common medicines"
              testId="desk-medicines-quick-add"
              onAdd={addMedicine}
            />
          </>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={saving}
          onClick={() => {
            setError(null);
            if (saved) {
              const next = fromSubmission(saved);
              setAllergyNone(next.allergyNone);
              setAllergies(next.allergies);
              setMedicineNone(next.medicineNone);
              setMedicines(next.medicines);
              setConditions(next.conditions);
              setOpen(false);
              return;
            }
            if (onFinished) {
              onFinished();
              return;
            }
            setOpen(false);
          }}
        >
          {saved ? "Cancel" : "Skip"}
        </Button>
        <Button
          type="button"
          className="h-9 px-4"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
