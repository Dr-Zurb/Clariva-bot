"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import {
  addPastSurgicalCatalogProcedure,
  addPastSurgicalOtherProcedure,
  availablePastSurgicalCatalogProcedures,
  filterPastSurgicalProcedureCatalog,
  formatPastSurgicalHistoryPreview,
  getPastSurgicalProcedureEntries,
  hasPastSurgicalHistoryStructuredContent,
  MAX_PAST_SURGICAL_PROCEDURES,
  PAST_SURGICAL_AGO_UNITS,
  PAST_SURGICAL_AGO_VALUE_MAX,
  PAST_SURGICAL_PROCEDURE_CATALOG,
  PAST_SURGICAL_PROCEDURE_NOTE_PLACEHOLDER,
  PAST_SURGICAL_PROCEDURE_NOTE_MAX,
  PAST_SURGICAL_PROCEDURE_OTHER_MAX,
  PAST_SURGICAL_SECTION_NOTES_MAX,
  PAST_SURGICAL_SECTION_NOTES_PLACEHOLDER,
  pastSurgicalHistoryFilledCount,
  pastSurgicalProcedureEntryLabel,
  patchPastSurgicalProcedureEntry,
  removePastSurgicalProcedureEntry,
  resolveCatalogProcedureFromQuery,
  setPastSurgicalHistoryNone,
  setPastSurgicalHistoryNotes,
  type PastSurgicalAgoUnit,
  type PastSurgicalProcedure,
  type PastSurgicalProcedureEntry,
  type PastSurgicalHistoryStructured,
} from "@/lib/cockpit/past-surgical-history";
import {
  PAST_SURGICAL_QUICK_ADD_VALUES,
  pastSurgicalProcedureLabel,
} from "@/lib/cockpit/past-surgical-procedures";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { HistorySubsection } from "@/components/ehr/chart/HistorySubsection";
import { SubjectiveSectionTemplateButton } from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";
const QUICK_CHIP_CLASS =
  "min-h-8 rounded-full border border-dashed border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";
const COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-8 px-2 py-1 text-xs");
const COMBOBOX_INPUT_CLASS = cn(
  COMPACT_INPUT_CLASS,
  "w-full min-w-0 transition-[border-radius,box-shadow]",
);

type ComboboxRow =
  | { kind: "catalog"; value: PastSurgicalProcedure; label: string }
  | { kind: "custom"; text: string };

type CommitPayload =
  | { kind: "catalog"; procedure: PastSurgicalProcedure }
  | { kind: "custom"; text: string };

