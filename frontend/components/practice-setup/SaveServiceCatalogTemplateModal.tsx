"use client";

import { useEffect, useId, useState } from "react";
import { draftsToCatalogOrNull, type ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import { safeParseServiceCatalogV1 } from "@/lib/service-catalog-schema";
import {
  MAX_USER_SAVED_SERVICE_TEMPLATES,
  type ServiceCatalogTemplatesJsonV1,
  type UserSavedServiceTemplateV1,
} from "@/types/doctor-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  currentServices: ServiceOfferingDraft[];
  templates: UserSavedServiceTemplateV1[];
  onTemplatesChange: (next: ServiceCatalogTemplatesJsonV1) => Promise<void>;
  busy?: boolean;
};

export function SaveServiceCatalogTemplateModal({
  open,
  onClose,
  currentServices,
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

  const handleSaveCurrent = async () => {
    setLocalError(null);
    const name = newName.trim();
    if (!name) {
      setLocalError("Template name is required.");
      return;
    }
    if (templates.length >= MAX_USER_SAVED_SERVICE_TEMPLATES) {
      setLocalError(
        `You can save at most ${MAX_USER_SAVED_SERVICE_TEMPLATES} templates. Delete one in My templates to add another.`
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
            Save template
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Stores a named copy of the catalog as it appears on this page (max {MAX_USER_SAVED_SERVICE_TEMPLATES}{" "}
            on your account). Use <strong>Save</strong> on the main page to publish your live catalog.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="rounded-md border border-gray-100 bg-gray-50/80 p-3">
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
              {savingNew ? "Saving…" : "Save template"}
            </button>
          </div>

          {localError ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {localError}
            </p>
          ) : null}
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
