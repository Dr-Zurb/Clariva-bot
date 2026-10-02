"use client";

import { useMemo, useState } from "react";
import { ChartCatalogCombobox } from "@/components/ehr/chart/ChartCatalogCombobox";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { RelativeAgoField } from "@/components/ehr/chart/ConditionTimingField";
import { chartSelectChipClass } from "@/components/ehr/chart/chart-chip-styles";
import { filterPatientMedicines } from "@/lib/patient-medicine-catalog";
import type { DrugMasterRow } from "@/types/drug-master";
import {
  COMMON_ALLERGEN_CATALOG,
  COMMON_ALLERGEN_QUICK_ADD,
  commonAllergenLabel,
  filterCommonAllergenCatalog,
  resolveCommonAllergen,
} from "@/lib/cockpit/common-allergens";
import {
  FAMILY_HISTORY_CONDITION_CATALOG,
  familyHistoryConditionLabel,
  filterFamilyHistoryConditionCatalog,
  resolveFamilyHistoryCatalogCondition,
  type FamilyHistoryCatalogCondition,
} from "@/lib/cockpit/family-history-conditions";

const CONDITION_QUICK_ADD: readonly FamilyHistoryCatalogCondition[] = [
  "htn",
  "dm",
  "asthma",
  "ckd",
  "thyroid",
  "cad",
  "dyslipidemia",
];

const MAX_NAME = 80;
const MAX_ITEMS = 30;

export interface PrepTimedItem {
  name: string;
  durationValue: number | null;
  durationUnit: "days" | "months" | "years" | null;
}

