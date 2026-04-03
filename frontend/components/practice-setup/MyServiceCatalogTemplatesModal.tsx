"use client";

import { useEffect, useId, useState } from "react";
import {
  catalogMissingCatchAllOffering,
  catalogToServiceDrafts,
  catchAllServiceDraft,
  type ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import { confirmReplaceServiceCatalogIfNeeded } from "@/lib/confirm-replace-service-catalog";
import {
  listTemplateRowDetails,
  summarizeUserSavedTemplate,
} from "@/lib/service-catalog-template-summary";
import {
  MAX_USER_SAVED_SERVICE_TEMPLATES,
  type ServiceCatalogTemplatesJsonV1,
  type UserSavedServiceTemplateV1,
} from "@/types/doctor-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  currentServicesCount: number;
  onApplyCatalog: (drafts: ServiceOfferingDraft[]) => void;
  templates: UserSavedServiceTemplateV1[];
  onTemplatesChange: (next: ServiceCatalogTemplatesJsonV1) => Promise<void>;
  busy?: boolean;
};

export function MyServiceCatalogTemplatesModal({
  open,
  onClose,
  currentServicesCount,
  onApplyCatalog,
  templates,
  onTemplatesChange,
  busy = false,
}: Props) {
  const titleId = useId();
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setExpandedTemplateIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  const toggleTemplateExpanded = (id: string) => {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyUser = (t: UserSavedServiceTemplateV1) => {
    if (!confirmReplaceServiceCatalogIfNeeded(currentServicesCount)) return;
    let drafts: ServiceOfferingDraft[] = catalogToServiceDrafts(t.catalog);
    if (catalogMissingCatchAllOffering(drafts)) {
      drafts = [catchAllServiceDraft(), ...drafts];
    }
    onApplyCatalog(drafts);
    onClose();
  };

  const handleRename = async (t: UserSavedServiceTemplateV1) => {
    const next = window.prompt("New template name", t.name);
    if (next === null) return;
    const name = next.trim();
    if (!name) {
      window.alert("Name cannot be empty.");
      return;
    }
    try {
      await onTemplatesChange({
        templates: templates.map((x) =>
          x.id === t.id ? { ...x, name, updated_at: new Date().toISOString() } : x
        ),
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Rename failed.");
    }
  };

  const handleDelete = async (t: UserSavedServiceTemplateV1) => {
    if (!window.confirm(`Delete template “${t.name}”? This cannot be undone.`)) return;
    try {
      await onTemplatesChange({
        templates: templates.filter((x) => x.id !== t.id),
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const sortedUser = [...templates].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] flex max-h-[min(40rem,92vh)] w-full max-w-xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            My templates
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Apply a snapshot into the editor, then use <strong>Save</strong> on the page to publish. You can store up
            to {MAX_USER_SAVED_SERVICE_TEMPLATES} templates.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sortedUser.length === 0 ? (
            <p className="text-sm text-gray-500">No saved templates yet. Use Save template on the page to create one.</p>
          ) : (
            <ul className="space-y-3" role="list">
              {sortedUser.map((t) => {
                const summary = summarizeUserSavedTemplate(t);
                const expanded = expandedTemplateIds.has(t.id);
                const allRows = listTemplateRowDetails(t);
                const linesToShow = expanded ? allRows : summary.previewLines;

                return (
                  <li
                    key={t.id}
                    className="rounded-md border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <p className="font-medium text-gray-900">{t.name}</p>
                    {t.specialty_tag ? (
                      <p className="mt-0.5 text-xs text-gray-500">Tag: {t.specialty_tag}</p>
                    ) : null}
                    <p className="mt-1 text-xs font-medium text-gray-700">{summary.headline}</p>
                    <p className="text-[11px] text-gray-400">
                      Updated {new Date(t.updated_at).toLocaleString()}
                    </p>

                    <ul className="mt-2 space-y-1 border-l-2 border-blue-100 pl-2.5" aria-label="Services in template">
                      {linesToShow.map((row, i) => (
                        <li key={`${t.id}-row-${i}`} className="text-xs text-gray-700">
                          <span className="font-medium text-gray-800">{row.label}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="font-mono text-[11px] text-gray-600" title={row.channels}>
                            {row.channels}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {summary.restCount > 0 && !expanded ? (
                      <button
                        type="button"
                        onClick={() => toggleTemplateExpanded(t.id)}
                        className="mt-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Show all {allRows.length} rows
                      </button>
                    ) : null}
                    {summary.restCount > 0 && expanded ? (
                      <button
                        type="button"
                        onClick={() => toggleTemplateExpanded(t.id)}
                        className="mt-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                      >
                        Show less
                      </button>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyUser(t)}
                        disabled={busy}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRename(t)}
                        disabled={busy}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(t)}
                        disabled={busy}
                        className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
