"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Sparkles, Trash2 } from "lucide-react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import { ChartCardOptionToggle } from "@/components/ehr/chart/ChartCardOptionToggle";
import { ChartMedAiProposal, type ChartMedAiStatus } from "@/components/ehr/chart/ChartMedAiProposal";
import { ChartMedChipSelect } from "@/components/ehr/chart/ChartMedChipSelect";
import { ChartMedMoreCombobox } from "@/components/ehr/chart/ChartMedMoreCombobox";
import { RelativeAgoField, ChartEditorFieldRow } from "@/components/ehr/chart/ConditionTimingField";
import { chartOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";
import {
  CHART_MED_DOSE_UNIT_PRIMARY,
  CHART_MED_DRAFT,
  CHART_MED_FORM_COMBOBOX_OPTIONS,
  CHART_MED_FOOD_TIMING_PRIMARY,
  CHART_MED_FREQUENCY_HOUR_SLOTS,
  CHART_MED_FREQUENCY_MEAL_SLOTS,
  CHART_MED_FREQUENCY_MORE_SUGGESTIONS,
  CHART_MED_FREQUENCY_TAIL_OPTIONS,
  CHART_MED_SOURCE_OPTIONS,
  CHART_MED_STOP_REASON_PRIMARY,
  CHART_MED_STRENGTH_UNIT_PRIMARY,
  HOUR_TO_MEAL_SLOT_MAP,
  MEAL_TO_HOUR_SLOT_MAP,
  STOP_REASON_CHIP_OPTIONS,
  STOP_REASON_OPTIONS,
  FOOD_TIMING_CHIP_OPTIONS,
  STRENGTH_UNIT_OPTIONS,
  resolveFoodTimingInput,
  resolveStopReasonInput,
  chartMedFormLocksDoseUnit,
  chartMedLockedDoseUnitLabel,
  chartMedPatchFromFormInput,
  chartMedPatchFromParsed,
  chartMedUsesApplyDose,
  chartMedPatchToLocalPatch,
  chartMedPayloadFromAiMedicine,
  chartMedPayloadFromDrugMaster,
  chartMedPayloadFromParsed,
  chartMedPayloadMergeDraft,
  chartMedSourceFromDb,
  chartMedSourceToDb,
  doseQtyFromSchedule,
  doseScheduleForFrequencyChange,
  doseScheduleOptionsForFrequency,
  formatChartMedicationSig,
  formatChartMedFormLabel,
  formatStoppedAgoSummary,
  frequencySupportsDoseSchedule,
  frequencyUiModeFromCode,
  getChartFrequencyLabel,
  inferFormFromDoseUnit,
  formatStrengthComponents,
  formatStrengthLabel,
  isComboStrength,
  isCustomDoseUnit,
  isCustomStrength,
  isFrequencyMoreOrCustom,
  isIntervalFrequency,
  resolveDoseUnitInput,
  resolveFormInput,
  resolveFrequencyMoreInput,
  resolveStrengthFields,
  resolveStrengthUnitInput,
  stoppedSinceLabel,
  syncStrengthLegacy,
  type ChartMedFrequencyUiMode,
  type ChartMedicationPatch,
} from "@/lib/chart/chart-medication";
import {
  CHART_MED_CARD_INSTANCE_ATTR,
  CHART_MED_COLLAPSE_HEADER_ATTR,
  scrollChartMedCaptureIntoView,
  scrollChartMedCardHeaderIntoView,
} from "@/lib/chart/chart-medication-scroll";
import {
  lineHasSigDetails,
  parseMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";
import { shouldRequestAiMedParse } from "@/lib/cockpit/should-request-ai-med-parse";
import { parseMedicineWithAI, type AiParsedMedicine } from "@/lib/api/medicine-parse";
import { DOSE_UNIT_OPTIONS, defaultDoseUnitForForm } from "@/lib/medicineCodes";
import { cn } from "@/lib/utils";
import type {
  CreatePatientMedicationPayload,
  PatientConditionAgoUnit,
  PatientConditionStatus,
  PatientMedication,
  PatientMedicationIntakePattern,
  PatientMedicationStatus,
} from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";
import type { DoseUnit, FrequencyCode, StrengthUnit } from "@/types/prescription";

const MED_STATUS_OPTIONS = [
  { value: "active" as const, label: "Active" },
  { value: "past" as const, label: "Past" },
];

const INTAKE_OPTIONS = [
  { value: "regular" as const, label: "Regular" },
  { value: "irregular" as const, label: "Irregular" },
];

const FREQ_MODE_OPTIONS = [
  { value: "meals" as const, label: "Meals" },
  { value: "hours" as const, label: "Hr" },
];

const EDITOR_INPUT_CLASS =
  "h-8 rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50";

const STRENGTH_CHIP_OPTIONS = STRENGTH_UNIT_OPTIONS.map((opt) => ({
  value: opt.unit,
  label: opt.label,
  title: opt.label,
}));

const DOSE_CHIP_OPTIONS = DOSE_UNIT_OPTIONS.map((opt) => ({
  value: opt.unit,
  label: opt.label,
  title: opt.label,
}));

function EditorFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return <ChartEditorFieldRow label={label}>{children}</ChartEditorFieldRow>;
}

function frequencyMoreDisplay(med: PatientMedication): string {
  if (med.frequency_code === "CUSTOM") return med.frequency ?? "";
  if (isFrequencyMoreOrCustom(med.frequency_code)) {
    return getChartFrequencyLabel(med.frequency_code);
  }
  return "";
}

function formComboboxDisplay(med: PatientMedication): string {
  if (!med.form?.trim()) return "";
  const resolved = resolveFormInput(med.form);
  if (resolved && resolved !== "custom") return formatChartMedFormLabel(resolved);
  return med.form.trim();
}

/** Read-only Active/Past chip — matches complaint-card badge placement (first in row). */
function MedStatusBadge({ isPast }: { isPast: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1 py-0 text-[10px] font-medium",
        isPast
          ? "border-muted-foreground/40 bg-muted text-muted-foreground"
          : "border-primary/30 bg-primary/5 text-primary",
      )}
    >
      {isPast ? "Past" : "Active"}
    </span>
  );
}

