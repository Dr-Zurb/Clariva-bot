"use client";

/**
 * <TemplatePicker> — EHR Sub-batch B1 / T2.12.
 *
 * Modal surface for browsing, applying, and managing the doctor's
 * personal Rx templates. Mounts as a side-panel on `lg+` and a
 * bottom-sheet on smaller screens (Tailwind `lg:` breakpoint switch
 * via classes — no separate <Drawer> dependency). The two layouts
 * share the same content body.
 *
 * Behaviour:
 *   - Lists active templates, sorted server-side by
 *     `last_used_at DESC NULLS LAST, name ASC`.
 *   - Search box does case-insensitive client-side filtering across
 *     template name, description, and medicine names inside
 *     `medicines_json` (per spec acceptance criterion).
 *   - "Apply" calls `recordRxTemplateUse` (atomic counter bump) THEN
 *     hands the template to `onApply` for parent-side merge into the
 *     form state.
 *   - "Archive" soft-deletes (DELETE /:id). Confirm prompt because
 *     it's destructive even though it's recoverable server-side.
 *   - Empty state has a friendly CTA pointing the doctor at the
 *     "Save current Rx as template" affordance in the form header.
 *
 * Vanilla React intentionally — no new modal/drawer library introduced
 * for one surface. Same constraint as <DrugAutocomplete>.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveRxTemplate,
  listRxTemplates,
  recordRxTemplateUse,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import type { DoctorRxTemplate } from "@/types/rx-template";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Auth token (Supabase session). */
  token: string;
  /**
   * Fired when the doctor picks a template AND the use-counter bump
   * succeeded. Parent is responsible for merging the template into the
   * form state. The picker closes itself after onApply resolves.
   */
  onApply: (template: DoctorRxTemplate) => void | Promise<void>;
  /**
   * Optional CTA — when supplied, the empty state surfaces a
   * "Save current Rx as template" button that calls this. Hidden in
   * read-only mounts where the doctor can't author.
   */
  onSaveCurrentAsTemplate?: () => void;
}

export default function TemplatePicker({
  open,
  onClose,
  token,
  onApply,
  onSaveCurrentAsTemplate,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<DoctorRxTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Re-fetch every time the picker is opened. Cheap (single doctor's
  // ~tens of templates) and guarantees the list reflects any recent
  // create / archive that happened in another tab.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRxTemplates(token)
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
  }, [open, token]);

  // Move focus to the close button when the picker opens — gives
  // keyboard users an obvious exit + lets ESC close the surface
  // without having to first click into it.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  // ESC closes (basic accessibility — no focus trap in v1; the surface
  // is not a true modal since the form behind it stays interactive).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.description && t.description.toLowerCase().includes(q)) return true;
      // Acceptance: search filters by medicine names within
      // `medicines_json` too.
      for (const m of t.medicines_json ?? []) {
        if (m.medicineName?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [search, templates]);

  const handleApply = useCallback(
    async (template: DoctorRxTemplate) => {
      setBusyTemplateId(template.id);
      setError(null);
      try {
        // Bump the counter server-side BEFORE handing control to the
        // parent merge — keeps the most-used sort accurate even if the
        // form merge throws downstream.
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
        // Optimistic client-side prune; the server has already removed
        // the row from the active list.
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to archive template");
      } finally {
        setBusyTemplateId(null);
      }
    },
    [token],
  );

  if (!open) return null;

  // ---- shared body ---------------------------------------------------------

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-3">
        <h2 className="text-base font-semibold text-gray-900">Rx templates</h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close templates picker"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span aria-hidden>×</span>
        </button>
      </div>

      <div className="border-b border-gray-200 p-3">
        <label htmlFor="rx-template-search" className="sr-only">
          Search templates
        </label>
        <input
          id="rx-template-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates by name or medicine…"
          className="h-10 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="p-4 text-sm text-gray-500">Loading templates…</p>
        )}
        {error && (
          <p className="p-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            {templates.length === 0 ? (
              <>
                <p>No templates yet.</p>
                {onSaveCurrentAsTemplate && (
                  <button
                    type="button"
                    onClick={onSaveCurrentAsTemplate}
                    className="mt-2 inline-block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  >
                    Save current Rx as template
                  </button>
                )}
              </>
            ) : (
              <p>No templates match &quot;{search}&quot;.</p>
            )}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const busy = busyTemplateId === t.id;
              const medCount = t.medicines_json?.length ?? 0;
              return (
                <li key={t.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {t.name}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {t.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {medCount} medicine{medCount === 1 ? "" : "s"}
                        {t.last_used_at
                          ? ` · last used ${formatRelative(t.last_used_at)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleApply(t)}
                        disabled={busy}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                      >
                        {busy ? "…" : "Apply"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(t)}
                        disabled={busy}
                        aria-label={`Archive template ${t.name}`}
                        title="Archive"
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onSaveCurrentAsTemplate && templates.length > 0 && !loading && (
        <div className="border-t border-gray-200 p-3">
          <button
            type="button"
            onClick={onSaveCurrentAsTemplate}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            + Save current Rx as template
          </button>
        </div>
      )}
    </div>
  );

  // ---- layout: side-panel on lg+, bottom-sheet on smaller screens ---------
  // Backdrop is shared; the panel itself uses different classes via lg:
  // breakpoint so we render only one DOM tree.

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close templates picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-template-picker-title"
        className={[
          // Common
          "absolute right-0 bg-white shadow-xl flex flex-col",
          // Mobile: bottom sheet, 80vh tall, full width
          "left-0 bottom-0 h-[80vh] rounded-t-2xl",
          // Desktop (lg+): right side panel, full height, fixed width
          "lg:left-auto lg:bottom-auto lg:top-0 lg:h-full lg:w-96 lg:rounded-none",
        ].join(" ")}
      >
        {body}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tiny "x ago" formatter — keeps the picker free of date-fns / dayjs.
 * Falls back to a date-only string for anything older than ~30 days.
 */
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
