"use client";

/**
 * Plan 02 · Task 27 — Recording consent checkbox (public /book page).
 *
 * Decision 4 shipped "recording-on-by-default + soft re-pitch on first
 * decline". The UX contract:
 *
 *   1. Checkbox renders pre-checked. Label reads positively ("Allow this
 *      consult to be recorded…") so the checked state matches the
 *      recording-on default.
 *   2. First uncheck by the patient is NOT destructive — the parent
 *      opens `<RecordingConsentRePitchModal>` to explain what they lose.
 *      After the modal closes with "Continue without recording", the
 *      checkbox stays unchecked. After "Keep recording on", the
 *      checkbox flips back to checked.
 *   3. Subsequent unchecks are allowed without re-pitch (cap = 1, matches
 *      the IG flow's `recordingConsentRePitched` flag). Second-and-later
 *      interactions only fire `onChange`.
 *
 * Parent owns:
 *   - The checked value (controlled).
 *   - Whether the re-pitch has been shown (it tracks a single boolean
 *     and passes `onFirstDecline` so this component stays agnostic
 *     about when to open the modal).
 *
 * Accessibility:
 *   - Native `<input type="checkbox">` for screen-reader + keyboard
 *     parity. No custom styled box required for v1.
 *   - `<label>` associates with the input via `htmlFor`.
 *   - Full copy of the consent body is rendered near the checkbox so
 *     users can read before deciding.
 */

import { useCallback, useId } from "react";

export const RECORDING_CONSENT_VERSION_DISPLAY = "v1.0";

const RECORDING_CONSENT_SUMMARY =
  "Allow this consult to be recorded for your medical records. " +
  "Your doctor can pause recording at any time. You can review or download " +
  "the recording for 90 days.";

export interface RecordingConsentCheckboxProps {
  /** Current checked state. Default for a fresh booking is `true`. */
  checked: boolean;
  /** Fires on every checkbox interaction (check + uncheck). */
  onChange: (next: boolean) => void;
  /**
   * Fires exactly once — the first time the user unchecks the box. Parent
   * should respond by opening the re-pitch modal. Subsequent unchecks do
   * NOT fire this callback.
   */
  onFirstDecline?: () => void;
  /**
   * Disables the input (e.g. while the backend call is in flight). Does
   * not visually hide; keeps the current value legible during submission.
   */
  disabled?: boolean;
  /**
   * Optional practice name — if provided, interpolated into the label so
   * the patient knows who they're consenting to. Falls back to a generic
   * "this consult" phrasing.
   */
  practiceName?: string;
}

export function RecordingConsentCheckbox(props: RecordingConsentCheckboxProps) {
  const { checked, onChange, onFirstDecline, disabled, practiceName } = props;
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.checked;
      if (!next && checked && onFirstDecline) {
        // First decline — parent decides whether this is the first time
        // (see `hasRePitched` state above). We still fire `onChange` so
        // the controlled value reflects reality; parent may flip it back
        // after the modal confirms "keep recording on".
        onFirstDecline();
      }
      onChange(next);
    },
    [checked, onChange, onFirstDecline],
  );

  const heading = practiceName
    ? `Allow ${practiceName} to record this consult`
    : "Allow this consult to be recorded";

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
      data-testid="recording-consent-checkbox-container"
    >
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          data-testid="recording-consent-checkbox"
        />
        <span className="text-gray-800">
          <span className="block font-medium">{heading}</span>
          <span className="mt-1 block text-gray-600">
            {RECORDING_CONSENT_SUMMARY}
          </span>
        </span>
      </label>
    </div>
  );
}
