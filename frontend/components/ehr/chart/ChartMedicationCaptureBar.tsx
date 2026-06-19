"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Sparkles } from "lucide-react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import {
  ChartMedAiProposal,
  type ChartMedAiStatus,
} from "@/components/ehr/chart/ChartMedAiProposal";
import { CHART_COMPACT_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import {
  chartMedPayloadFromAiMedicine,
  chartMedPayloadFromDrugMaster,
  chartMedPayloadFromParsed,
  chartMedStartedAgoFromParsed,
  formatChartMedicationSig,
  medicationListHasDuplicate,
  mergeCatalogDrugIntoPayload,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
} from "@/lib/chart/chart-medication";
import {
  lineHasSigDetails,
  parseMedicineLine,
  type ParsedMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";
import { shouldRequestAiMedParse } from "@/lib/cockpit/should-request-ai-med-parse";
import { parseMedicineWithAI, type AiParsedMedicine } from "@/lib/api/medicine-parse";
import { searchDrugs } from "@/lib/api";
import type {
  CreatePatientMedicationPayload,
  PatientConditionStatus,
} from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";

export interface ChartMedicationCaptureBarProps {
  token: string;
  inputId: string;
  disabled?: boolean;
  placeholder?: string;
  /** When adding under a resolved condition, new meds default to "past". */
  conditionStatus?: PatientConditionStatus | null;
  onAddPayload: (payload: CreatePatientMedicationPayload) => void;
}

/** Show "✨ Refine" once the line carries enough to be worth an AI call. */
const REFINE_MIN_WORDS = 2;

export function ChartMedicationCaptureBar({
  token,
  inputId,
  disabled = false,
  placeholder = "Add medication — search or type full line (e.g. metformin 500 mg 2 tab bd) and press Enter",
  conditionStatus,
  onAddPayload,
}: ChartMedicationCaptureBarProps) {
  const [text, setText] = useState("");

  // ── Deterministic-first → AI fallback (mirrors the subj-14 complaint flow and
  // the old draft card): rules parse instantly; we only spend an AI call when
  // the line looks vernacular / multi-drug / under-extracted, or on explicit ✨.
  const [aiStatus, setAiStatus] = useState<ChartMedAiStatus | "idle">("idle");
  const [aiMeds, setAiMeds] = useState<AiParsedMedicine[]>([]);
  const [showKeepAsTyped, setShowKeepAsTyped] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const pendingFallbackRef = useRef<CreatePatientMedicationPayload | null>(null);
  // Guards the async catalog round-trip so a double-Enter can't double-add.
  const committingRef = useRef(false);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }, [inputId]);

  const resetAi = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    pendingFallbackRef.current = null;
    setShowKeepAsTyped(false);
    setAiStatus("idle");
    setAiMeds([]);
  }, []);

  const commitPayload = useCallback(
    (payload: CreatePatientMedicationPayload) => {
      onAddPayload(payload);
      setText("");
      resetAi();
      focusInput();
    },
    [onAddPayload, resetAi, focusInput],
  );

  const parsedPreview = useMemo(() => {
    if (!text.trim() || !lineHasSigDetails(text)) return null;
    return parseMedicineLine(text);
  }, [text]);

  // Once the line carries sig details it's a full typed line, not a name
  // search: disable the autocomplete picker so Enter always parses the line
  // (a stale dropdown match must never hijack Enter and drop the duration).
  const isSigLine = parsedPreview != null;

  /**
   * Run the AI parser. `refine` = explicit ✨ (flagship tier; text stays in the
   * field). `autogate` = gated Enter (mini tier; `fallback` is committed on
   * empty/error so Enter never dead-ends).
   */
  const runAi = useCallback(
    (
      textArg: string,
      trigger: "refine" | "autogate",
      fallback: CreatePatientMedicationPayload | null,
    ) => {
      const trimmed = textArg.trim();
      if (!trimmed || !token || disabled) return;

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
        if (fallback) commitPayload(fallback);
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
    },
    [token, disabled, commitPayload],
  );

  const handleAddAiMed = useCallback(
    (index: number) => {
      const target = aiMeds[index];
      if (!target) return;
      commitPayload(chartMedPayloadFromAiMedicine(target, { conditionStatus }));
    },
    [aiMeds, commitPayload, conditionStatus],
  );

  const handleAddAllAiMeds = useCallback(() => {
    const payloads = aiMeds.map((m) => chartMedPayloadFromAiMedicine(m, { conditionStatus }));
    const unique: CreatePatientMedicationPayload[] = [];
    for (const p of payloads) {
      if (
        medicationListHasDuplicate(
          unique.map((u) => ({ drug_name: u.drugName, drug_master_id: u.drugMasterId ?? null })),
          p,
        )
      ) {
        continue;
      }
      unique.push(p);
    }
    if (unique.length === 0) {
      resetAi();
      return;
    }
    unique.forEach((p) => onAddPayload(p));
    setText("");
    resetAi();
    focusInput();
  }, [aiMeds, onAddPayload, resetAi, focusInput, conditionStatus]);

  /**
   * Deterministic commit with a catalog confirmation pass: try to resolve the
   * typed/short-form name against `drug_master`. A single unambiguous match is
   * expanded in place (canonical name + drugMasterId + missing defaults); a
   * short form that maps to several generics ("met", "amlo") is escalated to
   * the AI so we never silently commit an ambiguous name. Network failures and
   * unmatched names fall back to the as-typed parse so Enter never dead-ends.
   */
  const commitDeterministicOrEscalate = useCallback(
    async (
      trimmed: string,
      parsed: ParsedMedicineLine,
      fallback: CreatePatientMedicationPayload,
    ) => {
      committingRef.current = true;
      try {
        const name = parsed.medicineName.trim();
        if (!token || !name) {
          commitPayload(fallback);
          return;
        }

        let results: DrugMasterRow[] = [];
        try {
          const res = await searchDrugs(token, name, { limit: 8 });
          results = res.data.results;
        } catch {
          commitPayload(fallback);
          return;
        }

        const match = pickUnambiguousCatalogDrug(name, results);
        if (match) {
          commitPayload(mergeCatalogDrugIntoPayload(fallback, match));
          return;
        }

        const q = name.toLowerCase();
        const prefixCount = results.filter((r) =>
          r.generic_name.trim().toLowerCase().startsWith(q),
        ).length;
        if (prefixCount > 1) {
          runAi(trimmed, "autogate", fallback);
          return;
        }

        commitPayload(fallback);
      } finally {
        committingRef.current = false;
      }
    },
    [token, commitPayload, runAi],
  );

  const handleEnter = useCallback(() => {
    if (committingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Second Enter confirms the AI suggestion (first Enter triggered the parse).
    if (aiStatus === "loading") return;
    if (aiStatus === "ready" && aiMeds.length > 0) {
      if (aiMeds.length === 1) handleAddAiMed(0);
      else handleAddAllAiMeds();
      return;
    }

    const parsed = parseMedicineLine(trimmed);
    if (!parsed?.medicineName) return;
    const fallback = chartMedPayloadFromParsed(parsed, { conditionStatus });

    // Auto-gate vernacular / multi-drug / under-extracted lines to the AI.
    if (token && shouldRequestAiMedParse(trimmed, parsed)) {
      runAi(trimmed, "autogate", fallback);
      return;
    }
    // Short-form names get a catalog confirmation pass; clean full names commit
    // instantly so rapid entry never waits on a network round-trip.
    if (token && nameWorthCatalogLookup(parsed.medicineName)) {
      void commitDeterministicOrEscalate(trimmed, parsed, fallback);
      return;
    }
    commitPayload(fallback);
  }, [
    text,
    disabled,
    aiStatus,
    aiMeds.length,
    token,
    conditionStatus,
    runAi,
    commitPayload,
    commitDeterministicOrEscalate,
    handleAddAiMed,
    handleAddAllAiMeds,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // DrugAutocomplete handles Enter when its dropdown selection is active
    // (it preventDefaults); only act on the free-text Enter.
    if (e.key !== "Enter" || e.defaultPrevented) return;
    e.preventDefault();
    handleEnter();
  };

  const handleKeepAsTyped = () => {
    const fallback = pendingFallbackRef.current;
    if (fallback) commitPayload(fallback);
    else resetAi();
  };

  const handleRefineClick = () => {
    const trimmed = text.trim();
    if (trimmed) runAi(trimmed, "refine", null);
  };

  const canRefine =
    !!token &&
    !disabled &&
    aiStatus !== "loading" &&
    text.trim().split(/\s+/).filter(Boolean).length >= REFINE_MIN_WORDS;

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1" onKeyDown={handleKeyDown}>
          <DrugAutocomplete
            inputId={inputId}
            value={text}
            onChange={setText}
            onSelect={(drug: DrugMasterRow) =>
              commitPayload(chartMedPayloadFromDrugMaster(drug))
            }
            token={token}
            placeholder={placeholder}
            disabled={disabled}
            selectionDisabled={isSigLine}
            inputClassName={CHART_COMPACT_INPUT_CLASS}
          />
        </div>
        {canRefine ? (
          <button
            type="button"
            onClick={handleRefineClick}
            className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-medium text-primary hover:bg-primary/10"
            aria-label="Read this line with AI"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Refine
          </button>
        ) : null}
      </div>

      {aiStatus !== "idle" ? (
        <>
          <ChartMedAiProposal
            status={aiStatus}
            medicines={aiMeds}
            onAdd={handleAddAiMed}
            onAddAll={handleAddAllAiMeds}
            onDismiss={resetAi}
            {...(showKeepAsTyped ? { onKeepAsTyped: handleKeepAsTyped } : {})}
          />
          {aiStatus === "ready" && aiMeds.length > 0 ? (
            <p className="text-[10px] text-muted-foreground" aria-live="polite">
              <kbd className="rounded border border-border bg-muted px-1">↵</kbd> adds{" "}
              {aiMeds.length === 1 ? "suggestion" : "all suggestions"}
            </p>
          ) : null}
        </>
      ) : parsedPreview ? (
        <p className="mt-1 text-[10px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border bg-muted px-1">↵</kbd> adds{" "}
          <span className="font-medium text-foreground">{parsedPreview.medicineName}</span>
          {(() => {
            const previewAgo = chartMedStartedAgoFromParsed(parsedPreview);
            const previewMed = {
              id: "",
              doctor_id: "",
              patient_id: "",
              drug_name: parsedPreview.medicineName,
              strength: parsedPreview.dosage || null,
              dose: parsedPreview.dosage || null,
              strength_value: null,
              strength_unit: null,
              strength_components: null,
              dose_qty: parsedPreview.doseQty,
              dose_unit: parsedPreview.doseUnit,
              frequency_code: parsedPreview.frequencyCode,
              frequency:
                parsedPreview.frequencyCode === "PRN" ? "SOS" : parsedPreview.frequency,
              form: parsedPreview.form,
              drug_master_id: null,
              status: "active" as const,
              intake_pattern: null,
              source: null,
              started_on: null,
              stopped_on: null,
              started_ago_value: previewAgo.value,
              started_ago_unit: previewAgo.unit,
              stopped_ago_value: null,
              stopped_ago_unit: null,
              stop_reason: null,
              dose_schedule: parsedPreview.doseSchedule,
              food_timing: parsedPreview.foodTiming,
              note: null,
              archived_at: null,
              created_at: "",
              updated_at: "",
            };
            const sig = formatChartMedicationSig(previewMed);
            return sig ? <> · {sig}</> : null;
          })()}
        </p>
      ) : null}
    </div>
  );
}