function buildComboboxRows(
  filteredDefs: typeof PAST_SURGICAL_PROCEDURE_CATALOG,
  query: string,
): ComboboxRow[] {
  const trimmed = query.trim();
  const catalogMatch = trimmed ? resolveCatalogProcedureFromQuery(trimmed) : undefined;
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

function ProcedureCombobox({
  inputId,
  entries,
  catalogOptions,
  disabled,
  onCommit,
}: {
  inputId: string;
  entries: PastSurgicalProcedureEntry[];
  catalogOptions: ReturnType<typeof availablePastSurgicalCatalogProcedures>;
  disabled?: boolean;
  onCommit: (payload: CommitPayload) => void;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const atMax = entries.length >= MAX_PAST_SURGICAL_PROCEDURES;
  const catalogDefs = useMemo(
    () =>
      PAST_SURGICAL_PROCEDURE_CATALOG.filter((def) =>
        catalogOptions.some((option) => option.value === def.value),
      ),
    [catalogOptions],
  );
  const trimmedQuery = query.trim();
  const filteredDefs = useMemo(
    () => filterPastSurgicalProcedureCatalog(query).filter((def) =>
      catalogDefs.some((c) => c.value === def.value),
    ),
    [catalogDefs, query],
  );
  const rows = useMemo(() => buildComboboxRows(filteredDefs, query), [filteredDefs, query]);

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
      if (row.kind === "catalog") onCommit({ kind: "catalog", procedure: row.value });
      else onCommit({ kind: "custom", text: row.text });
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
      const catalogMatch = resolveCatalogProcedureFromQuery(trimmed);
      if (catalogMatch) {
        onCommit({ kind: "catalog", procedure: catalogMatch });
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
      if (rows.length > 0) setHighlighted((i) => Math.min(i + 1, rows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length > 0) setHighlighted((i) => Math.max(i - 1, 0));
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
        placeholder="Search or select procedure…"
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
        data-testid="past-surgical-procedure-combobox"
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
              row.kind === "catalog" ? row.label : `Add "${row.text}" as custom procedure`;
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
        </ul>
      )}
    </div>
  );
}

function ProcedureEntryRow({
  entry,
  disabled,
  onPatch,
  onRemove,
}: {
  entry: PastSurgicalProcedureEntry;
  disabled?: boolean;
  onPatch: (
    patch: Partial<
      Pick<PastSurgicalProcedureEntry, "procedureOther" | "agoValue" | "agoUnit" | "notes">
    >,
  ) => void;
  onRemove: () => void;
}) {
  const label = pastSurgicalProcedureEntryLabel(entry);

  const handleAgoValueChange = (raw: string) => {
    if (raw === "") {
      onPatch({ agoValue: undefined, agoUnit: undefined });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onPatch({
      agoValue: Math.min(parsed, PAST_SURGICAL_AGO_VALUE_MAX),
      agoUnit: entry.agoUnit ?? "years",
    });
  };

  const handleAgoUnitChange = (unit: PastSurgicalAgoUnit) => {
    if (entry.agoValue && entry.agoValue > 0) {
      onPatch({ agoUnit: unit });
      return;
    }
    onPatch({ agoValue: 1, agoUnit: unit });
  };

  return (
    <div
      className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,3rem)_minmax(0,5.5rem)_auto_minmax(0,1fr)_auto] items-center gap-x-2"
      data-testid={`past-surgical-entry-${entry.id}`}
    >
      {entry.procedure === "other" ? (
        <input
          type="text"
          value={entry.procedureOther ?? ""}
          disabled={disabled}
          placeholder="Procedure name"
          aria-label="Other procedure name"
          maxLength={PAST_SURGICAL_PROCEDURE_OTHER_MAX}
          className={cn(COMPACT_INPUT_CLASS, "min-w-0 font-semibold")}
          data-testid={`past-surgical-entry-other-name-${entry.id}`}
          onChange={(e) => onPatch({ procedureOther: e.target.value })}
        />
      ) : (
        <span className="min-w-0 truncate text-xs font-semibold text-foreground">{label}</span>
      )}
      <input
        type="number"
        min={1}
        max={PAST_SURGICAL_AGO_VALUE_MAX}
        value={entry.agoValue ?? ""}
        disabled={disabled}
        placeholder="—"
        aria-label={`${label} how long ago`}
        className={cn(COMPACT_INPUT_CLASS, "min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")}
        data-testid={`past-surgical-ago-value-${entry.id}`}
        onChange={(e) => handleAgoValueChange(e.target.value)}
      />
      <select
        value={entry.agoUnit ?? "years"}
        disabled={disabled}
        aria-label={`${label} time unit`}
        className={cn(COMPACT_INPUT_CLASS, "min-w-0 pr-6")}
        data-testid={`past-surgical-ago-unit-${entry.id}`}
        onChange={(e) => handleAgoUnitChange(e.target.value as PastSurgicalAgoUnit)}
      >
        {PAST_SURGICAL_AGO_UNITS.map(({ value, label: unitLabel }) => (
          <option key={value} value={value}>
            {unitLabel}
          </option>
        ))}
      </select>
      <span className="shrink-0 text-[11px] text-muted-foreground">ago</span>
      <input
        type="text"
        value={entry.notes ?? ""}
        disabled={disabled}
        placeholder={PAST_SURGICAL_PROCEDURE_NOTE_PLACEHOLDER}
        aria-label={`${label} note`}
        maxLength={PAST_SURGICAL_PROCEDURE_NOTE_MAX}
        className={cn(COMPACT_INPUT_CLASS, "min-w-0")}
        data-testid={`past-surgical-note-${entry.id}`}
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

export interface PastSurgicalHistoryFieldProps {
  value: PastSurgicalHistoryStructured;
  disabled?: boolean;
  onChange: (next: PastSurgicalHistoryStructured) => void;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

export function PastSurgicalHistoryField({
  value,
  disabled = false,
  onChange,
  sectionOpen,
  onSectionOpenChange,
}: PastSurgicalHistoryFieldProps) {
  const inputId = "rx-history-pastSurgicalHistory";
  const noneSelected = value.none === true;
  const entries = useMemo(() => getPastSurgicalProcedureEntries(value), [value]);
  const catalogOptions = useMemo(
    () => availablePastSurgicalCatalogProcedures(entries),
    [entries],
  );
  const quickAddOptions = useMemo(
    () =>
      PAST_SURGICAL_QUICK_ADD_VALUES.filter((procedure) =>
        catalogOptions.some((option) => option.value === procedure),
      ),
    [catalogOptions],
  );

  const handleCommit = (payload: CommitPayload) => {
    if (payload.kind === "catalog") {
      onChange(addPastSurgicalCatalogProcedure(value, payload.procedure));
      return;
    }
    onChange(addPastSurgicalOtherProcedure(value, payload.text));
  };

  return (
    <CollapsibleContainer
      title="Past surgical history"
      toggleLabel="Toggle Past surgical history"
      preview={
        formatPastSurgicalHistoryPreview(value)
          ? `— ${formatPastSurgicalHistoryPreview(value)}`
          : undefined
      }
      count={pastSurgicalHistoryFilledCount(value)}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      defaultOpen={
        sectionOpen === undefined ? hasPastSurgicalHistoryStructuredContent(value) : undefined
      }
      bodyClassName="space-y-3 px-3 pb-3 pt-0"
      testId="past-surgical-history-field"
      leadingActions={<SectionReorderLeadingAction sectionId="past_surgical" />}
      actions={!disabled ? <SubjectiveSectionTemplateButton scope="past_surgical" /> : undefined}
    >
      <div data-testid="past-surgical-none">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Past surgical screening">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={noneSelected}
            aria-label="None prior"
            onClick={() => onChange(setPastSurgicalHistoryNone(value, !noneSelected))}
            className={cn(
              CHIP_CLASS,
              noneSelected
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            None prior
          </button>
        </div>
      </div>

      {!noneSelected && (
        <>
          <HistorySubsection
            testId="past-surgical-procedures"
            label="Procedures"
            hint="Search, pick a common procedure, or add a custom entry"
          >
            {entries.length > 0 && (
              <div
                className="space-y-2 border-l-2 border-primary/20 pl-2"
                data-testid="past-surgical-procedure-rows"
              >
                {entries.map((entry) => (
                  <ProcedureEntryRow
                    key={entry.id}
                    entry={entry}
                    disabled={disabled}
                    onPatch={(patch) =>
                      onChange(patchPastSurgicalProcedureEntry(value, entry.id, patch))
                    }
                    onRemove={() => onChange(removePastSurgicalProcedureEntry(value, entry.id))}
                  />
                ))}
              </div>
            )}

            {quickAddOptions.length > 0 && (
              <div className="space-y-1.5" data-testid="past-surgical-quick-add">
                <p className="text-xs font-medium text-foreground/80">Common procedures</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common procedures">
                  {quickAddOptions.map((procedure) => (
                    <button
                      key={procedure}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(addPastSurgicalCatalogProcedure(value, procedure))}
                      className={QUICK_CHIP_CLASS}
                    >
                      + {pastSurgicalProcedureLabel(procedure)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ProcedureCombobox
              inputId={`${inputId}-combobox`}
              entries={entries}
              catalogOptions={catalogOptions}
              disabled={disabled}
              onCommit={handleCommit}
            />
          </HistorySubsection>

          <HistorySubsection testId="past-surgical-section-notes" label="Additional notes">
            <textarea
              id={`${inputId}-notes`}
              rows={2}
              value={value.notes ?? ""}
              onChange={(e) => onChange(setPastSurgicalHistoryNotes(value, e.target.value))}
              placeholder={PAST_SURGICAL_SECTION_NOTES_PLACEHOLDER}
              disabled={disabled}
              aria-label="Past surgical history additional notes"
              className={RX_FIELD_INPUT_CLASS}
              maxLength={PAST_SURGICAL_SECTION_NOTES_MAX}
              data-testid="past-surgical-notes"
            />
          </HistorySubsection>
        </>
      )}
    </CollapsibleContainer>
  );
}
