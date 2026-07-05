"use client";

import { useMemo, useRef, useState } from "react";
import { Activity, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  PUPIL_CLUSTER_MENU_KEY,
  pupilClusterHasData,
} from "@/lib/cockpit/pupil-cluster";
import {
  BP_CLUSTER_MENU_KEY,
  bpClusterHasData,
  isBpClusterHidden,
  isBpClusterVisibilityKey,
} from "@/lib/cockpit/bp-cluster";
import { glucoseClusterHasData } from "@/lib/cockpit/glucose-readings";
import {
  VITALS_MENU_CATALOG,
  VITAL_MENU_GROUP_LABELS,
  VITAL_MENU_GROUP_ORDER,
  type VitalsMenuCatalogEntry,
} from "@/lib/cockpit/vitals-menu-catalog";
import {
  createCustomVitalDef,
  patchCustomVitalDef,
  CUSTOM_VITAL_GROUPS,
  CUSTOM_VITAL_LABEL_MAX,
  CUSTOM_VITAL_UNIT_MAX,
  isCustomVitalId,
  type CustomVitalDef,
  type CustomVitalGroup,
  type CustomVitalKind,
} from "@/lib/cockpit/vitals-custom";
import {
  isVitalHidden,
  type VitalVisibilityKey,
} from "@/lib/cockpit/vitals-visibility";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary";

interface CustomVitalDraft {
  label: string;
  kind: CustomVitalKind;
  unit: string;
  group: CustomVitalGroup;
}

const EMPTY_CUSTOM_VITAL_DRAFT: CustomVitalDraft = {
  label: "",
  kind: "numeric",
  unit: "",
  group: "core",
};

function customVitalDraftFromDef(def: CustomVitalDef): CustomVitalDraft {
  return {
    label: def.label,
    kind: def.kind,
    unit: def.unit ?? "",
    group: def.group,
  };
}

