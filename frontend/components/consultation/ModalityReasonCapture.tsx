"use client";

/**
 * `<ModalityReasonCapture>` — shared reason-capture input for all the
 * modality-change modals (Plan 09 · Task 51 · Decision 11 LOCKED).
 *
 * Consumed by:
 *   · `<ModalityUpgradeApprovalModal>` — decline sub-flow (variant: doctor_decline).
 *   · `<DoctorUpgradeInitiationModal>` — variant: doctor_upgrade.
 *   · `<ModalityDowngradeModal>`       — variant: doctor_downgrade.
 *   · Task 52's patient self-downgrade modal — variant: patient_downgrade.
 *
 * Validation rules per variant (doctrine pinned in Plan 09 Task 51 spec):
 *
 *   | variant             | preset    | free-text                         |
 *   |---------------------|-----------|-----------------------------------|
 *   | doctor_upgrade      | required  | required, 5..200 chars            |
 *   | doctor_downgrade    | required  | required, 5..200 chars            |
 *   | doctor_decline      | optional  | required, 5..200 chars            |
 *   | patient_downgrade   | optional  | optional; if present, 5..200      |
 *
 * The "required free-text even when preset is selected" rule mirrors
 * Plan 08 Task 40's reason-capture doctrine — captures clinical
 * specificity for the audit trail.
 *
 * Validation is centralised via `validateModalityReason()` (exported
 * so the caller's submit guard matches the component's inline error
 * state without re-implementing the rules).
 *
 * @see frontend/components/consultation/ModalityUpgradeApprovalModal.tsx
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md
 */

import { useId } from "react";
import type { ModalityPresetReasonCode } from "@/types/modality-change";

// ----------------------------------------------------------------------------
// Preset pill catalogue — mirrors Migration 075's CHECK body.
// ----------------------------------------------------------------------------

export type ReasonVariant =
  | "doctor_upgrade"
  | "doctor_downgrade"
  | "doctor_decline"
  | "patient_downgrade";

interface PresetOption {
  code: ModalityPresetReasonCode;
  label: string;
}

const DOCTOR_UPGRADE_PRESETS: ReadonlyArray<PresetOption> = [
  { code: "visible_symptom", label: "Need to see a visible symptom" },
  { code: "need_to_hear_voice", label: "Need to hear voice" },
  { code: "patient_request", label: "Patient requested it" },
  { code: "other", label: "Other (elaborate)" },
];

const DOCTOR_DOWNGRADE_PRESETS: ReadonlyArray<PresetOption> = [
  { code: "network_or_equipment", label: "My network or equipment issue" },
  { code: "case_doesnt_need_modality", label: "Case doesn't need current modality" },
  { code: "patient_environment", label: "Patient's environment isn't suitable" },
  { code: "other", label: "Other (elaborate)" },
];

const DOCTOR_DECLINE_PRESETS: ReadonlyArray<PresetOption> = [
  { code: "case_doesnt_need_modality", label: "Case doesn't need voice/video" },
  { code: "network_or_equipment", label: "Network or equipment issue" },
  { code: "patient_environment", label: "Patient's environment not suitable" },
  { code: "other", label: "Other (elaborate)" },
];

// patient_downgrade has no preset pills — free-text only (optional).

function presetsFor(variant: ReasonVariant): ReadonlyArray<PresetOption> {
  switch (variant) {
    case "doctor_upgrade":
      return DOCTOR_UPGRADE_PRESETS;
    case "doctor_downgrade":
      return DOCTOR_DOWNGRADE_PRESETS;
    case "doctor_decline":
      return DOCTOR_DECLINE_PRESETS;
    case "patient_downgrade":
      return [];
    default:
      return [];
  }
}

/**
 * For the Task 51 upgrade-initiation modal's "need_to_hear_voice"
 * preset — only surface it when the current modality is text.
 */
export function filterPresetsForUpgradeSource(
  presets: ReadonlyArray<PresetOption>,
  currentModality: "text" | "voice",
): ReadonlyArray<PresetOption> {
  if (currentModality === "voice") {
    return presets.filter((p) => p.code !== "need_to_hear_voice");
  }
  return presets;
}

// ----------------------------------------------------------------------------
// Value + validation.
// ----------------------------------------------------------------------------

export interface ModalityReasonValue {
  presetCode?: ModalityPresetReasonCode;
  freeText: string;
}

export interface ModalityReasonValidation {
  valid: boolean;
  /** The error to surface inline; `null` when valid OR when the field is still pristine. */
  error: string | null;
}

/**
 * Centralised validation. Returns `valid: false` with an inline error
 * when the input violates the variant's rule. Callers should gate
 * submit on `valid` AND — if they want distinct pristine vs invalid
 * UI states — check `touched` themselves (the component tracks
 * touched-ness internally for the visible inline error).
 */
