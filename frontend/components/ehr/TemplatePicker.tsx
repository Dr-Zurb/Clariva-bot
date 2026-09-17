"use client";

/**
 * <TemplatePicker> — EHR Sub-batch B1 / T2.12 (+ subj-18 UI polish).
 *
 * Side-panel on `lg+`, bottom-sheet on smaller screens. Browse, apply, and
 * archive the doctor's personal Rx templates. Save lives on section header icons
 * for subjective scopes; full-Rx picker retains an optional footer save CTA.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, LayoutTemplate, X } from "lucide-react";
import { formatMedicineComboHint } from "@/lib/cockpit/medicine-combos";
import type { DoctorMedicineCombo } from "@/lib/api/doctor-medicine-combos";
import {
  archiveRxTemplate,
  listRxTemplates,
  recordRxTemplateUse,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import type {
  DoctorRxTemplate,
  RxTemplateMedicine,
  RxTemplateScope,
} from "@/types/rx-template";
import type {
  DoctorMedicinePackLine,
  DoctorMedicinePackSuggestion,
} from "@/lib/api/doctor-medicine-pack-suggestions";
import {
  formatTemplateSummary,
  SCOPE_PICKER_LABELS,
  sortCustomBlockTemplatesForSection,
  sortObjectiveCustomBlockTemplatesForSection,
  templateHasScopedContent,
  templateMatchesSearch,
} from "@/lib/cockpit/template-picker-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TemplatePickerVariant = "full" | "subjective" | "objective";

const SECTION_CARD = "rounded-md border border-border bg-card px-2.5 py-2";
const SECTION_ICON_BTN =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";
const SECTION_TEXT_ACTION =
  "rounded px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50";
const SECTION_SAVE_ACTION =
  "rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50";
const MEDICINE_PACK_PREVIEW_LINES = 3;

function formatPackLineLabel(line: DoctorMedicinePackLine): string {
  return formatMedicineComboHint({
    ...line,
    useCount: 0,
    lastUsedAt: "",
  } as DoctorMedicineCombo);
}

function formatTemplateMedicineLine(medicine: RxTemplateMedicine): string {
  return formatMedicineComboHint({
    medicineName: medicine.medicineName,
    nameKey: medicine.medicineName,
    dosage: medicine.dosage ?? "",
    doseQty: medicine.doseQty ?? null,
    doseUnit: medicine.doseUnit ?? null,
    frequencyCode: medicine.frequencyCode ?? null,
    frequency: medicine.frequency ?? "",
    durationValue: medicine.durationValue ?? null,
    durationUnit: medicine.durationUnit ?? null,
    duration: medicine.duration ?? "",
    foodTiming: medicine.foodTiming ?? null,
    routeCode: medicine.routeCode ?? null,
    route: medicine.route ?? "",
    form: medicine.form ?? null,
    drugMasterId: medicine.drugMasterId ?? null,
    useCount: 0,
    lastUsedAt: "",
  } as DoctorMedicineCombo);
}

function MedicineLinesPreview({
  lines,
  extraTestId,
  expanded,
  onToggle,
}: {
  lines: readonly { key: string; label: string }[];
  extraTestId?: string;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element | null {
  if (lines.length === 0) return null;
  const extraCount = lines.length - MEDICINE_PACK_PREVIEW_LINES;
  const visible =
    extraCount > 0 && !expanded
      ? lines.slice(0, MEDICINE_PACK_PREVIEW_LINES)
      : lines;
  return (
    <>
      <ul className="mt-1.5 space-y-1">
        {visible.map((line) => (
          <li
            key={line.key}
            className="border-l-2 border-dashed border-muted-foreground/40 pl-2 text-[11px] text-muted-foreground"
          >
            {line.label}
          </li>
        ))}
      </ul>
      {extraCount > 0 ? (
        <button
          type="button"
          className={cn(SECTION_TEXT_ACTION, "mt-1")}
          data-testid={extraTestId}
          onClick={onToggle}
        >
          {expanded ? "Show less" : `+${extraCount} more`}
        </button>
      ) : null}
    </>
  );
}

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Auth token (Supabase session). */
  token: string;
  /**
   * Controls labels and list filtering emphasis. Default `full`. The
   * `objective` variant (obj-16) lists objective-scoped templates; its
   * apply/save row logic lands in obj-17 — for now it renders like `full`.
   */
  variant?: TemplatePickerVariant;
  /**
   * Template scope filter — only templates of this scope are listed.
   * Default `subjective_full` preserves existing full-subjective behaviour.
   */
  scope?: RxTemplateScope;
  /**
   * Fired when the doctor picks a template AND the use-counter bump
   * succeeded. Parent is responsible for merging the template into the
   * form state. The picker closes itself after onApply resolves.
   */
  onApply: (template: DoctorRxTemplate) => void | Promise<void>;
  /**
   * Optional CTA — when supplied on the full-Rx variant, surfaces a footer
   * "Save current Rx as template" button.
   */
  onSaveCurrentAsTemplate?: (scope: RxTemplateScope) => void;
  /**
   * subj-40: when listing `custom_block` templates, surface templates stamped with
   * this section id first (advisory ordering only).
   */
  priorityCustomSectionId?: string;
  /** Recurring exact packs for the medicines picker. Not Enter-commitable. */
  packSuggestions?: readonly DoctorMedicinePackSuggestion[];
  onSavePackSuggestion?: (
    pack: DoctorMedicinePackSuggestion
  ) => void | DoctorRxTemplate | Promise<void | DoctorRxTemplate>;
  onDismissPackSuggestion?: (pack: DoctorMedicinePackSuggestion) => void | Promise<void>;
  onPackSuggestionsOpened?: () => void;
}

