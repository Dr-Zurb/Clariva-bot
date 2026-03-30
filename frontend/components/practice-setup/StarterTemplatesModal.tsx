"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { catalogToServiceDrafts } from "@/lib/service-catalog-drafts";
import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import { confirmReplaceServiceCatalogIfNeeded } from "@/lib/confirm-replace-service-catalog";
import { STARTER_SERVICE_TEMPLATES } from "@/lib/service-catalog-starter-templates";
import type { ServiceStarterTemplate } from "@/lib/service-catalog-starter-templates";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current rows in editor — if &gt; 0, applying requires replace confirmation. */
  currentServicesCount: number;
  onApply: (next: ServiceOfferingDraft[]) => void;
};

export function StarterTemplatesModal({ open, onClose, currentServicesCount, onApply }: Props) {
  const titleId = useId();
  const filterRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setFilter("");
      return;
    }
    const t = window.setTimeout(() => filterRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [...STARTER_SERVICE_TEMPLATES];
    return STARTER_SERVICE_TEMPLATES.filter(
      (t) =>
        t.specialtyLabel.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [filter]);

  const handleApply = (template: ServiceStarterTemplate) => {
    if (!confirmReplaceServiceCatalogIfNeeded(currentServicesCount)) return;
    const drafts = catalogToServiceDrafts(template.catalog);
    onApply(drafts);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] flex max-h-[min(32rem,90vh)] w-full max-w-lg flex-col rounded-lg border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            Starter templates
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            India-focused examples by specialty. Prices are placeholders — review and edit before saving.
          </p>
          <label htmlFor="starter-filter" className="mt-3 block text-xs font-medium text-gray-700">
            Filter by specialty or keyword
          </label>
          <input
            ref={filterRef}
            id="starter-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="e.g. Pediatrics, dermatology…"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2" role="list">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-gray-500">No templates match your filter.</li>
          ) : (
            filtered.map((t) => (
              <li key={t.id} className="border-b border-gray-50 last:border-0">
                <div className="rounded-md px-2 py-3 hover:bg-gray-50">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">{t.specialtyLabel}</p>
                  <p className="mt-0.5 font-medium text-gray-900">{t.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t.catalog.services.length} service{t.catalog.services.length === 1 ? "" : "s"} · text, voice,
                    &amp; video on each row
                  </p>
                  <button
                    type="button"
                    onClick={() => handleApply(t)}
                    className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Use this template
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
