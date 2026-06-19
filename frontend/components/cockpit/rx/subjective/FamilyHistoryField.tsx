"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import {
  addFamilyHistoryCatalogCondition,
  addFamilyHistoryOtherCondition,
  addFamilyHistoryRelative,
  addFamilyHistorySiblingCard,
  addFamilyHistorySiblingCatalogCondition,
  addFamilyHistorySiblingOtherCondition,
  addOtherRelativeCatalogCondition,
  addOtherRelativeCustomCondition,
  availableFamilyHistoryCatalogConditionsForEntries,
  availableFamilyHistoryRelativeAddOptions,
  availableOtherRelativeCatalogConditions,
  canAddFamilyHistorySiblingCard,
  formatFamilyHistoryRelativeLabel,
  formatSiblingCardLabel,
  familyHistoryEntryLabel,
  familyHistoryFilledCount,
  familyHistoryRelativeKeysInUse,
  formatFamilyHistoryPreview,
  getFamilyHistoryRelativeEntries,
  getFamilyHistorySiblingCards,
  getOtherRelativeEntries,
  hasFamilyHistoryOtherRelativeCard,
  hasFamilyHistoryStructuredContent,
  patchFamilyHistorySiblingEntry,
  patchOtherRelativeEntry,
  removeFamilyHistorySiblingCard,
  removeFamilyHistorySiblingEntry,
  removeOtherRelativeEntry,
  resolveCatalogConditionFromQuery,
  setFamilyHistoryRelativeDetail,
  setFamilyHistorySiblingDetail,
  toggleFamilyHistoryRelativeDetailChip,
  FAMILY_HISTORY_CONDITION_NOTE_PLACEHOLDER,
  FAMILY_HISTORY_CONDITION_OTHER_MAX,
  FAMILY_HISTORY_CONDITION_NOTE_MAX,
  FAMILY_HISTORY_OTHER_RELATIVE_MAX,
  MAX_FAMILY_HISTORY_CONDITIONS_PER_RELATIVE,
  patchFamilyHistoryEntry,
  removeFamilyHistoryEntry,
  removeFamilyHistoryOtherRelative,
  removeFamilyHistoryRelative,
  setFamilyHistoryNone,
  setFamilyHistoryNotes,
  setFamilyHistoryOtherRelative,
  showFamilyHistoryOtherRelativeCard,
  FAMILY_HISTORY_SECTION_NOTES_MAX,
  FAMILY_HISTORY_SECTION_NOTES_PLACEHOLDER,
  type FamilyHistoryCondition,
  type FamilyHistoryEntry,
  type FamilyHistoryGrandparentSex,
  type FamilyHistoryGrandparentSide,
  type FamilyHistorySiblingCard,
  type FamilyHistorySiblingOrder,
  type FamilyHistorySiblingSex,
  type FamilyHistorySingleRelativeKey,
  type FamilyHistoryStructured,
} from "@/lib/cockpit/family-history";
import { filterFamilyHistoryConditionCatalog, FAMILY_HISTORY_CONDITION_CATALOG } from "@/lib/cockpit/family-history-conditions";
import { SubjectiveSectionTemplateButton } from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";
const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";
const COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-8 px-2 py-1 text-xs");
const COMBOBOX_INPUT_CLASS = cn(
  COMPACT_INPUT_CLASS,
  "w-full min-w-0 transition-[border-radius,box-shadow]",
);

type ComboboxRow =
  | { kind: "catalog"; value: FamilyHistoryCondition; label: string }
  | { kind: "custom"; text: string };

export type FamilyHistoryConditionCommitPayload =
  | { kind: "catalog"; condition: FamilyHistoryCondition }
  | { kind: "custom"; text: string };

function buildConditionComboboxRows(
  filteredDefs: typeof FAMILY_HISTORY_CONDITION_CATALOG,
  query: string,
): ComboboxRow[] {
  const trimmed = query.trim();
  const catalogMatch = trimmed ? resolveCatalogConditionFromQuery(trimmed) : undefined;
  const rows: ComboboxRow[] = filteredDefs.map((def) => ({
    kind: "catalog",
    value: def.value,
    label: def.label,
  }));
  if (trimmed && !catalogMatch) {
    rows.push({ kind: "custom", text: trimmed });
  }
  return rows;
}

