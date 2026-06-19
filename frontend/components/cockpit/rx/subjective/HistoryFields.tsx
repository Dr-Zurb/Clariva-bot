"use client";

import { useMemo, type ReactNode } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { FamilyHistoryField } from "@/components/cockpit/rx/subjective/FamilyHistoryField";
import { NoteFavoritesChipStrip } from "@/components/cockpit/rx/subjective/NoteFavoritesChipStrip";
import { SocialHistoryField } from "@/components/cockpit/rx/subjective/SocialHistoryField";
import { useNoteFavorites } from "@/hooks/useNoteFavorites";
import {
  HISTORY_FIELD_DEFS,
  getHistoryFieldChips,
  historyFieldInputId,
  insertHistoryChip,
  type HistoryFieldKey,
} from "@/lib/cockpit/history-field-chips";
import { historyFieldKeyToSectionId } from "@/lib/cockpit/subjective-section-order";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";
import { historyFieldKeyToNoteFavorite } from "@/lib/api/note-favorites";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";

export interface HistoryFieldsProps {
  disabled?: boolean;
}

export interface HistoryFieldSectionOpenControl {
  openById: Readonly<Partial<Record<SubjectiveSectionId, boolean>>>;
  onOpenChange: (sectionId: SubjectiveSectionId, open: boolean) => void;
}

interface HistoryFieldRowProps {
  fieldKey: HistoryFieldKey;
  label: string;
  placeholder: string;
  value: string;
  staticChips: string[];
  disabled?: boolean;
  token?: string;
  onChange: (next: string) => void;
  sectionId: SubjectiveSectionId;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

function HistoryFieldRow({
  fieldKey,
  label,
  placeholder,
  value,
  staticChips,
  disabled = false,
  token,
  onChange,
  sectionOpen,
  onSectionOpenChange,
}: HistoryFieldRowProps) {
  const noteFieldKey = historyFieldKeyToNoteFavorite(fieldKey);
  const { favorites, applyFavorite, saveFavorite, canSaveMore } = useNoteFavorites(
    token,
    noteFieldKey,
  );
  const inputId = historyFieldInputId(fieldKey);
  const preview = value.trim();

  return (
    <CollapsibleContainer
      title={label}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      defaultOpen={sectionOpen === undefined ? false : undefined}
      toggleLabel={`Toggle ${label}`}
      preview={preview ? `— ${preview}` : undefined}
      bodyClassName="space-y-2 px-3 pb-3 pt-0"
    >
      <NoteFavoritesChipStrip
        favorites={favorites}
        disabled={disabled}
        canSaveCurrent={canSaveMore && preview.length > 0}
        onApply={(favValue) => {
          onChange(insertHistoryChip(value, favValue));
          void applyFavorite(favValue);
        }}
        onSaveCurrent={() => void saveFavorite(value)}
        fallbackChips={staticChips}
        onApplyFallback={(chip) => onChange(insertHistoryChip(value, chip))}
        ariaLabel={`${label} quick phrases`}
      />
      <textarea
        id={inputId}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        className={RX_FIELD_INPUT_CLASS}
        maxLength={2000}
      />
    </CollapsibleContainer>
  );
}

function buildHistoryFieldNode(
  fieldKey: HistoryFieldKey,
  disabled: boolean,
  fields: ReturnType<typeof useRxForm>["state"]["fields"],
  setField: ReturnType<typeof useRxForm>["setField"],
  setFamilyHistoryStructured: ReturnType<typeof useRxForm>["setFamilyHistoryStructured"],
  setSocialHistoryStructured: ReturnType<typeof useRxForm>["setSocialHistoryStructured"],
  token: string | undefined,
  sectionOpenControl?: HistoryFieldSectionOpenControl,
): ReactNode {
  const def = HISTORY_FIELD_DEFS.find((entry) => entry.fieldKey === fieldKey);
  if (!def) return null;

  const sectionId = historyFieldKeyToSectionId(def.fieldKey);
  const sectionOpen = sectionOpenControl?.openById[sectionId];
  const onSectionOpenChange = sectionOpenControl
    ? (open: boolean) => sectionOpenControl.onOpenChange(sectionId, open)
    : undefined;

  if (def.fieldKey === "familyHistory") {
    return (
      <FamilyHistoryField
        value={fields.familyHistoryStructured}
        disabled={disabled}
        onChange={setFamilyHistoryStructured}
        sectionOpen={sectionOpen}
        onSectionOpenChange={onSectionOpenChange}
      />
    );
  }

  if (def.fieldKey === "socialHistory") {
    return (
      <SocialHistoryField
        value={fields.socialHistoryStructured}
        disabled={disabled}
        onChange={setSocialHistoryStructured}
        sectionOpen={sectionOpen}
        onSectionOpenChange={onSectionOpenChange}
      />
    );
  }

  return (
    <HistoryFieldRow
      fieldKey={def.fieldKey}
      label={def.label}
      placeholder={def.placeholder}
      value={fields[def.fieldKey]}
      staticChips={getHistoryFieldChips(def.fieldKey)}
      disabled={disabled}
      token={token}
      onChange={(next) => setField(def.fieldKey, next)}
      sectionId={sectionId}
      sectionOpen={sectionOpen}
      onSectionOpenChange={onSectionOpenChange}
    />
  );
}

/** Per-id history field nodes for the subjective section registry (subj-23). */
export function useHistoryFieldRegistry(
  disabled = false,
  sectionOpenControl?: HistoryFieldSectionOpenControl,
): Partial<Record<SubjectiveSectionId, ReactNode>> {
  const { state, setField, setFamilyHistoryStructured, setSocialHistoryStructured, token } =
    useRxForm();
  const { fields } = state;

  return useMemo(() => {
    const registry: Partial<Record<SubjectiveSectionId, ReactNode>> = {};

    for (const def of HISTORY_FIELD_DEFS) {
      const sectionId = historyFieldKeyToSectionId(def.fieldKey);
      registry[sectionId] = buildHistoryFieldNode(
        def.fieldKey,
        disabled,
        fields,
        setField,
        setFamilyHistoryStructured,
        setSocialHistoryStructured,
        token,
        sectionOpenControl,
      );
    }

    return registry;
  }, [
    disabled,
    fields,
    setField,
    setFamilyHistoryStructured,
    setSocialHistoryStructured,
    token,
    sectionOpenControl,
  ]);
}

/** @deprecated Prefer `useHistoryFieldRegistry` inside `SubjectiveSection`. Kept for tests. */
export function HistoryFields({ disabled = false }: HistoryFieldsProps) {
  const registry = useHistoryFieldRegistry(disabled);

  return (
    <>
      {HISTORY_FIELD_DEFS.map((def) => {
        const sectionId = historyFieldKeyToSectionId(def.fieldKey);
        return <div key={def.fieldKey}>{registry[sectionId]}</div>;
      })}
    </>
  );
}
