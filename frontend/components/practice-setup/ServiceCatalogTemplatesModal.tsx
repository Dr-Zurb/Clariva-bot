"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  catalogToServiceDrafts,
  draftsToCatalogOrNull,
  type ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import { confirmReplaceServiceCatalogIfNeeded } from "@/lib/confirm-replace-service-catalog";
import { safeParseServiceCatalogV1 } from "@/lib/service-catalog-schema";
import { STARTER_SERVICE_TEMPLATES } from "@/lib/service-catalog-starter-templates";
import type { ServiceStarterTemplate } from "@/lib/service-catalog-starter-templates";
import {
  MAX_USER_SAVED_SERVICE_TEMPLATES,
  type ServiceCatalogTemplatesJsonV1,
  type UserSavedServiceTemplateV1,
} from "@/types/doctor-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  /** From Practice Info; starters match `specialtyLabel` exactly. */
  practiceSpecialty: string;
  currentServices: ServiceOfferingDraft[];
  currentServicesCount: number;
  onApplyCatalog: (drafts: ServiceOfferingDraft[]) => void;
  templates: UserSavedServiceTemplateV1[];
  onTemplatesChange: (next: ServiceCatalogTemplatesJsonV1) => Promise<void>;
  busy?: boolean;
};

export function ServiceCatalogTemplatesModal({
  open,
  onClose,
  practiceSpecialty,
  currentServices,
  currentServicesCount,
  onApplyCatalog,
  templates,
  onTemplatesChange,
  busy = false,
}: Props) {
  const titleId = useId();
  const nameId = useId();
  const tagId = useId();
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const specialtyTrimmed = practiceSpecialty.trim();
  const startersForSpecialty = useMemo(
    () =>
      specialtyTrimmed
        ? STARTER_SERVICE_TEMPLATES.filter((t) => t.specialtyLabel === specialtyTrimmed)
        : [],
    [specialtyTrimmed]
  );

  useEffect(() => {
    if (!open) {
      setNewName("");
      setNewTag("");
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !savingNew) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy, savingNew]);

  const handleApplyStarter = (template: ServiceStarterTemplate) => {
    if (!confirmReplaceServiceCatalogIfNeeded(currentServicesCount)) return;
    onApplyCatalog(catalogToServiceDrafts(template.catalog));
    onClose();
  };

  const handleApplyUser = (t: UserSavedServiceTemplateV1) => {
    if (!confirmReplaceServiceCatalogIfNeeded(currentServicesCount)) return;
    onApplyCatalog(catalogToServiceDrafts(t.catalog));
    onClose();
  };

  const handleSaveCurrent = async () => {
    setLocalError(null);
    const name = newName.trim();
    if (!name) {
      setLocalError("Template name is required.");
      return;
    }
    if (templates.length >= MAX_USER_SAVED_SERVICE_TEMPLATES) {
      setLocalError(
        `You can save at most ${MAX_USER_SAVED_SERVICE_TEMPLATES} templates. Delete one to add another.`
      );
      return;
    }
    let catalog: ReturnType<typeof draftsToCatalogOrNull>;
    try {
      catalog = draftsToCatalogOrNull(currentServices);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Invalid catalog rows.");
      return;
    }
    if (catalog === null) {
      setLocalError("Add at least one valid service row before saving as a template.");
      return;
    }
    const parsed = safeParseServiceCatalogV1(catalog);
    if (!parsed.ok) {
      setLocalError(parsed.message);
      return;
    }
    const tag = newTag.trim();
    const entry: UserSavedServiceTemplateV1 = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tpl-${Date.now()}`,
      name,
      specialty_tag: tag || null,
      updated_at: new Date().toISOString(),
      catalog: parsed.data,
    };
    setSavingNew(true);
    try {
      await onTemplatesChange({ templates: [...templates, entry] });
      setNewName("");
      setNewTag("");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setSavingNew(false);
    }
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
        if (e.target === e.currentTarget && !busy && !savingNew) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] flex max-h-[min(40rem,92vh)] w-full max-w-lg flex-col rounded-lg border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            Template library
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Clariva starter packs match your <strong>Practice Info</strong> specialty. Prices are placeholders — review
            before saving. Saved templates are stored on your account (max {MAX_USER_SAVED_SERVICE_TEMPLATES}).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Clariva suggestions {specialtyTrimmed ? `(${specialtyTrimmed})` : ""}
          </h3>
          {!specialtyTrimmed ? (
            <p className="mt-2 rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
              Set your specialty under{" "}
              <span className="font-medium">Settings → Practice setup → Practice Info</span> to see starter catalogs
              for your field.
            </p>
          ) : startersForSpecialty.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              We don&apos;t have a Clariva starter pack that matches this specialty yet. You can still use{" "}
              <strong>My saved templates</strong> below, or adjust Practice Info if the specialty spelling doesn&apos;t
              match our list.
            </p>
          ) : (
            <ul className="mt-2 space-y-2" role="list">
              {startersForSpecialty.map((t) => (
                <li key={t.id} className="rounded-md border border-gray-100 bg-white px-3 py-2 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">{t.specialtyLabel}</p>
                  <p className="mt-0.5 font-medium text-gray-900">{t.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t.catalog.services.length} service{t.catalog.services.length === 1 ? "" : "s"} · text, voice,
                    &amp; video on each row
                  </p>
                  <button
                    type="button"
                    onClick={() => handleApplyStarter(t)}
                    className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Use this template
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Save current catalog</h3>
          <div className="mt-2 rounded-md border border-gray-100 bg-gray-50/80 p-3">
            <label htmlFor={nameId} className="block text-xs font-medium text-gray-700">
              Template name <span className="text-red-600">*</span>
            </label>
            <input
              id={nameId}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              disabled={busy || savingNew}
              placeholder="e.g. Summer 2026 fees"
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <label htmlFor={tagId} className="mt-2 block text-xs font-medium text-gray-700">
              Tag (optional)
            </label>
            <input
              id={tagId}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              maxLength={200}
              disabled={busy || savingNew}
              placeholder="e.g. Pediatrics — for your own sorting"
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => void handleSaveCurrent()}
              disabled={busy || savingNew}
              className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {savingNew ? "Saving…" : "Save as template"}
            </button>
          </div>

          {localError && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {localError}
            </p>
          )}

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">My saved templates</h3>
          {sortedUser.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No saved templates yet.</p>
          ) : (
            <ul className="mt-2 space-y-2" role="list">
              {sortedUser.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-gray-100 bg-white px-3 py-2 shadow-sm"
                >
                  <p className="font-medium text-gray-900">{t.name}</p>
                  {t.specialty_tag ? (
                    <p className="text-xs text-gray-500">Tag: {t.specialty_tag}</p>
                  ) : null}
                  <p className="text-xs text-gray-400">
                    {t.catalog.services.length} service{t.catalog.services.length === 1 ? "" : "s"} · Updated{" "}
                    {new Date(t.updated_at).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy || savingNew}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
