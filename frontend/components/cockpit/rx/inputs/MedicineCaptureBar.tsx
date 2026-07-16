"use client";

/**
 * <MedicineCaptureBar> — one-line Plan medicine capture (med-lib-02).
 *
 * Mirrors PMH `ChartMedicationCaptureBar` for the relevant parts:
 *   - DrugAutocomplete pick → seeded card from drug_master
 *   - Full sig line + Enter → deterministic parse (with catalog confirm /
 *     AI auto-gate for vernacular / multi-drug)
 *   - Explicit ✨ Refine → flagship AI suggestion panel
 *
 * Commits `RxMedicine` rows (Plan data model) — not chart payloads.
 */

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
import type { RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import { parseMedicineWithAI, type AiParsedMedicine } from "@/lib/api/medicine-parse";
import { searchDrugs } from "@/lib/api";
import {
  lineHasSigDetails,
  parseMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";
import {
  mergeCatalogDrugIntoRxMedicine,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
  rxMedicineFromAiMedicine,
  rxMedicineFromDrugMaster,
  rxMedicineFromParsed,
} from "@/lib/cockpit/rx-medicine-from-capture";
import { shouldRequestAiMedParse } from "@/lib/cockpit/should-request-ai-med-parse";
import { shouldAutoAcceptSingleAiMed } from "@/lib/cockpit/ai-med-autogate";
import { formatMedicineSigLine } from "@/lib/medicineCodes";
import type { DrugMasterRow } from "@/types/drug-master";

export interface MedicineCaptureBarProps {
  token: string;
  disabled?: boolean;
  /** A dropdown drug was picked — seed a card from drug_master. */
  onAddDrug: (drug: DrugMasterRow) => void;
  /**
   * Commit one or more Plan medicine rows (deterministic parse or AI).
   * Parent owns insert / densification.
   */
  onAddMedicines: (medicines: RxMedicine[]) => void;
}

/** Show "✨ Refine" once the line carries enough to be worth an AI call. */
const REFINE_MIN_WORDS = 2;

export function MedicineCaptureBar({
  token,
  disabled = false,
  onAddDrug,
  onAddMedicines,
}: MedicineCaptureBarProps) {
  const [text, setText] = useState("");
  const [aiStatus, setAiStatus] = useState<ChartMedAiStatus | "idle">("idle");
  const [aiMeds, setAiMeds] = useState<AiParsedMedicine[]>([]);
  const [showKeepAsTyped, setShowKeepAsTyped] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const pendingFallbackRef = useRef<RxMedicine | null>(null);
  const committingRef = useRef(false);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() =>
      document.getElementById("medicine-capture-bar")?.focus(),
    );
  }, []);

  const resetAi = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    pendingFallbackRef.current = null;
    setShowKeepAsTyped(false);
    setAiStatus("idle");
    setAiMeds([]);
  }, []);

  const commitMedicines = useCallback(
    (medicines: RxMedicine[]) => {
      const named = medicines.filter((m) => m.medicineName.trim().length > 0);
      if (named.length === 0) return;
      onAddMedicines(named);
      setText("");
      resetAi();
      focusInput();
    },
    [onAddMedicines, resetAi, focusInput],
  );

  const parsedPreview = useMemo(() => {
    if (!text.trim() || !lineHasSigDetails(text)) return null;
    return parseMedicineLine(text);
  }, [text]);

  const isSigLine = parsedPreview != null;

  const runAi = useCallback(
    (
      textArg: string,
      trigger: "refine" | "autogate",
      fallback: RxMedicine | null,
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
        if (fallback) commitMedicines([fallback]);
      };

      parseMedicineWithAI(token, {
        text: trimmed,
        tier,
        signal: controller.signal,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          const found = res.data.medicines;
          if (found.length === 0 && trigger === "autogate") {
            degradeToTyped();
            return;
          }
          if (
            shouldAutoAcceptSingleAiMed(
              trigger,
              found,
              fallback?.medicineName,
            )
          ) {
            aiAbortRef.current = null;
            pendingFallbackRef.current = null;
            setShowKeepAsTyped(false);
            setAiStatus("idle");
            setAiMeds([]);
            commitMedicines([rxMedicineFromAiMedicine(found[0]!)]);
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
    [token, disabled, commitMedicines],
  );

  const handleAddAiMed = useCallback(
    (index: number) => {
      const target = aiMeds[index];
      if (!target) return;
      commitMedicines([rxMedicineFromAiMedicine(target)]);
    },
    [aiMeds, commitMedicines],
  );

  const handleAddAllAiMeds = useCallback(() => {
    const meds = aiMeds
      .map(rxMedicineFromAiMedicine)
      .filter((m) => m.medicineName.trim().length > 0);
    if (meds.length === 0) {
      resetAi();
      return;
    }
    commitMedicines(meds);
  }, [aiMeds, commitMedicines, resetAi]);

  const commitDeterministicOrEscalate = useCallback(
    async (trimmed: string, fallback: RxMedicine) => {
      committingRef.current = true;
      try {
        const name = fallback.medicineName.trim();
        if (!token || !name) {
          commitMedicines([fallback]);
          return;
        }

        let results: DrugMasterRow[] = [];
        try {
          const res = await searchDrugs(token, name, { limit: 8 });
          results = res.data.results;
        } catch {
          commitMedicines([fallback]);
          return;
        }

        const match = pickUnambiguousCatalogDrug(name, results);
        if (match) {
          commitMedicines([mergeCatalogDrugIntoRxMedicine(fallback, match)]);
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

        commitMedicines([fallback]);
      } finally {
        committingRef.current = false;
      }
    },
    [token, commitMedicines, runAi],
  );

  const handleEnter = useCallback(() => {
    if (committingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (aiStatus === "loading") return;
    if (aiStatus === "ready" && aiMeds.length > 0) {
      if (aiMeds.length === 1) handleAddAiMed(0);
      else handleAddAllAiMeds();
      return;
    }

    const parsed = parseMedicineLine(trimmed);
    if (!parsed?.medicineName) return;
    const fallback = rxMedicineFromParsed(parsed);

    if (token && shouldRequestAiMedParse(trimmed, parsed)) {
      runAi(trimmed, "autogate", fallback);
      return;
    }
    if (token && nameWorthCatalogLookup(parsed.medicineName)) {
      void commitDeterministicOrEscalate(trimmed, fallback);
      return;
    }
    commitMedicines([fallback]);
  }, [
    text,
    disabled,
    aiStatus,
    aiMeds.length,
    token,
    runAi,
    commitMedicines,
    commitDeterministicOrEscalate,
    handleAddAiMed,
    handleAddAllAiMeds,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    e.preventDefault();
    handleEnter();
  };

  const handleKeepAsTyped = () => {
    const fallback = pendingFallbackRef.current;
    if (fallback) commitMedicines([fallback]);
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
    <div className="mt-2 space-y-1">
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1" onKeyDown={handleKeyDown}>
          <DrugAutocomplete
            inputId="medicine-capture-bar"
            value={text}
            onChange={(next) => {
              setText(next);
              if (aiStatus !== "idle") resetAi();
            }}
            onSelect={(drug) => {
              onAddDrug(drug);
              setText("");
              resetAi();
            }}
            token={token}
            placeholder="Add medicine — search, or type a full line and press Enter (e.g. amlodipine 5 mg 2 tab od 30 days after food)"
            disabled={disabled}
            selectionDisabled={isSigLine}
          />
        </div>
        {canRefine ? (
          <button
            type="button"
            onClick={handleRefineClick}
            className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-medium text-primary hover:bg-primary/10"
            aria-label="Read this line with AI"
            data-testid="medicine-capture-refine"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Refine
          </button>
        ) : null}
      </div>

      {aiStatus !== "idle" ? (
        <ChartMedAiProposal
          status={aiStatus}
          medicines={aiMeds}
          typedText={text.trim()}
          onAdd={handleAddAiMed}
          onAddAll={handleAddAllAiMeds}
          onDismiss={resetAi}
          {...(showKeepAsTyped ? { onKeepAsTyped: handleKeepAsTyped } : {})}
        />
      ) : parsedPreview ? (
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border bg-muted px-1">↵</kbd>{" "}
          adds{" "}
          <span className="font-medium text-foreground">
            {parsedPreview.medicineName}
          </span>
          {(() => {
            const sig = formatMedicineSigLine(parsedPreview);
            return sig ? <> · {sig}</> : null;
          })()}
        </p>
      ) : null}
    </div>
  );
}