export function isChartMedComplete(med: PatientMedication): boolean {
  if (!med.drug_name.trim()) return false;
  if (med.status === "past") return true;
  const hasStrength =
    !!(med.strength_value && med.strength_unit) ||
    isCustomStrength(med) ||
    !!(med.strength?.trim());
  const hasDose =
    chartMedUsesApplyDose(med) ||
    (med.dose_qty != null && med.dose_unit != null) ||
    isCustomDoseUnit(med);
  const hasFreq =
    (med.frequency_code != null && med.frequency_code !== "CUSTOM") ||
    (med.frequency_code === "CUSTOM" && !!med.frequency?.trim()) ||
    (!med.frequency_code && !!med.frequency?.trim());
  return (hasStrength || hasDose) && hasFreq;
}

export interface ChartMedicationCardProps {
  med: PatientMedication;
  conditionStatus?: PatientConditionStatus;
  readonly?: boolean;
  busy?: boolean;
  nested?: boolean;
  token?: string;
  testIdPrefix?: string;
  isDraft?: boolean;
  /**
   * Start collapsed (chip) on mount and stay collapsible even before the sig is
   * complete — mirrors the chief-complaint capture flow where a freshly added
   * card sits closed and the doctor expands it only to edit. Ignored for drafts.
   */
  defaultCollapsed?: boolean;
  /** Capture-bar input id — scroll target after deliberate collapse. */
  captureInputId?: string;
  /** Subsection wrapper id (title + capture bar) — preferred collapse scroll target. */
  medSectionId?: string;
  onDraftCommit?: (payload: CreatePatientMedicationPayload) => void;
  /** Batch create for AI multi-drug "Add all"; falls back to repeated commits. */
  onDraftCommitMany?: (payloads: CreatePatientMedicationPayload[]) => void;
  onDraftCancel?: () => void;
  onPatch: (patch: ChartMedicationPatch) => void;
  onRemove: () => void;
}