function CustomVitalDefForm({
  draft,
  onDraftChange,
  onCancel,
  onSave,
  saveLabel,
  disabled,
  testIdPrefix,
}: {
  draft: CustomVitalDraft;
  onDraftChange: (next: CustomVitalDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  disabled?: boolean;
  testIdPrefix: "add" | "edit";
}): JSX.Element {
  const trimmedLabel = draft.label.trim();

  return (
    <div className="space-y-2" data-testid={`vitals-manager-${testIdPrefix}-custom-form`}>
      <input
        type="text"
        value={draft.label}
        onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
        maxLength={CUSTOM_VITAL_LABEL_MAX}
        placeholder="Custom vital name (e.g. Abdominal girth)"
        aria-label="Custom vital name"
        data-testid={`vitals-manager-${testIdPrefix}-custom-label`}
        className={FIELD_CLASS}
      />
      <div className="flex gap-2">
        <select
          value={draft.kind}
          onChange={(event) =>
            onDraftChange({ ...draft, kind: event.target.value as CustomVitalKind })
          }
          aria-label="Custom vital type"
          data-testid={`vitals-manager-${testIdPrefix}-custom-kind`}
          className={cn(FIELD_CLASS, "flex-1")}
        >
          <option value="numeric">Number</option>
          <option value="text">Text</option>
        </select>
        {draft.kind === "numeric" ? (
          <input
            type="text"
            value={draft.unit}
            onChange={(event) => onDraftChange({ ...draft, unit: event.target.value })}
            maxLength={CUSTOM_VITAL_UNIT_MAX}
            placeholder="Unit (optional)"
            aria-label="Custom vital unit"
            data-testid={`vitals-manager-${testIdPrefix}-custom-unit`}
            className={cn(FIELD_CLASS, "flex-1")}
          />
        ) : null}
        <select
          value={draft.group}
          onChange={(event) =>
            onDraftChange({ ...draft, group: event.target.value as CustomVitalGroup })
          }
          aria-label="Custom vital group"
          data-testid={`vitals-manager-${testIdPrefix}-custom-group`}
          className={cn(FIELD_CLASS, "flex-1")}
        >
          {CUSTOM_VITAL_GROUPS.map((group) => (
            <option key={group} value={group}>
              {VITAL_MENU_GROUP_LABELS[group]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          data-testid={`vitals-manager-${testIdPrefix}-custom-cancel`}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          data-testid={`vitals-manager-${testIdPrefix}-custom-save`}
          disabled={disabled || !trimmedLabel}
          onClick={onSave}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** Boolean-only hint for the menu — never surfaces field content (P10-D5). */
export function resolveVitalHasDataHint(
  key: VitalVisibilityKey,
  fields: RxFormFields,
): boolean {
  if (key === PUPIL_CLUSTER_MENU_KEY) {
    return pupilClusterHasData(fields);
  }
  if (key === BP_CLUSTER_MENU_KEY || isBpClusterVisibilityKey(key)) {
    return bpClusterHasData(fields);
  }
  if (key === "vitalsGlucoseMgDl") {
    return glucoseClusterHasData(fields);
  }
  if (isCustomVitalId(key)) {
    const value = fields.vitalsCustomValues[key];
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }
  const value = fields[key as keyof RxFormFields];
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export interface ManageVitalsMenuProps {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Effective hidden set the grid renders against. */
  effectiveHiddenIds: readonly string[];
  fields: RxFormFields;
  /** Persist show/hide for the doctor default grid. */
  onToggleHidden: (key: VitalVisibilityKey) => void;
  /**
   * vit-14: full menu catalog (registry rows + the doctor's custom vitals).
   * Defaults to the registry-only catalog for callers that don't manage custom
   * vitals.
   */
  catalog?: VitalsMenuCatalogEntry[];
  /** vit-14: append a doctor-authored custom vital to the default grid. */
  onAddCustomVital?: (def: CustomVitalDef) => void;
  /** vit-14: update an existing custom-vital definition (stable id). */
  onEditCustomVital?: (def: CustomVitalDef) => void;
  /** vit-14: remove a custom-vital definition (stored values are retained). */
  onRemoveCustomVital?: (id: string) => void;
}

export function ManageVitalsMenu({
  disabled = false,
  open,
  onOpenChange,
  effectiveHiddenIds,
  fields,
  onToggleHidden,
  catalog = VITALS_MENU_CATALOG,
  onAddCustomVital,
  onEditCustomVital,
  onRemoveCustomVital,
}: ManageVitalsMenuProps) {
  const onToggleHiddenRef = useRef(onToggleHidden);
  onToggleHiddenRef.current = onToggleHidden;

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomVitalDraft>(EMPTY_CUSTOM_VITAL_DRAFT);

  const canManageCustom = Boolean(onAddCustomVital || onEditCustomVital);
  const trimmedDraftLabel = draft.label.trim();

  const resetDraft = () => {
    setDraft(EMPTY_CUSTOM_VITAL_DRAFT);
    setAddOpen(false);
    setEditingId(null);
  };

  const openAddForm = () => {
    setEditingId(null);
    setDraft(EMPTY_CUSTOM_VITAL_DRAFT);
    setAddOpen(true);
  };

  const startEdit = (def: CustomVitalDef) => {
    setAddOpen(false);
    setEditingId(def.id);
    setDraft(customVitalDraftFromDef(def));
  };

  const handleAddCustom = () => {
    if (!onAddCustomVital || !trimmedDraftLabel) return;
    onAddCustomVital(
      createCustomVitalDef(
        trimmedDraftLabel,
        draft.kind,
        draft.group,
        draft.kind === "numeric" ? draft.unit : null,
      ),
    );
    resetDraft();
  };

  const handleEditCustom = () => {
    if (!onEditCustomVital || !editingId || !trimmedDraftLabel) return;
    const existing = fields.vitalsCustomDefs.find((def) => def.id === editingId);
    if (!existing) {
      resetDraft();
      return;
    }
    onEditCustomVital(
      patchCustomVitalDef(existing, {
        label: trimmedDraftLabel,
        kind: draft.kind,
        group: draft.group,
        unit: draft.kind === "numeric" ? draft.unit : null,
      }),
    );
    resetDraft();
  };

  const groupedVitals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? catalog.filter((v) => v.label.toLowerCase().includes(needle))
      : catalog;

    const byGroup = new Map<string, VitalsMenuCatalogEntry[]>();
    for (const group of VITAL_MENU_GROUP_ORDER) {
      byGroup.set(group, []);
    }
    for (const vital of matches) {
      byGroup.get(vital.group)?.push(vital);
    }
    return VITAL_MENU_GROUP_ORDER
      .map((group) => ({ group, vitals: byGroup.get(group) ?? [] }))
      .filter((section) => section.vitals.length > 0);
  }, [catalog, query]);

  const hiddenCount = useMemo(
    () =>
      catalog.filter((v) =>
        v.key === BP_CLUSTER_MENU_KEY
          ? isBpClusterHidden(effectiveHiddenIds)
          : isVitalHidden(v.key, effectiveHiddenIds),
      ).length,
    [catalog, effectiveHiddenIds],
  );

  const triggerLabel =
    hiddenCount > 0 ? `Manage vitals · ${hiddenCount} hidden` : "Manage vitals";

  const vitalCountLabel = `${catalog.length} vital${catalog.length === 1 ? "" : "s"}`;
  const headerSubtitle =
    hiddenCount > 0
      ? `${vitalCountLabel} · ${hiddenCount} hidden`
      : `${vitalCountLabel} · show or hide for your default grid`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={triggerLabel}
          data-testid="vitals-manager-trigger"
        >
          <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{triggerLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[30rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Manage vitals</p>
          <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
        </div>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search vitals…"
              aria-label="Search vitals"
              data-testid="vitals-manager-search"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {groupedVitals.length === 0 ? (
            <p
              className="px-2 py-6 text-center text-sm text-muted-foreground"
              data-testid="vitals-manager-empty"
            >
              No vitals match “{query.trim()}”.
            </p>
          ) : (
            groupedVitals.map(({ group, vitals }) => (
              <div key={group} className="mb-2 last:mb-0">
                <p
                  className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid={`vitals-manager-group-${group}`}
                >
                  {VITAL_MENU_GROUP_LABELS[group]}
                </p>
                <ul role="list">
                  {vitals.map((vital) => {
                    const effectivelyHidden =
                      vital.key === BP_CLUSTER_MENU_KEY
                        ? isBpClusterHidden(effectiveHiddenIds)
                        : isVitalHidden(vital.key, effectiveHiddenIds);
                    const hasData = resolveVitalHasDataHint(vital.key, fields);

                    return (
                      <li
                        key={vital.key}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/50",
                          effectivelyHidden && "opacity-80",
                        )}
                        data-testid={`vitals-manager-row-${vital.key}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug break-words",
                              effectivelyHidden && "text-muted-foreground",
                            )}
                          >
                            {vital.label}
                          </p>
                          {effectivelyHidden || hasData ? (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {effectivelyHidden ? (
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Hidden
                                </span>
                              ) : null}
                              {hasData ? (
                                <span className="text-xs text-muted-foreground">Has data</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                            effectivelyHidden && "bg-muted/40",
                          )}
                          aria-label={
                            effectivelyHidden ? `Show ${vital.label}` : `Hide ${vital.label}`
                          }
                          aria-pressed={effectivelyHidden}
                          disabled={disabled}
                          data-testid={`vitals-manager-toggle-${vital.key}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleHiddenRef.current(vital.key);
                          }}
                        >
                          {effectivelyHidden ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                          ) : (
                            <Eye className="h-4 w-4 text-foreground/70" aria-hidden />
                          )}
                        </button>

                        {vital.isCustom && onEditCustomVital ? (
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            aria-label={`Edit ${vital.label}`}
                            disabled={disabled || editingId === vital.key}
                            data-testid={`vitals-manager-edit-${vital.key}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              const def = fields.vitalsCustomDefs.find((d) => d.id === vital.key);
                              if (def) startEdit(def);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}

                        {vital.isCustom && onRemoveCustomVital ? (
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            aria-label={`Remove ${vital.label}`}
                            disabled={disabled}
                            data-testid={`vitals-manager-remove-${vital.key}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveCustomVital(vital.key);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {canManageCustom ? (
          <div className="border-t border-border p-2">
            {editingId ? (
              <CustomVitalDefForm
                draft={draft}
                onDraftChange={setDraft}
                onCancel={resetDraft}
                onSave={handleEditCustom}
                saveLabel="Save changes"
                disabled={disabled}
                testIdPrefix="edit"
              />
            ) : addOpen ? (
              <CustomVitalDefForm
                draft={draft}
                onDraftChange={setDraft}
                onCancel={resetDraft}
                onSave={handleAddCustom}
                saveLabel="Add vital"
                disabled={disabled || !onAddCustomVital}
                testIdPrefix="add"
              />
            ) : onAddCustomVital ? (
              <button
                type="button"
                className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                data-testid="vitals-manager-add-custom-trigger"
                disabled={disabled}
                onClick={openAddForm}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>Add custom vital</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
