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
import {
  archiveRxTemplate,
  listRxTemplates,
  recordRxTemplateUse,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import type { DoctorRxTemplate, RxTemplateScope } from "@/types/rx-template";
import {
  formatTemplateSummary,
  SCOPE_PICKER_LABELS,
  sortCustomBlockTemplatesForSection,
  templateHasScopedContent,
  templateMatchesSearch,
} from "@/lib/cockpit/template-picker-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TemplatePickerVariant = "full" | "subjective";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Auth token (Supabase session). */
  token: string;
  /** Controls labels and list filtering emphasis. Default `full`. */
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
}: TemplatePickerProps) {
  const isSubjective = variant === "subjective";
  const scopeLabels = SCOPE_PICKER_LABELS[scope];
  const [templates, setTemplates] = useState<DoctorRxTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRxTemplates(token, scope)
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.data.templates);
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
  }, [open, token, scope]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

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
    const base = isSubjective
      ? templates.filter((t) => templateHasScopedContent(t, scope))
      : templates;
    const ordered =
      scope === "custom_block"
        ? sortCustomBlockTemplatesForSection(base, priorityCustomSectionId)
        : base;
    const q = search.trim();
    if (!q) return ordered;
    return ordered.filter((t) => {
      if (isSubjective) return templateMatchesSearch(t, scope, q);
      const lower = q.toLowerCase();
      if (t.name.toLowerCase().includes(lower)) return true;
      if (t.description?.toLowerCase().includes(lower)) return true;
      for (const m of t.medicines_json ?? []) {
        if (m.medicineName?.toLowerCase().includes(lower)) return true;
      }
      return false;
    });
  }, [search, templates, isSubjective, scope, priorityCustomSectionId]);

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

  if (!open || !portalReady || typeof document === "undefined") return null;

  const headerTitle = isSubjective ? scopeLabels.title : "Rx templates";
  const searchPlaceholder = isSubjective
    ? "Search templates by name…"
    : "Search templates by name or medicine…";

  const body = (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LayoutTemplate
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <h2
              id="rx-template-picker-title"
              className="truncate text-sm font-semibold text-foreground"
            >
              {headerTitle}
            </h2>
          </div>
          {isSubjective && scopeLabels.hint ? (
            <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{scopeLabels.hint}</p>
          ) : null}
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close templates picker"
          className="h-8 w-8 shrink-0 text-muted-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="border-b border-border px-3 py-2.5">
        <label htmlFor="rx-template-search" className="sr-only">
          Search templates
        </label>
        <Input
          id="rx-template-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-3 py-4 text-xs text-muted-foreground">Loading templates…</p>
        )}
        {error && (
          <p className="px-3 py-4 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {templates.length === 0 ? (
              isSubjective ? (
                <p>Use the save icon in the section header to create a template.</p>
              ) : (
                <>
                  <p>No templates yet.</p>
                  {onSaveCurrentAsTemplate && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3"
                      onClick={() => onSaveCurrentAsTemplate(scope)}
                    >
                      Save current Rx as template
                    </Button>
                  )}
                </>
              )
            ) : isSubjective &&
              templates.filter((t) => templateHasScopedContent(t, scope)).length === 0 ? (
              <p>No templates with content yet — use the save icon in the section header.</p>
            ) : (
              <p>No templates match &quot;{search}&quot;.</p>
            )}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <ul className="divide-y divide-border">
            {filtered.map((t) => {
              const busy = busyTemplateId === t.id;
              const medCount = t.medicines_json?.length ?? 0;
              const contentSummary = isSubjective
                ? formatTemplateSummary(t, scope)
                : `${medCount} medicine${medCount === 1 ? "" : "s"}`;
              const lastUsed = t.last_used_at
                ? ` · last used ${formatRelative(t.last_used_at)}`
                : "";

              return (
                <li key={t.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                      {t.description ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contentSummary}
                        {lastUsed}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApply(t)}
                        disabled={busy}
                        aria-busy={busy}
                        className="h-8"
                      >
                        {busy ? "Applying…" : "Apply"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleArchive(t)}
                        disabled={busy}
                        aria-label={`Archive template ${t.name}`}
                        title="Archive"
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!isSubjective && onSaveCurrentAsTemplate && templates.length > 0 && !loading && (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onSaveCurrentAsTemplate(scope)}
          >
            Save current Rx as template
          </Button>
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
