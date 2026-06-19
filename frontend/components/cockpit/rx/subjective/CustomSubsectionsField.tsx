"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { patchDoctorSettings } from "@/lib/api";
import {
  createEmptyCustomSubsection,
  createEmptyCustomSubsectionChild,
  customSubsectionsStructureKey,
  customSubsectionsToDefaultTemplate,
  CUSTOM_SUBSECTIONS_MAX,
} from "@/lib/cockpit/custom-subsections";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";

const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

const DOCTOR_CUSTOM_SECTIONS_AUTOSAVE_MS = 500;

export interface CustomSubsectionsChromeProps {
  disabled?: boolean;
  variant: "empty" | "footer";
}

/** Empty add panel or add-more footer + doctor-default autosave for custom sections. */
export function CustomSubsectionsChrome({ disabled = false, variant }: CustomSubsectionsChromeProps) {
  const { state, dispatch, token } = useRxForm();
  const sections = state.fields.customSubsections;
  const [saveDefaultStatus, setSaveDefaultStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const lastPersistedStructureRef = useRef<string>(
    customSubsectionsStructureKey(state.fields.customSubsections),
  );

  useEffect(() => {
    if (disabled || !token) return;

    const structureKey = customSubsectionsStructureKey(sections);
    if (structureKey === lastPersistedStructureRef.current) return;

    const template = customSubsectionsToDefaultTemplate(sections);
    if (template.length === 0 && sections.length > 0) {
      lastPersistedStructureRef.current = structureKey;
      return;
    }

    setSaveDefaultStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await patchDoctorSettings(token, { subjective_custom_subsections: template });
          lastPersistedStructureRef.current = structureKey;
          setSaveDefaultStatus("saved");
        } catch {
          setSaveDefaultStatus("error");
        }
      })();
    }, DOCTOR_CUSTOM_SECTIONS_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, sections, token]);

  const handleAddSection = useCallback(() => {
    if (disabled) return;
    dispatch({ type: "ADD_CUSTOM_SUBSECTION", section: createEmptyCustomSubsection() });
  }, [disabled, dispatch]);

  if (variant === "empty") {
    if (disabled || sections.length > 0) return null;
    return (
      <div
        className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4"
        data-testid="custom-subsections-empty"
      >
        <p className="text-center text-sm text-muted-foreground">
          Add your own headings and notes — e.g. travel history, occupational exposure.
        </p>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className={ADD_CHIP_CLASS}
            data-testid="custom-subsections-add-first"
            onClick={handleAddSection}
          >
            + Add custom section
          </button>
        </div>
      </div>
    );
  }

  if (disabled || sections.length === 0 || sections.length >= CUSTOM_SUBSECTIONS_MAX) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {saveDefaultStatus === "saved" ? (
        <span className="text-xs text-muted-foreground" role="status">
          Default saved
        </span>
      ) : null}
      {saveDefaultStatus === "error" ? (
        <span className="text-xs text-destructive" role="status">
          Could not save default
        </span>
      ) : null}
      <button
        type="button"
        className={ADD_CHIP_CLASS}
        data-testid="custom-subsections-add-more"
        onClick={handleAddSection}
      >
        + Add custom section
      </button>
    </div>
  );
}

/** @deprecated Custom blocks render from SubjectiveSection; chrome handles add/autosave. */
export function CustomSubsectionsField({ disabled = false }: { disabled?: boolean }) {
  return (
    <>
      <CustomSubsectionsChrome disabled={disabled} variant="empty" />
      <CustomSubsectionsChrome disabled={disabled} variant="footer" />
    </>
  );
}

export { createEmptyCustomSubsectionChild };