export function ChartMedicationCard({
  med,
  conditionStatus = "active",
  readonly = false,
  busy = false,
  nested = false,
  token = "",
  testIdPrefix = "chart-med",
  isDraft = false,
  defaultCollapsed = false,
  captureInputId,
  medSectionId,
  onDraftCommit,
  onDraftCommitMany,
  onDraftCancel,
  onPatch,
  onRemove,
}: ChartMedicationCardProps) {
  const [draftMed, setDraftMed] = useState<PatientMedication>(() => ({ ...CHART_MED_DRAFT }));
  const row = isDraft ? draftMed : med;

  // Strength field is free text (accepts "500", "0.4", "600/300", "500+125"…)
  // parsed on blur. `null` = not editing → show the value derived from the row.
  const [strengthDraft, setStrengthDraft] = useState<string | null>(null);

  // ── Gated AI free-text parse (draft only) — mirrors the subj-14 complaint
  // fallback: deterministic-first, suggestion-only, fail-soft. ───────────────
  const [aiStatus, setAiStatus] = useState<ChartMedAiStatus | "idle">("idle");
  const [aiMeds, setAiMeds] = useState<AiParsedMedicine[]>([]);
  const [showKeepAsTyped, setShowKeepAsTyped] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const pendingFallbackRef = useRef<CreatePatientMedicationPayload | null>(null);

  const resetAiPanel = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    pendingFallbackRef.current = null;
    setShowKeepAsTyped(false);
    setAiStatus("idle");
    setAiMeds([]);
  };

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  /**
   * Run the AI parser. `refine` = explicit "✨" (Tier 2 flagship; text stays in
   * the field). `autogate` = gated Enter (Tier 1 mini; `fallback` is committed
   * on empty/error so Enter never dead-ends).
   */
  const runAiMedParse = (
    text: string,
    trigger: "refine" | "autogate",
    fallback: CreatePatientMedicationPayload | null,
  ) => {
    const trimmed = text.trim();
    if (!trimmed || !token || readonly || busy) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    pendingFallbackRef.current = fallback;
    setShowKeepAsTyped(trigger === "autogate");
    setAiStatus("loading");
    setAiMeds([]);

    const tier = trigger === "refine" ? "escalation" : "default";
    const degradeToTyped = () => {
      aiAbortRef.current = null;
      pendingFallbackRef.current = null;
      setShowKeepAsTyped(false);
      setAiStatus("idle");
      if (fallback) onDraftCommit?.(chartMedPayloadMergeDraft(fallback, draftMed));
    };

    parseMedicineWithAI(token, { text: trimmed, tier, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const found = res.data.medicines;
        if (found.length === 0 && trigger === "autogate") {
          degradeToTyped();
          return;
        }
        setAiMeds(found);
        setAiStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (trigger === "autogate") {
          degradeToTyped();
          return;
        }
        setAiStatus("error");
      });
  };

  const handleAddAiMed = (index: number) => {
    const target = aiMeds[index];
    if (!target) return;
    onDraftCommit?.(
      chartMedPayloadMergeDraft(
        chartMedPayloadFromAiMedicine(target, { status: draftMed.status }),
        draftMed,
      ),
    );
    resetAiPanel();
  };

  const handleAddAllAiMeds = () => {
    const payloads = aiMeds.map((m) =>
      chartMedPayloadMergeDraft(
        chartMedPayloadFromAiMedicine(m, { status: draftMed.status }),
        draftMed,
      ),
    );
    if (payloads.length === 0) {
      resetAiPanel();
      return;
    }
    if (onDraftCommitMany) onDraftCommitMany(payloads);
    else payloads.forEach((p) => onDraftCommit?.(p));
    resetAiPanel();
  };

  const handleKeepAsTyped = () => {
    const fallback = pendingFallbackRef.current;
    resetAiPanel();
    if (fallback) onDraftCommit?.(chartMedPayloadMergeDraft(fallback, draftMed));
  };

  const handleRefine = () => {
    if (!row.drug_name.trim()) return;
    runAiMedParse(row.drug_name, "refine", null);
  };

  const applyPatch = (patch: ChartMedicationPatch) => {
    if (isDraft) {
      setDraftMed((prev) => ({ ...prev, ...chartMedPatchToLocalPatch(patch) }));
    } else {
      onPatch(patch);
    }
  };

  const commitDraft = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Second Enter confirms the AI suggestion (first Enter triggered the parse).
    if (aiStatus === "loading") return;
    if (aiStatus === "ready" && aiMeds.length > 0) {
      if (aiMeds.length === 1) handleAddAiMed(0);
      else handleAddAllAiMeds();
      return;
    }

    const parsed = lineHasSigDetails(trimmed) ? parseMedicineLine(trimmed) : null;
    const fallback: CreatePatientMedicationPayload = parsed?.medicineName
      ? chartMedPayloadFromParsed(parsed)
      : { drugName: trimmed, status: draftMed.status };

    // Auto-gate: a vernacular / multi-drug / under-extracted line offers an AI
    // suggestion instead of committing a literal or merged card. Clean single
    // lines commit straight through deterministically.
    if (token && !readonly && shouldRequestAiMedParse(trimmed, parsed)) {
      runAiMedParse(trimmed, "autogate", fallback);
      return;
    }
    onDraftCommit?.(chartMedPayloadMergeDraft(fallback, draftMed));
  };

  const isPast = row.status === "past";
  const [expanded, setExpanded] = useState(
    isDraft ? true : defaultCollapsed ? false : !isChartMedComplete(row),
  );
  const [freqUiMode, setFreqUiMode] = useState<ChartMedFrequencyUiMode>(() =>
    frequencyUiModeFromCode(row.frequency_code),
  );
  const [doseUnitEditMode, setDoseUnitEditMode] = useState(false);
  // Collapsible once it carries a usable sig, or unconditionally in the
  // capture-flow (`defaultCollapsed`) where even a name-only card sits closed.
  const collapsible = !isDraft && !readonly && (isChartMedComplete(row) || defaultCollapsed);
  const showSummary = collapsible && !expanded;
  const prevExpandedRef = useRef(expanded);

  useLayoutEffect(() => {
    if (!collapsible) return;
    const prev = prevExpandedRef.current;
    if (expanded && !prev) {
      scrollChartMedCardHeaderIntoView(row.id);
    } else if (!expanded && prev && captureInputId) {
      scrollChartMedCaptureIntoView({ sectionId: medSectionId, captureInputId });
    }
    prevExpandedRef.current = expanded;
  }, [expanded, collapsible, row.id, captureInputId, medSectionId]);

  const sigLine = formatChartMedicationSig(row);
  const isSos = row.frequency_code === "PRN" || row.intake_pattern === "prn";
  const scheduleOptions = doseScheduleOptionsForFrequency(row.frequency_code);
  const showScheduleRow = frequencySupportsDoseSchedule(row.frequency_code);
  const comboActive = isComboStrength(row);
  // Genuinely free-text strength (not a recognised number or combo).
  const strengthCustomActive = isCustomStrength(row) && !comboActive;
  const comboSharedUnit: StrengthUnit | null =
    comboActive && row.strength_components
      ? row.strength_components.every(
          (c) => c.unit === row.strength_components![0]!.unit,
        )
        ? (row.strength_components[0]!.unit ?? null)
        : null
      : null;
  const effectiveStrengthUnit: StrengthUnit | null = comboActive
    ? comboSharedUnit
    : strengthCustomActive
      ? null
      : row.strength_unit;
  const strengthFieldValue =
    strengthDraft ??
    (comboActive
      ? formatStrengthComponents(row.strength_components)
      : strengthCustomActive
        ? (row.strength ?? "")
        : row.strength_value != null
          ? String(row.strength_value)
          : "");
  const doseCustomActive = isCustomDoseUnit(row);
  const useApplyDose = chartMedUsesApplyDose(row) && !doseUnitEditMode;
  const doseLocked = chartMedFormLocksDoseUnit(row) && !doseUnitEditMode && !useApplyDose;
  const slotOptions =
    freqUiMode === "meals" ? CHART_MED_FREQUENCY_MEAL_SLOTS : CHART_MED_FREQUENCY_HOUR_SLOTS;

  useEffect(() => {
    if (row.frequency_code && row.frequency_code !== "CUSTOM") {
      setFreqUiMode(frequencyUiModeFromCode(row.frequency_code));
    }
  }, [row.frequency_code]);

  useEffect(() => {
    setDoseUnitEditMode(false);
  }, [row.form, row.id]);

  const handleNameKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented || readonly || busy) return;
    if (isDraft) {
      e.preventDefault();
      commitDraft(row.drug_name);
      return;
    }
    const line = row.drug_name.trim();
    if (!lineHasSigDetails(line)) return;
    const parsed = parseMedicineLine(line);
    if (!parsed?.medicineName) return;
    e.preventDefault();
    applyPatch(chartMedPatchFromParsed(parsed));
  };

  const handleDrugSelect = (drug: DrugMasterRow) => {
    if (isDraft) {
      onDraftCommit?.(
        chartMedPayloadMergeDraft(chartMedPayloadFromDrugMaster(drug), draftMed),
      );
      return;
    }
    const strengthFields = resolveStrengthFields(drug.strength);
    const form = drug.form ?? null;
    const doseUnit = form ? defaultDoseUnitForForm(form) : null;
    setDoseUnitEditMode(false);
    applyPatch({
      drugName: drug.generic_name,
      strength: strengthFields.strength,
      dose: strengthFields.strength,
      strengthValue: strengthFields.strengthValue,
      strengthUnit: strengthFields.strengthUnit,
      strengthComponents: strengthFields.strengthComponents,
      drugMasterId: drug.id,
      form,
      ...(doseUnit ? { doseUnit } : {}),
    });
  };

  const handleSummaryKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readonly) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded(true);
    }
  };

  const handleStatus = (status: PatientMedicationStatus) => {
    if (status === row.status) return;
    if (status === "past") {
      applyPatch({
        status,
        stopReason: conditionStatus === "resolved" ? "resolved" : row.stop_reason,
      });
    } else {
      applyPatch({
        status,
        stoppedAgoValue: null,
        stoppedAgoUnit: null,
        stopReason: null,
      });
    }
  };

  if (showSummary) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={handleSummaryKeyDown}
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring",
          nested && "ml-0",
          isPast && "opacity-70",
        )}
        data-testid={`${testIdPrefix}-summary-${row.id}`}
        {...{ [CHART_MED_CARD_INSTANCE_ATTR]: row.id }}
        aria-label={`${row.drug_name} — expand medication`}
        aria-expanded={false}
      >
        {!readonly ? (
          // Left-aligned status toggle — single control (no duplicate badge).
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ChartCardOptionToggle
              options={MED_STATUS_OPTIONS}
              value={row.status}
              disabled={busy}
              pastOptionValue="past"
              ariaLabel={`${row.drug_name} status`}
              testId={`${testIdPrefix}-summary-status-${row.id}`}
              onChange={handleStatus}
            />
          </div>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {isPast ? "Past" : "Active"}
          </span>
        )}
        <div className="min-w-0 flex-1 text-xs">
          <span className="font-medium text-foreground">{row.drug_name}</span>
          {sigLine ? (
            <span className="text-muted-foreground"> · {sigLine}</span>
          ) : null}
          {isPast && formatStoppedAgoSummary(row.stopped_ago_value, row.stopped_ago_unit) ? (
            <span className="block text-[10px] text-muted-foreground">
              {stoppedSinceLabel(conditionStatus)}{" "}
              {formatStoppedAgoSummary(row.stopped_ago_value, row.stopped_ago_unit)}
            </span>
          ) : null}
        </div>
        {!readonly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${row.drug_name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  const handleFrequency = (code: FrequencyCode) => {
    const next = row.frequency_code === code ? null : code;
    const intakePattern: PatientMedicationIntakePattern | null =
      next === "PRN" ? "prn" : row.intake_pattern === "prn" ? null : row.intake_pattern;
    const doseSchedule = doseScheduleForFrequencyChange(next, row.dose_schedule);
    const qty = doseSchedule ? doseQtyFromSchedule(doseSchedule) : null;

    applyPatch({
      frequencyCode: next,
      frequency: next ? getChartFrequencyLabel(next) : null,
      intakePattern,
      doseSchedule,
      ...(qty != null ? { doseQty: qty } : {}),
    });
  };

  const handleFreqModeToggle = (mode: ChartMedFrequencyUiMode) => {
    if (mode === freqUiMode) return;
    setFreqUiMode(mode);
    const code = row.frequency_code;
    if (!code || code === "CUSTOM" || code === "QHS" || code === "PRN" || code === "STAT") {
      return;
    }
    if (isFrequencyMoreOrCustom(code)) return;

    if (mode === "hours") {
      const mapped = MEAL_TO_HOUR_SLOT_MAP[code];
      if (mapped) handleFrequency(mapped);
      else applyPatch({ frequencyCode: null, frequency: null, doseSchedule: null });
    } else {
      const mapped = HOUR_TO_MEAL_SLOT_MAP[code];
      if (mapped) handleFrequency(mapped);
      else applyPatch({ frequencyCode: null, frequency: null, doseSchedule: null });
    }
  };

  const commitFrequencyMore = (raw: string) => {
    const resolved = resolveFrequencyMoreInput(raw);
    if (!resolved) {
      if (isFrequencyMoreOrCustom(row.frequency_code) || row.frequency_code === "CUSTOM") {
        applyPatch({ frequencyCode: null, frequency: null });
      }
      return;
    }
    const intakePattern: PatientMedicationIntakePattern | null =
      resolved.code === "PRN"
        ? "prn"
        : row.intake_pattern === "prn"
          ? null
          : row.intake_pattern;
    const doseSchedule = isIntervalFrequency(resolved.code)
      ? null
      : doseScheduleForFrequencyChange(resolved.code, row.dose_schedule);
    const qty = doseSchedule ? doseQtyFromSchedule(doseSchedule) : null;
    applyPatch({
      frequencyCode: resolved.code,
      frequency: resolved.frequency,
      intakePattern,
      doseSchedule,
      ...(qty != null ? { doseQty: qty } : {}),
    });
    if (resolved.code !== "CUSTOM") {
      setFreqUiMode(frequencyUiModeFromCode(resolved.code));
    }
  };

  /**
   * Commit the free-text strength field. Routes "/", "+", "-", "," → combo;
   * a bare number → scalar (keeping any unit already chosen); "." stays decimal;
   * anything else is kept verbatim. Empty clears the strength.
   */
  const commitStrengthText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      applyPatch({
        strengthValue: null,
        strengthUnit: null,
        strengthComponents: null,
        strength: null,
        dose: doseCustomActive ? row.dose : null,
      });
      return;
    }
    const fields = resolveStrengthFields(trimmed);
    // Editing only the number ("500" while "mg" is already selected) must not
    // wipe the chosen unit — re-apply the existing unit when the text has none.
    if (
      !fields.strengthComponents &&
      fields.strengthValue != null &&
      fields.strengthUnit == null &&
      row.strength_unit
    ) {
      const legacy = syncStrengthLegacy(fields.strengthValue, row.strength_unit);
      applyPatch({
        strengthValue: fields.strengthValue,
        strengthUnit: row.strength_unit,
        strengthComponents: null,
        strength: legacy,
        dose: doseCustomActive ? row.dose : legacy,
      });
      return;
    }
    applyPatch({
      strengthValue: fields.strengthValue,
      strengthUnit: fields.strengthUnit,
      strengthComponents: fields.strengthComponents,
      strength: fields.strength,
      dose: doseCustomActive ? row.dose : fields.strength,
    });
  };

  const handleStrengthUnitSelect = (unit: StrengthUnit | null) => {
    // Combo: the unit chip sets a shared unit across every ingredient.
    if (comboActive && row.strength_components) {
      const components = row.strength_components.map((c) => ({
        value: c.value,
        unit: unit ?? null,
      }));
      const legacy = formatStrengthComponents(components) || row.strength;
      applyPatch({
        strengthComponents: components,
        strengthValue: null,
        strengthUnit: null,
        strength: legacy,
        dose: doseCustomActive ? row.dose : legacy,
      });
      return;
    }
    if (!unit) {
      applyPatch({
        strengthUnit: null,
        strengthComponents: null,
        strength: row.strength_value != null ? String(row.strength_value) : null,
        dose: doseCustomActive ? row.dose : row.strength_value != null ? String(row.strength_value) : null,
      });
      return;
    }
    const legacy = syncStrengthLegacy(row.strength_value, unit);
    applyPatch({
      strengthUnit: unit,
      strengthComponents: null,
      strength: legacy,
      dose: doseCustomActive ? row.dose : legacy,
    });
  };

  // "More" is units-only now — numbers and combos belong in the main field.
  const handleStrengthMoreCommit = (raw: string) => {
    const unit = resolveStrengthUnitInput(raw);
    if (unit && unit !== "custom") handleStrengthUnitSelect(unit);
  };

  const handleDoseUnitSelect = (unit: DoseUnit | null) => {
    setDoseUnitEditMode(true);
    if (!unit) {
      applyPatch({ doseUnit: null });
      return;
    }
    const inferredForm = !row.form ? inferFormFromDoseUnit(unit) : null;
    applyPatch({
      doseUnit: unit,
      dose: row.strength ?? null,
      ...(inferredForm ? { form: inferredForm } : {}),
    });
  };

  const handleDoseMoreCommit = (raw: string) => {
    setDoseUnitEditMode(true);
    const unit = resolveDoseUnitInput(raw);
    if (unit && unit !== "custom") {
      handleDoseUnitSelect(unit);
      return;
    }
    applyPatch({ doseUnit: null, dose: raw });
  };

  const handleSchedule = (pattern: string) => {
    const next = row.dose_schedule === pattern ? null : pattern;
    const qty = next ? doseQtyFromSchedule(next) : null;
    applyPatch({
      doseSchedule: next,
      ...(qty != null ? { doseQty: qty } : {}),
    });
  };

  const strengthMoreText =
    effectiveStrengthUnit &&
    !CHART_MED_STRENGTH_UNIT_PRIMARY.includes(
      effectiveStrengthUnit as (typeof CHART_MED_STRENGTH_UNIT_PRIMARY)[number],
    )
      ? STRENGTH_CHIP_OPTIONS.find((o) => o.value === effectiveStrengthUnit)?.label ?? ""
      : null;

  const doseMoreText =
    doseCustomActive
      ? (row.dose ?? "")
      : row.dose_unit &&
          !CHART_MED_DOSE_UNIT_PRIMARY.includes(
            row.dose_unit as (typeof CHART_MED_DOSE_UNIT_PRIMARY)[number],
          )
        ? DOSE_CHIP_OPTIONS.find((o) => o.value === row.dose_unit)?.label ?? ""
        : null;

  const freqMoreActive =
    row.frequency_code === "CUSTOM" || isFrequencyMoreOrCustom(row.frequency_code);

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border/50 bg-background p-2",
        nested && "border-border/40",
        isPast && "opacity-90",
      )}
      data-testid={`${testIdPrefix}-entry-${row.id}`}
      {...{ [CHART_MED_CARD_INSTANCE_ATTR]: row.id }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && collapsible) setExpanded(false);
      }}
    >
      {collapsible && (
        <div
          className="-mx-2 -mt-2 mb-1 flex items-center gap-1.5 border-b border-border/60 bg-muted/25 px-2 py-1"
          data-testid={`${testIdPrefix}-collapse-header-${row.id}`}
          {...{ [CHART_MED_COLLAPSE_HEADER_ATTR]: true }}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-0.5 pl-0.5 text-left hover:bg-muted/40"
            aria-label={`Collapse ${row.drug_name}`}
            aria-expanded
          >
            <MedStatusBadge isPast={isPast} />
            <span className="truncate text-xs font-medium text-foreground">{row.drug_name}</span>
            {sigLine ? (
              <span className="truncate text-xs text-muted-foreground">· {sigLine}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label={`Collapse ${row.drug_name}`}
            aria-expanded
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          {!readonly && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive disabled:opacity-50"
              aria-label={`Remove ${row.drug_name}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      <EditorFieldRow label="">
        {!readonly ? (
          <ChartMedMoreCombobox
            inputId={`${testIdPrefix}-form-${row.id}`}
            placeholder="Form"
            disabled={busy}
            value={formComboboxDisplay(row)}
            suggestions={CHART_MED_FORM_COMBOBOX_OPTIONS}
            allowCustom
            resolveMatch={(q) => {
              const resolved = resolveFormInput(q);
              return resolved && resolved !== "custom" ? resolved : undefined;
            }}
            onCommit={(raw) => {
              setDoseUnitEditMode(false);
              applyPatch(chartMedPatchFromFormInput(raw));
            }}
            onClear={() => {
              setDoseUnitEditMode(false);
              applyPatch({ form: null });
            }}
            className="shrink-0"
            inputClassName="w-[3rem] min-w-[3rem] px-1"
          />
        ) : row.form ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formComboboxDisplay(row)}
          </span>
        ) : null}
        <div className="min-w-0 flex-1" onKeyDown={handleNameKeyDown}>
          {token && !readonly ? (
            <DrugAutocomplete
              inputId={`${testIdPrefix}-name-${row.id}`}
              value={row.drug_name}
              onChange={(text) => applyPatch({ drugName: text })}
              onSelect={handleDrugSelect}
              token={token}
              placeholder="Medicine — search or type full line + Enter"
              disabled={busy || readonly}
              inputClassName={EDITOR_INPUT_CLASS}
            />
          ) : (
            <span className="text-xs font-medium">{row.drug_name}</span>
          )}
        </div>
        {!readonly && (
          <ChartCardOptionToggle
            options={MED_STATUS_OPTIONS}
            value={row.status}
            disabled={busy}
            pastOptionValue="past"
            ariaLabel={`${row.drug_name} status`}
            testId={`${testIdPrefix}-status-${row.id}`}
            onChange={handleStatus}
          />
        )}
        {isDraft && token && !readonly && (
          <button
            type="button"
            disabled={busy || aiStatus === "loading" || !row.drug_name.trim()}
            onClick={handleRefine}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
            aria-label="Read this line with AI"
            title="Read this line with AI"
            data-testid={`${testIdPrefix}-ai-refine`}
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}
        {!readonly && !collapsible && (
          <button
            type="button"
            disabled={busy}
            onClick={() => (isDraft ? onDraftCancel?.() : onRemove())}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
            aria-label={isDraft ? "Cancel add medication" : `Remove ${row.drug_name}`}
          >
            <Trash2 className="mx-auto h-4 w-4" />
          </button>
        )}
      </EditorFieldRow>

      {isDraft && aiStatus !== "idle" && (
        <ChartMedAiProposal
          status={aiStatus}
          medicines={aiMeds}
          onAdd={handleAddAiMed}
          onAddAll={handleAddAllAiMeds}
          onDismiss={resetAiPanel}
          {...(showKeepAsTyped ? { onKeepAsTyped: handleKeepAsTyped } : {})}
        />
      )}

      <EditorFieldRow label="Strength">
        <input
          type="text"
          inputMode="decimal"
          value={strengthFieldValue}
          disabled={readonly || busy}
          placeholder="500 or 600/300"
          aria-label={`${row.drug_name} strength`}
          className={cn(EDITOR_INPUT_CLASS, "w-[6.5rem]")}
          onChange={(e) => setStrengthDraft(e.target.value)}
          onBlur={(e) => {
            commitStrengthText(e.target.value);
            setStrengthDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitStrengthText(e.currentTarget.value);
              setStrengthDraft(null);
            }
          }}
        />
        <ChartMedChipSelect
          primaryValues={CHART_MED_STRENGTH_UNIT_PRIMARY}
          allOptions={STRENGTH_CHIP_OPTIONS}
          value={effectiveStrengthUnit}
          moreText={strengthMoreText}
          disabled={readonly || busy}
          ariaLabel="Strength unit"
          onSelect={handleStrengthUnitSelect}
          onMoreCommit={handleStrengthMoreCommit}
          onMoreClear={() => {
            if (
              effectiveStrengthUnit &&
              !CHART_MED_STRENGTH_UNIT_PRIMARY.includes(
                effectiveStrengthUnit as (typeof CHART_MED_STRENGTH_UNIT_PRIMARY)[number],
              )
            ) {
              handleStrengthUnitSelect(null);
            }
          }}
        />
      </EditorFieldRow>

      {strengthDraft != null && strengthDraft.trim() !== "" && (
        <p className="pl-[4.5rem] text-[10px] text-muted-foreground" aria-live="polite">
          {(() => {
            const f = resolveStrengthFields(strengthDraft);
            if (f.strengthComponents) {
              return `→ ${formatStrengthComponents(f.strengthComponents)} — combination, ${f.strengthComponents.length} ingredients`;
            }
            if (f.strengthValue != null) {
              const unit = f.strengthUnit ?? row.strength_unit ?? null;
              const label = unit
                ? formatStrengthLabel(f.strengthValue, unit)
                : String(f.strengthValue);
              return `→ ${label} — single strength`;
            }
            return `→ kept as typed: "${strengthDraft.trim()}"`;
          })()}
        </p>
      )}

      <EditorFieldRow label="Dose">
        {useApplyDose ? (
          <>
            <span className="pt-1 text-xs text-muted-foreground">Apply</span>
            {!readonly && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setDoseUnitEditMode(true)}
              >
                Change
              </button>
            )}
          </>
        ) : (
          <>
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              step={0.5}
              value={row.dose_qty ?? ""}
              disabled={readonly || busy}
              placeholder="#"
              aria-label="Dose quantity"
              className={cn(EDITOR_INPUT_CLASS, "w-[4.25rem]")}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  applyPatch({ doseQty: null });
                  return;
                }
                const n = Number(raw);
                if (!Number.isNaN(n) && n > 0) applyPatch({ doseQty: n });
              }}
            />
            {doseLocked ? (
              <>
                <span className="pt-1 text-xs text-muted-foreground">
                  {chartMedLockedDoseUnitLabel(row)}
                </span>
                {!readonly && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => setDoseUnitEditMode(true)}
                  >
                    Change
                  </button>
                )}
              </>
            ) : (
              <ChartMedChipSelect
                primaryValues={CHART_MED_DOSE_UNIT_PRIMARY}
                allOptions={DOSE_CHIP_OPTIONS}
                value={doseCustomActive ? null : row.dose_unit}
                moreText={doseMoreText}
                disabled={readonly || busy}
                ariaLabel="Dose unit"
                onSelect={handleDoseUnitSelect}
                onMoreCommit={handleDoseMoreCommit}
                onMoreClear={() => {
                  if (doseCustomActive) {
                    applyPatch({ dose: null });
                  } else if (
                    row.dose_unit &&
                    !CHART_MED_DOSE_UNIT_PRIMARY.includes(
                      row.dose_unit as (typeof CHART_MED_DOSE_UNIT_PRIMARY)[number],
                    )
                  ) {
                    handleDoseUnitSelect(null);
                  }
                }}
              />
            )}
          </>
        )}
      </EditorFieldRow>

      <EditorFieldRow label="Frequency">
        {!readonly && (
          <ChartCardOptionToggle
            options={FREQ_MODE_OPTIONS}
            value={freqUiMode}
            disabled={busy}
            ariaLabel="Frequency mode — meals or hours"
            testId={`${testIdPrefix}-freq-mode-${row.id}`}
            onChange={handleFreqModeToggle}
          />
        )}
        {slotOptions.map((opt) => (
          <button
            key={opt.code}
            type="button"
            disabled={readonly || busy}
            aria-pressed={!freqMoreActive && row.frequency_code === opt.code}
            title={opt.tooltip}
            className={chartOptionChipClass(
              !freqMoreActive && row.frequency_code === opt.code,
            )}
            onClick={() => handleFrequency(opt.code)}
          >
            {opt.label}
          </button>
        ))}
        {CHART_MED_FREQUENCY_TAIL_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            type="button"
            disabled={readonly || busy}
            aria-pressed={!freqMoreActive && row.frequency_code === opt.code}
            title={opt.tooltip}
            className={chartOptionChipClass(
              !freqMoreActive && row.frequency_code === opt.code,
            )}
            onClick={() => handleFrequency(opt.code)}
          >
            {opt.label}
          </button>
        ))}
        <ChartMedMoreCombobox
          disabled={readonly || busy}
          value={frequencyMoreDisplay(row)}
          placeholder="More…"
          suggestions={CHART_MED_FREQUENCY_MORE_SUGGESTIONS.map((opt) => ({
            value: opt.code,
            label: opt.label,
            hint: opt.tooltip,
          }))}
          resolveMatch={(query) => resolveFrequencyMoreInput(query)?.code}
          onCommit={commitFrequencyMore}
          onClear={() => {
            if (freqMoreActive) {
              applyPatch({ frequencyCode: null, frequency: null });
            }
          }}
        />
      </EditorFieldRow>

      {showScheduleRow && (
        <EditorFieldRow label="Schedule">
          <div role="group" aria-label="Dose schedule" className="flex flex-wrap gap-1">
            {row.frequency_code === "OD" && (
              <button
                type="button"
                disabled={readonly || busy}
                aria-pressed={!row.dose_schedule}
                className={chartOptionChipClass(!row.dose_schedule)}
                onClick={() => applyPatch({ doseSchedule: null })}
              >
                Any
              </button>
            )}
            {scheduleOptions.map((pattern) => (
              <button
                key={pattern}
                type="button"
                disabled={readonly || busy}
                aria-pressed={row.dose_schedule === pattern}
                className={chartOptionChipClass(row.dose_schedule === pattern)}
                onClick={() => handleSchedule(pattern)}
              >
                {pattern}
              </button>
            ))}
          </div>
        </EditorFieldRow>
      )}

      <EditorFieldRow label="Food">
        {readonly ? (
          <span className="text-xs text-muted-foreground">
            {FOOD_TIMING_CHIP_OPTIONS.find((o) => o.value === row.food_timing)?.label ?? "—"}
          </span>
        ) : (
          <ChartMedChipSelect
            primaryValues={CHART_MED_FOOD_TIMING_PRIMARY}
            allOptions={FOOD_TIMING_CHIP_OPTIONS}
            value={row.food_timing}
            disabled={busy}
            ariaLabel="Food timing"
            moreOnNextRow
            onSelect={(v) => applyPatch({ foodTiming: v })}
            onMoreCommit={(raw) => {
              const resolved = resolveFoodTimingInput(raw);
              if (resolved) applyPatch({ foodTiming: resolved });
            }}
            onMoreClear={() => applyPatch({ foodTiming: null })}
          />
        )}
      </EditorFieldRow>

      <RelativeAgoField
        label="For"
        agoValue={row.started_ago_value}
        agoUnit={row.started_ago_unit}
        disabled={readonly || busy}
        testIdPrefix={`${testIdPrefix}-started-${row.id}`}
        onChange={(agoValue, agoUnit) =>
          applyPatch({
            startedAgoValue: agoValue,
            startedAgoUnit: agoUnit as PatientConditionAgoUnit | null,
          })
        }
      />

      {isPast && (
        <>
          <RelativeAgoField
            label={stoppedSinceLabel(conditionStatus)}
            agoValue={row.stopped_ago_value}
            agoUnit={row.stopped_ago_unit}
            disabled={readonly || busy}
            testIdPrefix={`${testIdPrefix}-stopped-${row.id}`}
            onChange={(agoValue, agoUnit) =>
              applyPatch({
                stoppedAgoValue: agoValue,
                stoppedAgoUnit: agoUnit as PatientConditionAgoUnit | null,
              })
            }
          />
          <EditorFieldRow label="Reason">
            {readonly ? (
              <span className="text-xs text-muted-foreground">
                {STOP_REASON_OPTIONS.find((o) => o.value === row.stop_reason)?.label ?? "—"}
              </span>
            ) : (
              <ChartMedChipSelect
                primaryValues={CHART_MED_STOP_REASON_PRIMARY}
                allOptions={STOP_REASON_CHIP_OPTIONS}
                value={row.stop_reason}
                disabled={busy}
                ariaLabel="Stop reason"
                moreOnNextRow
                onSelect={(v) => applyPatch({ stopReason: v })}
                onMoreCommit={(raw) => {
                  const resolved = resolveStopReasonInput(raw);
                  if (resolved) applyPatch({ stopReason: resolved });
                }}
                onMoreClear={() => applyPatch({ stopReason: null })}
              />
            )}
          </EditorFieldRow>
        </>
      )}

      {!readonly && (
        <div className="space-y-2 pt-2">
          <EditorFieldRow label="Origin">
            <ChartCardOptionToggle
              options={CHART_MED_SOURCE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={chartMedSourceFromDb(row.source)}
              disabled={busy}
              ariaLabel={`${row.drug_name} source`}
              onChange={(ui) => applyPatch({ source: chartMedSourceToDb(ui) })}
            />
          </EditorFieldRow>
          {!isSos && (
            <EditorFieldRow label="Pattern">
              <ChartCardOptionToggle
                options={INTAKE_OPTIONS}
                value={
                  row.intake_pattern === "irregular"
                    ? "irregular"
                    : row.intake_pattern === "regular"
                      ? "regular"
                      : null
                }
                disabled={busy}
                ariaLabel={`${row.drug_name} intake pattern`}
                onChange={(pattern) => applyPatch({ intakePattern: pattern })}
              />
            </EditorFieldRow>
          )}
        </div>
      )}

      <EditorFieldRow label="Notes">
        {readonly ? (
          <span className="text-xs text-muted-foreground">{row.note?.trim() || "—"}</span>
        ) : (
          <input
            type="text"
            defaultValue={row.note ?? ""}
            key={`${row.id}-${row.note ?? ""}`}
            disabled={busy}
            placeholder="Optional notes"
            maxLength={500}
            aria-label={`${row.drug_name} notes`}
            className={cn(EDITOR_INPUT_CLASS, "min-w-0 flex-1")}
            onBlur={(e) => {
              const next = e.target.value.trim() || null;
              if (next !== (row.note ?? null)) applyPatch({ note: next });
            }}
          />
        )}
      </EditorFieldRow>

      {collapsible && (
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(false)}
        >
          Collapse
        </button>
      )}
    </div>
  );
}
