"use client";

/**
 * <MedicineCaptureBar> — one-line Plan medicine capture.
 *
 * Bare names open one dropdown: frequent/saved combos commit a full card;
 * drug_master names only autocomplete into the field. Enter on the typed
 * line still parses + silently merges catalog. Sig tokens hide the picker.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import { type RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import { useDoctorMedicineCombos } from "@/hooks/useDoctorMedicineCombos";
import { searchDrugs } from "@/lib/api";
import {
  lineHasSigDetails,
  parseMedicineLine,
  unrecognisedMedicineResidue,
} from "@/lib/cockpit/medicine-line-parse";
import {
  formatMedicineComboHint,
  matchMedicineCombos,
} from "@/lib/cockpit/medicine-combos";
import { MAX_CLEAN_NAME_WORDS } from "@/lib/cockpit/should-request-ai-med-parse";
import { formatDrugMasterCaptureLine } from "@/lib/drug-master-catalog";
import {
  mergeCatalogDrugIntoRxMedicine,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
  rxMedicineFromCombo,
  rxMedicineFromParsed,
} from "@/lib/cockpit/rx-medicine-from-capture";
import { formatMedicineSigLine } from "@/lib/medicineCodes";
import type { DrugMasterRow } from "@/types/drug-master";

export interface MedicineCaptureBarProps {
  token: string;
  disabled?: boolean;
  /**
   * Commit one or more Plan medicine rows (deterministic parse or combo).
   * Parent owns insert / densification.
   */
  onAddMedicines: (medicines: RxMedicine[]) => void;
}

export function MedicineCaptureBar({
  token,
  disabled = false,
  onAddMedicines,
}: MedicineCaptureBarProps) {
  const [text, setText] = useState("");
  const committingRef = useRef(false);
  const { combos } = useDoctorMedicineCombos(token);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() =>
      document.getElementById("medicine-capture-bar")?.focus()
    );
  }, []);

  const commitMedicines = useCallback(
    (medicines: RxMedicine[]) => {
      const named = medicines.filter((m) => m.medicineName.trim().length > 0);
      if (named.length === 0) return;
      onAddMedicines(named);
      setText("");
      focusInput();
    },
    [onAddMedicines, focusInput]
  );

  const parsedPreview = useMemo(() => {
    if (!text.trim() || !lineHasSigDetails(text)) return null;
    return parseMedicineLine(text);
  }, [text]);

  const isSigLine = parsedPreview != null;
  const matchingCombos = useMemo(
    () => (isSigLine ? [] : matchMedicineCombos(combos, text)),
    [combos, isSigLine, text]
  );

  const extraOptions = useMemo(
    () =>
      matchingCombos.map((combo, idx) => ({
        id: `${combo.nameKey}:${combo.lastUsedAt}:${idx}`,
        label: formatMedicineComboHint(combo),
        badge: idx === 0 ? "Most frequent" : undefined,
      })),
    [matchingCombos]
  );

  const previewResidue = parsedPreview
    ? unrecognisedMedicineResidue(parsedPreview)
    : "";
  const previewSig = parsedPreview
    ? formatMedicineSigLine({ ...parsedPreview, instructions: "" })
    : "";
  const showPlainTextHint =
    !parsedPreview &&
    matchingCombos.length === 0 &&
    text.trim().split(/\s+/).filter(Boolean).length > MAX_CLEAN_NAME_WORDS;

  const commitDeterministic = useCallback(
    async (fallback: RxMedicine) => {
      committingRef.current = true;
      try {
        const name = fallback.medicineName.trim();
        if (!token || !name || !nameWorthCatalogLookup(name)) {
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

        commitMedicines([fallback]);
      } finally {
        committingRef.current = false;
      }
    },
    [token, commitMedicines]
  );

  const commitComboById = useCallback(
    (id: string) => {
      const idx = extraOptions.findIndex((option) => option.id === id);
      const combo = matchingCombos[idx];
      if (!combo) return;
      commitMedicines([rxMedicineFromCombo(combo)]);
    },
    [extraOptions, matchingCombos, commitMedicines]
  );

  const handleEnter = useCallback(() => {
    if (committingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    const parsed = parseMedicineLine(trimmed);
    if (!parsed?.medicineName) return;
    const fallback = rxMedicineFromParsed(parsed);

    if (token && nameWorthCatalogLookup(parsed.medicineName)) {
      void commitDeterministic(fallback);
      return;
    }
    commitMedicines([fallback]);
  }, [text, disabled, token, commitDeterministic, commitMedicines]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || disabled) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleEnter();
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1" onKeyDown={handleKeyDown}>
          <DrugAutocomplete
            inputId="medicine-capture-bar"
            value={text}
            onChange={setText}
            onSelect={(drug) => {
              setText(formatDrugMasterCaptureLine(drug));
            }}
            extraOptions={extraOptions}
            onSelectExtra={commitComboById}
            token={token}
            placeholder="Add medicine — type a full line and press Enter (e.g. amlodipine 5 mg 2 tab od 30 days after food)"
            disabled={disabled}
            selectionDisabled={isSigLine}
          />
        </div>
      </div>

      {parsedPreview ? (
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border bg-muted px-1">↵</kbd>{" "}
          adds{" "}
          <span className="font-medium text-foreground">
            {parsedPreview.medicineName}
          </span>
          {previewSig ? <> · {previewSig}</> : null}
          {previewResidue ? (
            <>
              {" "}
              · didn&apos;t understand:{" "}
              <span className="italic">&ldquo;{previewResidue}&rdquo;</span>
            </>
          ) : null}
        </p>
      ) : showPlainTextHint ? (
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border bg-muted px-1">↵</kbd>{" "}
          adds as plain text — no dose or frequency recognised
        </p>
      ) : null}
    </div>
  );
}