export default function TemplatePicker({
  open,
  onClose,
  token,
  variant = "full",
  scope = "subjective_full",
  onApply,
  onSaveCurrentAsTemplate,
  priorityCustomSectionId,
  packSuggestions = [],
  onSavePackSuggestion,
  onDismissPackSuggestion,
  onPackSuggestionsOpened,
}: TemplatePickerProps) {
  const isSubjective = variant === "subjective";
  const isObjective = variant === "objective";
  const isScopedVariant = isSubjective || isObjective;
  const scopeLabels = SCOPE_PICKER_LABELS[scope];
  const [templates, setTemplates] = useState<DoctorRxTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [expandedPackKeys, setExpandedPackKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(
    () => new Set()
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadTemplates = useCallback(async (): Promise<DoctorRxTemplate[]> => {
    if (scope === "test_results") {
      const [reports, poc] = await Promise.all([
        listRxTemplates(token, "test_results"),
        listRxTemplates(token, "point_of_care"),
      ]);
      return [...reports.data.templates, ...poc.data.templates];
    }
    const res = await listRxTemplates(token, scope);
    return res.data.templates;
  }, [scope, token]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // rpt-01: Reports picker remaps legacy `point_of_care` templates on read (no migration).
    loadTemplates()
      .then((next) => {
        if (cancelled) return;
        setTemplates(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadTemplates]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
    else {
      setExpandedPackKeys(new Set());
      setExpandedTemplateIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (open) onPackSuggestionsOpened?.();
  }, [open, onPackSuggestionsOpened]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const base = isScopedVariant
      ? templates.filter((t) => templateHasScopedContent(t, scope))
      : templates;
    const ordered =
      scope === "custom_block"
        ? sortCustomBlockTemplatesForSection(base, priorityCustomSectionId)
        : scope === "objective_custom_block"
          ? sortObjectiveCustomBlockTemplatesForSection(base, priorityCustomSectionId)
          : base;
    const q = search.trim();
    if (!q) return ordered;
    return ordered.filter((t) => {
      if (isScopedVariant) return templateMatchesSearch(t, scope, q);
      const lower = q.toLowerCase();
      if (t.name.toLowerCase().includes(lower)) return true;
      if (t.description?.toLowerCase().includes(lower)) return true;
      for (const m of t.medicines_json ?? []) {
        if (m.medicineName?.toLowerCase().includes(lower)) return true;
      }
      return false;
    });
  }, [search, templates, isScopedVariant, scope, priorityCustomSectionId]);

  const visiblePackSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packSuggestions;
    return packSuggestions.filter((pack) =>
      pack.medicines.some((m) => m.medicineName.toLowerCase().includes(q)),
    );
  }, [packSuggestions, search]);

  const handleApply = useCallback(
    async (template: DoctorRxTemplate) => {
      setBusyTemplateId(template.id);
      setError(null);
      try {
        const bumped = await recordRxTemplateUse(token, template.id);
        await onApply(bumped.data.template);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply template");
      } finally {
        setBusyTemplateId(null);
      }
    },
    [onApply, onClose, token],
  );

  const handleArchive = useCallback(
    async (template: DoctorRxTemplate) => {
      const ok = window.confirm(
        `Archive template "${template.name}"? You can ask support to restore it later.`,
      );
      if (!ok) return;
      setBusyTemplateId(template.id);
      setError(null);
      try {
        await archiveRxTemplate(token, template.id);
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to archive template");
      } finally {
        setBusyTemplateId(null);
      }
    },
    [token],
  );

  const handleSavePack = useCallback(
    async (pack: DoctorMedicinePackSuggestion) => {
      if (!onSavePackSuggestion) return;
      setError(null);
      try {
        const created = await onSavePackSuggestion(pack);
        if (created) {
          setTemplates((prev) => [
            created,
            ...prev.filter((row) => row.id !== created.id),
          ]);
          return;
        }
        setTemplates(await loadTemplates());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save template");
      }
    },
    [loadTemplates, onSavePackSuggestion],
  );

  if (!open || !portalReady || typeof document === "undefined") return null;

  const headerTitle = isScopedVariant ? scopeLabels.title : "Rx templates";
  const searchPlaceholder = isScopedVariant
    ? "Search templates by name…"
    : "Search templates by name or medicine…";

  const body = (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2
            id="rx-template-picker-title"
            className="flex items-center gap-2 border-l-2 border-l-primary/35 pl-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <LayoutTemplate className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{headerTitle}</span>
          </h2>
          {isScopedVariant && scopeLabels.hint ? (
            <p className="mt-0.5 pl-[1.125rem] text-[11px] text-muted-foreground">
              {scopeLabels.hint}
            </p>
          ) : null}
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close templates picker"
          className={SECTION_ICON_BTN}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <div className="border-b border-border px-3 py-2">
        <label htmlFor="rx-template-search" className="sr-only">
          Search templates
        </label>
        <Input
          id="rx-template-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 text-[13px]"
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-3 py-3">
        {loading && (
          <p className="text-[11px] text-muted-foreground">Loading templates…</p>
        )}
        {error && (
          <p className="text-[11px] text-destructive" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && visiblePackSuggestions.length > 0 ? (
          <section data-testid="medicine-pack-suggestions" className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Suggested
            </p>
            <ul className="space-y-2">
              {visiblePackSuggestions.map((pack, index) => {
                const packKey = `${pack.lastUsedAt}-${index}`;
                const expanded = expandedPackKeys.has(packKey);
                return (
                <li
                  key={packKey}
                  className={SECTION_CARD}
                  data-testid="medicine-pack-suggestion"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[11px] text-muted-foreground">
                      Used {pack.useCount} time{pack.useCount === 1 ? "" : "s"}
                      {pack.medicines.length > MEDICINE_PACK_PREVIEW_LINES
                        ? ` · ${pack.medicines.length} medicines`
                        : ""}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {onSavePackSuggestion ? (
                        <button
                          type="button"
                          className={SECTION_SAVE_ACTION}
                          data-testid="medicine-pack-suggestion-save"
                          onClick={() => void handleSavePack(pack)}
                        >
                          Save
                        </button>
                      ) : null}
                      {onDismissPackSuggestion ? (
                        <button
                          type="button"
                          className={SECTION_TEXT_ACTION}
                          aria-label="Dismiss this suggestion"
                          data-testid="medicine-pack-suggestion-dismiss"
                          onClick={() => void onDismissPackSuggestion(pack)}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <MedicineLinesPreview
                    extraTestId="medicine-pack-suggestion-more"
                    expanded={expanded}
                    onToggle={() => {
                      setExpandedPackKeys((prev) => {
                        const next = new Set(prev);
                        if (expanded) next.delete(packKey);
                        else next.add(packKey);
                        return next;
                      });
                    }}
                    lines={pack.medicines.map((medicine, medIdx) => ({
                      key: `${medicine.nameKey}-${medIdx}`,
                      label: formatPackLineLabel(medicine),
                    }))}
                  />
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!loading && !error && filtered.length === 0 && visiblePackSuggestions.length === 0 && (
          <div className={`${SECTION_CARD} text-[11px] text-muted-foreground`}>
            {templates.length === 0 ? (
              isScopedVariant ? (
                <p>Use the save icon in the section header to create a template.</p>
              ) : (
                <>
                  <p>No templates yet.</p>
                  {onSaveCurrentAsTemplate && (
                    <button
                      type="button"
                      className={cn(SECTION_TEXT_ACTION, "mt-2")}
                      onClick={() => onSaveCurrentAsTemplate(scope)}
                    >
                      Save current Rx as template
                    </button>
                  )}
                </>
              )
            ) : isScopedVariant &&
              templates.filter((t) => templateHasScopedContent(t, scope)).length === 0 ? (
              <p>No templates with content yet — use the save icon in the section header.</p>
            ) : (
              <p>No templates match &quot;{search}&quot;.</p>
            )}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <section className="space-y-2">
            {visiblePackSuggestions.length > 0 ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Saved
              </p>
            ) : null}
            <ul className="space-y-2">
              {filtered.map((t) => {
                const busy = busyTemplateId === t.id;
                const namedMeds = (t.medicines_json ?? []).filter(
                  (m) => m.medicineName.trim().length > 0
                );
                const showMedicineLines = scope === "medicines";
                const medCount = namedMeds.length;
                const contentSummary = isScopedVariant
                  ? formatTemplateSummary(t, scope)
                  : `${medCount} medicine${medCount === 1 ? "" : "s"}`;
                const lastUsed = t.last_used_at
                  ? `last used ${formatRelative(t.last_used_at)}`
                  : "";
                const expanded = expandedTemplateIds.has(t.id);

                return (
                  <li
                    key={t.id}
                    className={SECTION_CARD}
                    data-testid={showMedicineLines ? "medicines-saved-template" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t.name}
                        </p>
                        {t.description ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {t.description}
                          </p>
                        ) : null}
                        {showMedicineLines ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {medCount > MEDICINE_PACK_PREVIEW_LINES
                              ? `${medCount} medicines`
                              : null}
                            {medCount > MEDICINE_PACK_PREVIEW_LINES && lastUsed
                              ? " · "
                              : null}
                            {lastUsed}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {contentSummary}
                            {lastUsed ? ` · ${lastUsed}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => void handleApply(t)}
                          disabled={busy}
                          aria-busy={busy}
                          className={SECTION_TEXT_ACTION}
                        >
                          {busy ? "Applying…" : "Apply"}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleArchive(t)}
                          disabled={busy}
                          aria-label={`Archive template ${t.name}`}
                          title="Archive"
                          className={SECTION_ICON_BTN}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    {showMedicineLines ? (
                      <MedicineLinesPreview
                        extraTestId="medicines-saved-template-more"
                        expanded={expanded}
                        onToggle={() => {
                          setExpandedTemplateIds((prev) => {
                            const next = new Set(prev);
                            if (expanded) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          });
                        }}
                        lines={namedMeds.map((medicine, medIdx) => ({
                          key: `${t.id}-${medicine.medicineName}-${medIdx}`,
                          label: formatTemplateMedicineLine(medicine),
                        }))}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {!isScopedVariant && onSaveCurrentAsTemplate && templates.length > 0 && !loading && (
        <div className="border-t border-border bg-muted/20 p-3">
          <button
            type="button"
            className={cn(SECTION_TEXT_ACTION, "text-[11px]")}
            onClick={() => onSaveCurrentAsTemplate(scope)}
          >
            Save current Rx as template
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-testid="rx-template-picker">
      <button
        type="button"
        aria-label="Close templates picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-template-picker-title"
        className={cn(
          "absolute right-0 flex flex-col border-border bg-background shadow-xl",
          "left-0 bottom-0 h-[80vh] rounded-t-2xl border-t",
          "lg:left-auto lg:bottom-auto lg:top-0 lg:h-full lg:w-96 lg:rounded-none lg:border-l lg:border-t-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>,
    document.body,
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}