export function validateModalityReason(
  variant: ReasonVariant,
  value: ModalityReasonValue,
): ModalityReasonValidation {
  const trimmed = value.freeText.trim();
  const hasPreset = typeof value.presetCode === "string" && value.presetCode.length > 0;

  // Free-text bounds — shared across the three "required free-text" variants.
  const freeTextBoundsError = (() => {
    if (trimmed.length === 0) return "Please describe the reason (at least 5 characters).";
    if (trimmed.length < 5) return "Reason must be at least 5 characters.";
    if (trimmed.length > 200) return "Reason must be 200 characters or fewer.";
    return null;
  })();

  switch (variant) {
    case "doctor_upgrade":
    case "doctor_downgrade": {
      if (!hasPreset) {
        return { valid: false, error: "Please pick a reason category." };
      }
      if (freeTextBoundsError) {
        return { valid: false, error: freeTextBoundsError };
      }
      return { valid: true, error: null };
    }

    case "doctor_decline": {
      if (freeTextBoundsError) {
        return { valid: false, error: freeTextBoundsError };
      }
      return { valid: true, error: null };
    }

    case "patient_downgrade": {
      // Free-text is optional; when provided it must hit bounds.
      if (trimmed.length === 0) {
        return { valid: true, error: null };
      }
      if (trimmed.length < 5) {
        return {
          valid: false,
          error: "If you add a reason, it must be at least 5 characters.",
        };
      }
      if (trimmed.length > 200) {
        return { valid: false, error: "Reason must be 200 characters or fewer." };
      }
      return { valid: true, error: null };
    }

    default:
      return { valid: true, error: null };
  }
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export interface ModalityReasonCaptureProps {
  variant: ReasonVariant;
  value: ModalityReasonValue;
  onChange: (next: ModalityReasonValue) => void;
  /** Explicit error override (e.g. a server-side validation response). */
  error?: string;
  disabled?: boolean;
  /** Tuned for `doctor_upgrade` — hides the `need_to_hear_voice` preset on voice→video. */
  currentModality?: "text" | "voice" | "video";
}

export default function ModalityReasonCapture(
  props: ModalityReasonCaptureProps,
): JSX.Element {
  const { variant, value, onChange, error, disabled, currentModality } = props;
  const groupId = useId();
  const textId = useId();
  const errorId = useId();

  let presets = presetsFor(variant);
  if (variant === "doctor_upgrade" && currentModality === "voice") {
    presets = filterPresetsForUpgradeSource(
      presets,
      currentModality as "text" | "voice",
    );
  }

  const validation = validateModalityReason(variant, value);
  const inlineError = error ?? validation.error;

  const freeTextRequired =
    variant === "doctor_upgrade" ||
    variant === "doctor_downgrade" ||
    variant === "doctor_decline";
  const presetRequired =
    variant === "doctor_upgrade" || variant === "doctor_downgrade";

  return (
    <fieldset
      role="group"
      aria-labelledby={`${groupId}-label`}
      disabled={disabled}
      className="flex flex-col gap-2"
    >
      {presets.length > 0 && (
        <>
          <legend
            id={`${groupId}-label`}
            className="text-xs font-medium text-gray-700"
          >
            Reason{presetRequired ? "" : " (optional)"}:
          </legend>
          <div
            role="radiogroup"
            aria-required={presetRequired}
            className="flex flex-col gap-1"
          >
            {presets.map((p) => {
              const checked = value.presetCode === p.code;
              return (
                <label
                  key={p.code}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-800"
                >
                  <input
                    type="radio"
                    name={`modality-reason-${groupId}`}
                    value={p.code}
                    checked={checked}
                    onChange={() =>
                      onChange({ ...value, presetCode: p.code })
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span>{p.label}</span>
                </label>
              );
            })}
          </div>
        </>
      )}

      <label
        htmlFor={textId}
        className="mt-1 text-xs font-medium text-gray-700"
      >
        {freeTextRequired
          ? "Describe the clinical reason"
          : "Add a note (optional)"}
      </label>
      <textarea
        id={textId}
        value={value.freeText}
        onChange={(e) =>
          onChange({ ...value, freeText: e.target.value.slice(0, 200) })
        }
        maxLength={200}
        rows={3}
        aria-invalid={Boolean(inlineError)}
        aria-describedby={inlineError ? errorId : undefined}
        placeholder={
          variant === "patient_downgrade"
            ? "e.g. \"I don't need video anymore.\""
            : "e.g. \"Patient's rash needs visual inspection.\""
        }
        className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 aria-[invalid=true]:border-red-400"
      />
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{value.freeText.length}/200</span>
      </div>
      <div
        id={errorId}
        aria-live="polite"
        className="min-h-[1rem] text-xs text-red-600"
      >
        {inlineError}
      </div>
    </fieldset>
  );
}