const DETAIL_CHIP_CLASS =
  "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50";

function FamilyHistoryConditionCombobox({
  inputId,
  comboboxTestId,
  entries,
  catalogOptions,
  disabled,
  onCommit,
}: {
  inputId: string;
  comboboxTestId: string;
  entries: FamilyHistoryEntry[];
  catalogOptions: ReturnType<typeof availableFamilyHistoryCatalogConditionsForEntries>;
  disabled?: boolean;
  onCommit: (payload: FamilyHistoryConditionCommitPayload) => void;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const atMax = entries.length >= MAX_FAMILY_HISTORY_CONDITIONS_PER_RELATIVE;

  const catalogDefs = useMemo(
    () =>
      FAMILY_HISTORY_CONDITION_CATALOG.filter((def) =>
        catalogOptions.some((option) => option.value === def.value),
      ),
    [catalogOptions],
  );

  const trimmedQuery = query.trim();
  const filteredDefs = useMemo(
    () => filterFamilyHistoryConditionCatalog(catalogDefs, query),
    [catalogDefs, query],
  );

  const rows = useMemo(
    () => buildConditionComboboxRows(filteredDefs, query),
    [filteredDefs, query],
  );

  useEffect(() => {
    if (highlighted >= rows.length) setHighlighted(Math.max(0, rows.length - 1));
  }, [rows.length, highlighted]);

  const finishCommit = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlighted(0);
  }, []);

  const commitRow = useCallback(
    (row: ComboboxRow) => {
      if (row.kind === "catalog") {
        onCommit({ kind: "catalog", condition: row.value });
      } else {
        onCommit({ kind: "custom", text: row.text });
      }
      finishCommit();
    },
    [finishCommit, onCommit],
  );

  const tryCommitOnEnter = useCallback(
    (shiftKey: boolean) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      if (shiftKey) {
        onCommit({ kind: "custom", text: trimmed });
        finishCommit();
        return;
      }

      if (highlighted >= 0 && highlighted < rows.length) {
        commitRow(rows[highlighted]!);
        return;
      }

      const catalogMatch = resolveCatalogConditionFromQuery(trimmed);
      if (catalogMatch) {
        onCommit({ kind: "catalog", condition: catalogMatch });
        finishCommit();
        return;
      }

      onCommit({ kind: "custom", text: trimmed });
      finishCommit();
    },
    [commitRow, finishCommit, highlighted, onCommit, query, rows],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setHighlighted(0);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || atMax) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      setHighlighted(0);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      tryCommitOnEnter(e.shiftKey);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(rows.length > 0 ? 0 : -1);
        return;
      }
      if (rows.length > 0) {
        setHighlighted((i) => Math.min(i + 1, rows.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length > 0) {
        setHighlighted((i) => Math.max(i - 1, 0));
      }
    }
  };

  const showDropdown = open && (rows.length > 0 || trimmedQuery.length > 0);

  if (atMax) return null;

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Search or select condition…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          COMBOBOX_INPUT_CLASS,
          showDropdown && "rounded-b-none border-b-transparent border-primary/30 shadow-sm",
        )}
        data-testid={comboboxTestId}
      />
      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 max-h-52 overflow-auto rounded-b-md border border-t-0 border-border bg-popover py-1 text-xs shadow-lg"
        >
          {rows.map((row, index) => {
            const active = index === highlighted;
            const label =
              row.kind === "catalog"
                ? row.label
                : `Add "${row.text}" as custom condition`;
            return (
              <li
                key={row.kind === "catalog" ? row.value : `custom-${row.text}`}
                role="option"
                aria-selected={active}
                className={cn(
                  "cursor-pointer px-3 py-2",
                  row.kind === "custom" && "border-t border-border/60 italic",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                )}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitRow(row)}
              >
                {label}
              </li>
            );
          })}
          {rows.length === 0 && trimmedQuery ? (
            <li className="px-3 py-2 text-muted-foreground">
              No matches — press Enter to add as custom condition
            </li>
          ) : null}
          {rows.length > 0 ? (
            <li
              className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground"
              aria-hidden
            >
              ↑↓ navigate · Enter to select · Shift+Enter for custom
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function ConditionEntryRow({
  rowKey,
  entry,
  disabled,
  onPatch,
  onRemove,
}: {
  rowKey: string;
  entry: FamilyHistoryEntry;
  disabled?: boolean;
  onPatch: (patch: Partial<Pick<FamilyHistoryEntry, "conditionOther" | "notes">>) => void;
  onRemove: () => void;
}) {
  const label = familyHistoryEntryLabel(entry);

  return (
    <div
      className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-x-2"
      data-testid={`family-history-entry-${rowKey}-${entry.id}`}
    >
      {entry.condition === "other" ? (
        <input
          type="text"
          value={entry.conditionOther ?? ""}
          disabled={disabled}
          placeholder="Condition name"
          aria-label="Other condition name"
          maxLength={FAMILY_HISTORY_CONDITION_OTHER_MAX}
          className={cn(COMPACT_INPUT_CLASS, "min-w-0 font-semibold")}
          data-testid={`family-history-entry-other-name-${entry.id}`}
          onChange={(e) => onPatch({ conditionOther: e.target.value })}
        />
      ) : (
        <span className="min-w-0 truncate text-xs font-semibold text-foreground">{label}</span>
      )}
      <input
        type="text"
        value={entry.notes ?? ""}
        disabled={disabled}
        placeholder={FAMILY_HISTORY_CONDITION_NOTE_PLACEHOLDER}
        aria-label={`${label} note`}
        maxLength={FAMILY_HISTORY_CONDITION_NOTE_MAX}
        className={cn(COMPACT_INPUT_CLASS, "min-w-0")}
        data-testid={`family-history-note-${rowKey}-${entry.id}`}
        onChange={(e) => onPatch({ notes: e.target.value })}
      />
      <RemoveIconButton
        label={`Remove ${label}`}
        disabled={disabled}
        onClick={onRemove}
      />
    </div>
  );
}

function SiblingDetailChips({
  card,
  structured,
  disabled,
  onChange,
}: {
  card: FamilyHistorySiblingCard;
  structured: FamilyHistoryStructured;
  disabled?: boolean;
  onChange: (next: FamilyHistoryStructured) => void;
}) {
  const detail = card.detail;

  return (
    <div className="space-y-1.5" data-testid={`family-history-sibling-detail-${card.id}`}>
      <p className="text-[11px] font-medium text-muted-foreground">Which sibling?</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sibling sex">
        {(["brother", "sister"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={detail?.sex === value}
            onClick={() =>
              onChange(
                setFamilyHistorySiblingDetail(
                  structured,
                  card.id,
                  toggleFamilyHistoryRelativeDetailChip(detail, "sex", value),
                ),
              )
            }
            className={cn(
              DETAIL_CHIP_CLASS,
              detail?.sex === value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {value === "brother" ? "Brother" : "Sister"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sibling order">
        {(
          [
            ["older", "Older"],
            ["younger", "Younger"],
            ["twin", "Twin"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={detail?.order === value}
            onClick={() =>
              onChange(
                setFamilyHistorySiblingDetail(
                  structured,
                  card.id,
                  toggleFamilyHistoryRelativeDetailChip(detail, "order", value),
                ),
              )
            }
            className={cn(
              DETAIL_CHIP_CLASS,
              detail?.order === value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RelativeDetailChips({
  relative,
  structured,
  disabled,
  onChange,
}: {
  relative: FamilyHistorySingleRelativeKey;
  structured: FamilyHistoryStructured;
  disabled?: boolean;
  onChange: (next: FamilyHistoryStructured) => void;
}) {
  if (relative === "grandparent") {
    const detail = structured.relativesMeta?.grandparent;

    return (
      <div className="space-y-1.5" data-testid="family-history-grandparent-detail">
        <p className="text-[11px] font-medium text-muted-foreground">Which grandparent?</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grandparent side">
          {(
            [
              ["maternal", "Maternal"],
              ["paternal", "Paternal"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={detail?.side === value}
              onClick={() =>
                onChange(
                  setFamilyHistoryRelativeDetail(
                    structured,
                    "grandparent",
                    toggleFamilyHistoryRelativeDetailChip(detail, "side", value),
                  ),
                )
              }
              className={cn(
                DETAIL_CHIP_CLASS,
                detail?.side === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grandparent sex">
          {(
            [
              ["grandfather", "Grandfather"],
              ["grandmother", "Grandmother"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={detail?.sex === value}
              onClick={() =>
                onChange(
                  setFamilyHistoryRelativeDetail(
                    structured,
                    "grandparent",
                    toggleFamilyHistoryRelativeDetailChip(detail, "sex", value),
                  ),
                )
              }
              className={cn(
                DETAIL_CHIP_CLASS,
                detail?.sex === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function SiblingCard({
  card,
  structured,
  disabled,
  inputIdPrefix,
  onChange,
}: {
  card: FamilyHistorySiblingCard;
  structured: FamilyHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  onChange: (next: FamilyHistoryStructured) => void;
}) {
  const displayLabel = formatSiblingCardLabel(card.detail);

  return (
    <div
      className="space-y-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2"
      data-testid={`family-history-card-sibling-${card.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{displayLabel}</span>
        <RemoveIconButton
          label={`Remove ${displayLabel}`}
          disabled={disabled}
          onClick={() => onChange(removeFamilyHistorySiblingCard(structured, card.id))}
        />
      </div>

      <SiblingDetailChips
        card={card}
        structured={structured}
        disabled={disabled}
        onChange={onChange}
      />

      {card.entries.length > 0 && (
        <div className="space-y-2 border-l-2 border-primary/20 pl-2">
          {card.entries.map((entry) => (
            <ConditionEntryRow
              key={entry.id}
              rowKey={`sibling-${card.id}`}
              entry={entry}
              disabled={disabled}
              onPatch={(patch) =>
                onChange(patchFamilyHistorySiblingEntry(structured, card.id, entry.id, patch))
              }
              onRemove={() =>
                onChange(removeFamilyHistorySiblingEntry(structured, card.id, entry.id))
              }
            />
          ))}
        </div>
      )}

      <FamilyHistoryConditionCombobox
        inputId={`${inputIdPrefix}-sibling-${card.id}-condition`}
        comboboxTestId={`family-history-condition-combobox-sibling-${card.id}`}
        entries={card.entries}
        catalogOptions={availableFamilyHistoryCatalogConditionsForEntries(card.entries)}
        disabled={disabled}
        onCommit={(payload) => {
          if (payload.kind === "catalog") {
            onChange(
              addFamilyHistorySiblingCatalogCondition(structured, card.id, payload.condition),
            );
            return;
          }
          onChange(addFamilyHistorySiblingOtherCondition(structured, card.id, payload.text));
        }}
      />
    </div>
  );
}

function RelativeCard({
  relative,
  structured,
  disabled,
  inputIdPrefix,
  onChange,
}: {
  relative: FamilyHistorySingleRelativeKey;
  structured: FamilyHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  onChange: (next: FamilyHistoryStructured) => void;
}) {
  const entries = getFamilyHistoryRelativeEntries(structured, relative);
  const displayLabel = formatFamilyHistoryRelativeLabel(relative, structured.relativesMeta);

  return (
    <div
      className="space-y-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2"
      data-testid={`family-history-card-${relative}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{displayLabel}</span>
        <RemoveIconButton
          label={`Remove ${displayLabel}`}
          disabled={disabled}
          onClick={() => onChange(removeFamilyHistoryRelative(structured, relative))}
        />
      </div>

      <RelativeDetailChips
        relative={relative}
        structured={structured}
        disabled={disabled}
        onChange={onChange}
      />

      {entries.length > 0 && (
        <div className="space-y-2 border-l-2 border-primary/20 pl-2">
          {entries.map((entry) => (
            <ConditionEntryRow
              key={entry.id}
              rowKey={relative}
              entry={entry}
              disabled={disabled}
              onPatch={(patch) =>
                onChange(patchFamilyHistoryEntry(structured, relative, entry.id, patch))
              }
              onRemove={() => onChange(removeFamilyHistoryEntry(structured, relative, entry.id))}
            />
          ))}
        </div>
      )}

      <FamilyHistoryConditionCombobox
        inputId={`${inputIdPrefix}-${relative}-condition`}
        comboboxTestId={`family-history-condition-combobox-${relative}`}
        entries={entries}
        catalogOptions={availableFamilyHistoryCatalogConditionsForEntries(entries)}
        disabled={disabled}
        onCommit={(payload) => {
          if (payload.kind === "catalog") {
            onChange(addFamilyHistoryCatalogCondition(structured, relative, payload.condition));
            return;
          }
          onChange(addFamilyHistoryOtherCondition(structured, relative, payload.text));
        }}
      />
    </div>
  );
}

function OtherRelativeCard({
  structured,
  disabled,
  inputId,
  inputIdPrefix,
  onChange,
}: {
  structured: FamilyHistoryStructured;
  disabled?: boolean;
  inputId: string;
  inputIdPrefix: string;
  onChange: (next: FamilyHistoryStructured) => void;
}) {
  const entries = getOtherRelativeEntries(structured);

  return (
    <div
      className="space-y-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2"
      data-testid="family-history-card-other-relative"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Other relative</span>
        <RemoveIconButton
          label="Remove other relative"
          disabled={disabled}
          onClick={() => onChange(removeFamilyHistoryOtherRelative(structured))}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-[11px] font-medium text-muted-foreground">
          Who?
        </label>
        <input
          id={inputId}
          type="text"
          value={structured.other ?? ""}
          disabled={disabled}
          placeholder="e.g. Paternal uncle"
          aria-label="Other relative name"
          className={COMPACT_INPUT_CLASS}
          maxLength={FAMILY_HISTORY_OTHER_RELATIVE_MAX}
          data-testid="family-history-other"
          onChange={(e) => onChange(setFamilyHistoryOtherRelative(structured, e.target.value))}
        />
      </div>

      {entries.length > 0 && (
        <div className="space-y-2 border-l-2 border-primary/20 pl-2">
          {entries.map((entry) => (
            <ConditionEntryRow
              key={entry.id}
              rowKey="other-relative"
              entry={entry}
              disabled={disabled}
              onPatch={(patch) => onChange(patchOtherRelativeEntry(structured, entry.id, patch))}
              onRemove={() => onChange(removeOtherRelativeEntry(structured, entry.id))}
            />
          ))}
        </div>
      )}

      <FamilyHistoryConditionCombobox
        inputId={`${inputIdPrefix}-other-relative-condition`}
        comboboxTestId="family-history-condition-combobox-other-relative"
        entries={entries}
        catalogOptions={availableOtherRelativeCatalogConditions(structured)}
        disabled={disabled}
        onCommit={(payload) => {
          if (payload.kind === "catalog") {
            onChange(addOtherRelativeCatalogCondition(structured, payload.condition));
            return;
          }
          onChange(addOtherRelativeCustomCondition(structured, payload.text));
        }}
      />
    </div>
  );
}

export interface FamilyHistoryFieldProps {
  value: FamilyHistoryStructured;
  disabled?: boolean;
  onChange: (next: FamilyHistoryStructured) => void;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

export function FamilyHistoryField({
  value,
  disabled = false,
  onChange,
  sectionOpen,
  onSectionOpenChange,
}: FamilyHistoryFieldProps) {
  const preview = formatFamilyHistoryPreview(value);
  const noneSelected = value.none === true;
  const inputId = "rx-history-familyHistory";
  const relativeAddOptions = useMemo(
    () => availableFamilyHistoryRelativeAddOptions(value),
    [value],
  );
  const relativesInUse = useMemo(() => familyHistoryRelativeKeysInUse(value), [value]);
  const siblingCards = useMemo(() => getFamilyHistorySiblingCards(value), [value]);
  const showOtherRelativeCard = hasFamilyHistoryOtherRelativeCard(value);
  const showAddRelativeRow =
    relativeAddOptions.length > 0 ||
    canAddFamilyHistorySiblingCard(value) ||
    !showOtherRelativeCard;
  const showCards =
    relativesInUse.length > 0 || siblingCards.length > 0 || showOtherRelativeCard;

  return (
    <CollapsibleContainer
      title="Family history"
      toggleLabel="Toggle Family history"
      preview={preview ? `— ${preview}` : undefined}
      count={familyHistoryFilledCount(value)}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      defaultOpen={sectionOpen === undefined ? hasFamilyHistoryStructuredContent(value) : undefined}
      bodyClassName="space-y-3 px-3 pb-3 pt-0"
      testId="family-history-field"
      leadingActions={<SectionReorderLeadingAction sectionId="family_history" />}
      actions={!disabled ? <SubjectiveSectionTemplateButton scope="family_history" /> : undefined}
    >
      <div className="space-y-1.5" data-testid="family-history-none">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Family history screening">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={noneSelected}
            aria-label="None significant"
            onClick={() => onChange(setFamilyHistoryNone(value, !noneSelected))}
            className={cn(
              CHIP_CLASS,
              noneSelected
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            None significant
          </button>
        </div>
      </div>

      {!noneSelected && (
        <div className="space-y-3" data-testid="family-history-relatives">
          {showAddRelativeRow && (
            <div className="space-y-1.5" data-testid="family-history-add-relatives">
              <p className="text-xs font-medium text-foreground/80">Add relative</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add relative">
                {relativeAddOptions.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    disabled={disabled}
                    aria-label={`Add ${row.label}`}
                    data-testid={`family-history-add-${row.key}`}
                    onClick={() => onChange(addFamilyHistoryRelative(value, row.key))}
                    className={ADD_CHIP_CLASS}
                  >
                    + {row.label}
                  </button>
                ))}
                {canAddFamilyHistorySiblingCard(value) && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Add sibling"
                    data-testid="family-history-add-sibling"
                    onClick={() => onChange(addFamilyHistorySiblingCard(value))}
                    className={ADD_CHIP_CLASS}
                  >
                    + Sibling
                  </button>
                )}
                {!showOtherRelativeCard && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Add other relative"
                    data-testid="family-history-add-other-relative"
                    onClick={() => onChange(showFamilyHistoryOtherRelativeCard(value))}
                    className={ADD_CHIP_CLASS}
                  >
                    + Other relative
                  </button>
                )}
              </div>
            </div>
          )}

          {showCards && (
            <div className="space-y-2 border-l-2 border-primary/20 pl-2" data-testid="family-history-cards">
              {siblingCards.map((card) => (
                <SiblingCard
                  key={card.id}
                  card={card}
                  structured={value}
                  disabled={disabled}
                  inputIdPrefix={inputId}
                  onChange={onChange}
                />
              ))}
              {relativesInUse.map((relative) => (
                <RelativeCard
                  key={relative}
                  relative={relative}
                  structured={value}
                  disabled={disabled}
                  inputIdPrefix={inputId}
                  onChange={onChange}
                />
              ))}
              {showOtherRelativeCard && (
                <OtherRelativeCard
                  structured={value}
                  disabled={disabled}
                  inputId={`${inputId}-other`}
                  inputIdPrefix={inputId}
                  onChange={onChange}
                />
              )}
            </div>
          )}
        </div>
      )}

      {!noneSelected && (
        <div className="space-y-1.5" data-testid="family-history-section-notes">
          <label htmlFor={`${inputId}-notes`} className="text-xs font-medium text-foreground/80">
            Additional notes
          </label>
          <textarea
            id={`${inputId}-notes`}
            rows={2}
            value={value.notes ?? ""}
            onChange={(e) => onChange(setFamilyHistoryNotes(value, e.target.value))}
            placeholder={FAMILY_HISTORY_SECTION_NOTES_PLACEHOLDER}
            disabled={disabled}
            aria-label="Family history additional notes"
            className={RX_FIELD_INPUT_CLASS}
            maxLength={FAMILY_HISTORY_SECTION_NOTES_MAX}
            data-testid="family-history-notes"
          />
        </div>
      )}
    </CollapsibleContainer>
  );
}