function blankItem(name: string): PrepTimedItem {
  return { name, durationValue: null, durationUnit: null };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clipName(value: string): string {
  return value.trim().slice(0, MAX_NAME);
}

export function PrepNameSection({
  kind,
  legend,
  noneLabel,
  placeholder,
  medicineCatalog = [],
  items,
  none,
  locked,
  onItems,
  onNone,
}: {
  kind: "medicines" | "allergies" | "conditions";
  legend: string;
  noneLabel: string;
  placeholder: string;
  medicineCatalog?: readonly DrugMasterRow[];
  items: PrepTimedItem[];
  none: boolean;
  locked: boolean;
  onItems: (items: PrepTimedItem[]) => void;
  onNone: (none: boolean) => void;
}) {
  const [medicineQuery, setMedicineQuery] = useState("");

  const medicineOptions = useMemo(
    () => (kind === "medicines" ? filterPatientMedicines(medicineCatalog, medicineQuery) : []),
    [kind, medicineCatalog, medicineQuery],
  );

  const selected = useMemo(() => new Set(items.map((item) => normalize(item.name))), [items]);
  const asksDuration = kind === "medicines" || kind === "conditions";
  const durationPrompt =
    kind === "medicines"
      ? "How long have you been taking this?"
      : "How long have you had this?";

  const catalogOptions = useMemo(() => {
    if (kind === "medicines") return medicineOptions;
    if (kind === "allergies") {
      return COMMON_ALLERGEN_CATALOG.filter((def) => !selected.has(normalize(def.label))).map(
        (def) => ({ value: def.value, label: def.label }),
      );
    }
    return FAMILY_HISTORY_CONDITION_CATALOG.filter(
      (def) => !selected.has(normalize(def.label)),
    ).map((def) => ({ value: def.value, label: def.label }));
  }, [kind, medicineOptions, selected]);

  const quickLabels = useMemo(() => {
    if (kind === "medicines") return [];
    if (kind === "allergies") {
      return COMMON_ALLERGEN_QUICK_ADD.map((value) => commonAllergenLabel(value)).filter(
        (label) => !selected.has(normalize(label)),
      );
    }
    return CONDITION_QUICK_ADD.map((value) => familyHistoryConditionLabel(value)).filter(
      (label) => !selected.has(normalize(label)),
    );
  }, [kind, selected]);

  function addName(raw: string) {
    const name = clipName(raw);
    if (!name || selected.has(normalize(name)) || items.length >= MAX_ITEMS) return;
    onNone(false);
    onItems([...items, blankItem(name)]);
  }

  function setDuration(
    name: string,
    durationValue: number | null,
    durationUnit: "days" | "weeks" | "months" | "years" | null,
  ) {
    onItems(
      items.map((item) =>
        item.name === name
          ? {
              ...item,
              durationValue,
              durationUnit:
                durationValue != null &&
                (durationUnit === "days" || durationUnit === "months" || durationUnit === "years")
                  ? durationUnit
                  : null,
            }
          : item,
      ),
    );
  }

  function commitCatalog(payload: { kind: "catalog"; value: string; label: string } | { kind: "custom"; text: string }) {
    if (payload.kind === "custom") {
      addName(payload.text);
      return;
    }
    if (kind === "medicines") {
      addName(payload.value);
      return;
    }
    addName(payload.label);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-800">{legend}</legend>
      {items.length === 0 ? (
        <button
          type="button"
          aria-pressed={none}
          disabled={locked}
          onClick={() => {
            onNone(!none);
            if (!none) onItems([]);
          }}
          className={chartSelectChipClass(none)}
        >
          {noneLabel}
        </button>
      ) : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.name}
              className="space-y-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span>{item.name}</span>
                {locked ? null : (
                  <button
                    type="button"
                    className="shrink-0 text-sm text-gray-700 underline"
                    onClick={() => onItems(items.filter((row) => row.name !== item.name))}
                  >
                    Remove
                  </button>
                )}
              </div>
              {asksDuration ? (
                <RelativeAgoField
                  label="How long?"
                  prompt={durationPrompt}
                  agoValue={item.durationValue}
                  agoUnit={item.durationUnit}
                  disabled={locked}
                  testIdPrefix={`prep-${kind}-${index}`}
                  onChange={(durationValue, durationUnit) =>
                    setDuration(item.name, durationValue, durationUnit)
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!locked && !none ? (
        <>
          <ChartCatalogCombobox
            inputId={`prep-${kind}`}
            testId={`prep-${kind}`}
            ariaLabel={legend}
            placeholder={placeholder}
            catalogOptions={catalogOptions}
            filterCatalog={(options, query) => {
              if (kind === "medicines") {
                const q = query.trim().toLowerCase();
                if (!q) return [];
                return options.filter(
                  (opt) =>
                    opt.label.toLowerCase().includes(q) ||
                    (opt.hint ?? "").toLowerCase().includes(q),
                );
              }
              if (kind === "allergies") {
                const defs = COMMON_ALLERGEN_CATALOG.filter((def) =>
                  options.some((opt) => opt.value === def.value),
                );
                return filterCommonAllergenCatalog(defs, query).map((def) => ({
                  value: def.value,
                  label: def.label,
                }));
              }
              const defs = FAMILY_HISTORY_CONDITION_CATALOG.filter((def) =>
                options.some((opt) => opt.value === def.value),
              );
              return filterFamilyHistoryConditionCatalog(defs, query).map((def) => ({
                value: def.value,
                label: def.label,
              }));
            }}
            resolveCatalog={(query) => {
              if (kind === "medicines") {
                const q = query.trim().toLowerCase();
                return medicineOptions.find((opt) => opt.label.toLowerCase() === q)?.value;
              }
              if (kind === "allergies") return resolveCommonAllergen(query);
              return resolveFamilyHistoryCatalogCondition(query);
            }}
            customLabel={(text) => `Add "${text}"`}
            onQueryChange={kind === "medicines" ? setMedicineQuery : undefined}
            onCommit={commitCatalog}
          />
          <ChartQuickAddChips
            labels={quickLabels}
            groupLabel={kind === "allergies" ? "Common allergens" : "Common conditions"}
            onAdd={addName}
          />
        </>
      ) : null}
    </fieldset>
  );
}
