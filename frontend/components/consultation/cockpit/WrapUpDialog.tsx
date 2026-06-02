"use client";

/**
 * @deprecated As of the cockpit Rx-redesign batch this dialog is no longer
 * mounted anywhere in the app. ConsultationCockpit's "Send Rx & finish",
 * "Finish visit", and CockpitHeader "Done with patient" CTAs now POST
 * `/v1/appointments/:id/wrap-up` directly with an empty body — the
 * doctor has already filled diagnosis + follow-up in the prescription
 * pad, so the dialog re-asked for fields the doctor expected to be done
 * with. The cockpit then transitions to the `ended` state where
 * `<NextPatientCountdown>` (pf-11) auto-advances to the next patient
 * subject to the doctor's `patient_flow_advance` setting.
 *
 * The file is kept on disk as a reference for the structured-diagnosis +
 * follow-up surface in case a future "wrap-up notes" pane is reintroduced;
 * delete it once that decision is locked.
 *
 * ----------------------------------------------------------------------
 *
 * WrapUpDialog (pf-04) — original docs
 *
 * Modal surface for closing out an appointment. Opens from:
 *  - CockpitHeader "Done with patient" CTA (pf-05)
 *  - Auto-trigger after Send Rx (pf-05 wires the auto-open)
 *
 * Sections:
 *  1. Header — patient name + telemed DM info line (telemedicine only)
 *  2. Diagnosis — free-text input + toggleable tag chips (autocomplete)
 *  3. Follow-up — one-click chips + optional custom date + kind radio
 *  4. Footer — "Save & next ▸", "Save & stay", "Cancel"
 *
 * Dirty-tracking: closing with unsaved changes shows a discard prompt,
 * UNLESS `triggeredAt === 'auto'` (auto-trigger after Send Rx).
 *
 * On submit: POSTs to /v1/appointments/:id/wrap-up, calls onSaved, then
 * onClose. Errors surface as an inline Alert strip (no auto-close).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatLocalIsoDate, todayLocalIso } from "@/lib/dates";
import { requireApiBaseUrl } from "@/lib/api-base";
import { useRecentDiagnosisTags } from "@/hooks/useRecentDiagnosisTags";
import type { Appointment } from "@/types/appointment";
import type { ConsultationModality } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrapUpDialogProps {
  open: boolean;
  appointmentId: string;
  appointmentSummary?: {
    patientName?: string | null;
    modality: "text" | "voice" | "video" | "in_clinic";
  };
  /** Pre-fill free-text diagnosis from previous partial save. */
  initialDiagnosisText?: string | null;
  /** Pre-fill selected diagnosis tags. */
  initialDiagnosisTags?: string[];
  /** Pre-fill follow-up date (ISO YYYY-MM-DD). */
  initialFollowupDate?: string | null;
  /** Pre-fill follow-up kind. */
  initialFollowupKind?: "none" | "in_person" | "tele" | null;
  /**
   * Controls whether closing a dirty form prompts for discard confirmation.
   * 'auto' = dialog was opened automatically after Send Rx → skip prompt.
   * 'manual' = doctor clicked "Done with patient" → prompt on dirty close.
   */
  triggeredAt?: "auto" | "manual";
  /** Auth token forwarded from the cockpit parent. */
  token: string;
  onClose: () => void;
  onSaved: (updated: Appointment, opts?: { stayOnPage?: boolean }) => void;
}

type FollowupKind = "none" | "in_person" | "tele";

// Chip presets
const FOLLOWUP_CHIPS = [
  { id: "1wk", label: "1 wk", days: 7 },
  { id: "1mo", label: "1 mo", days: 30 },
  { id: "none", label: "No follow-up", days: null },
] as const;

// Max tag chips selectable (matches backend validation)
const MAX_TAGS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTelemed(modality: ConsultationModality | undefined): boolean {
  return modality === "text" || modality === "voice" || modality === "video";
}

/** Returns ISO YYYY-MM-DD string N days from today. */
function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatLocalIsoDate(d);
}

// ---------------------------------------------------------------------------
// Wrap-up API call (pf-02 endpoint)
// ---------------------------------------------------------------------------

interface WrapUpPayload {
  diagnosis_text?: string | null;
  diagnosis_tags: string[];
  followup_date?: string | null;
  followup_kind?: FollowupKind | null;
}

interface WrapUpResponse {
  data?: { appointment: Appointment };
}

async function postWrapUp(
  token: string,
  appointmentId: string,
  payload: WrapUpPayload
): Promise<Appointment> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/appointments/${appointmentId}/wrap-up`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const json = (await res.json().catch(() => ({}))) as WrapUpResponse & {
    error?: { message?: string };
  };

  if (!res.ok) {
    const message =
      json?.error?.message ?? `Wrap-up failed (${res.status})`;
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const appointment = json?.data?.appointment;
  if (!appointment) throw new Error("Unexpected response from server.");
  return appointment;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WrapUpDialog({
  open,
  appointmentId,
  appointmentSummary,
  initialDiagnosisText = null,
  initialDiagnosisTags = [],
  initialFollowupDate = null,
  initialFollowupKind = null,
  triggeredAt = "manual",
  token,
  onClose,
  onSaved,
}: WrapUpDialogProps): JSX.Element {
  // ── Diagnosis state ───────────────────────────────────────────────────────
  const [diagText, setDiagText] = useState(initialDiagnosisText ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialDiagnosisTags ?? []
  );
  const [newTagInput, setNewTagInput] = useState("");

  // ── Follow-up state ───────────────────────────────────────────────────────
  // Which preset chip is active: "1wk" | "1mo" | "none" | "custom" | null
  const [followupPreset, setFollowupPreset] = useState<
    "1wk" | "1mo" | "none" | "custom" | null
  >(null);
  const [customDate, setCustomDate] = useState(initialFollowupDate ?? "");
  const [followupKind, setFollowupKind] = useState<FollowupKind>(
    initialFollowupKind && initialFollowupKind !== "none"
      ? initialFollowupKind
      : "in_person"
  );
  const [showCustomDate, setShowCustomDate] = useState(false);

  // ── Submission state ──────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  const isDirty =
    diagText.trim().length > 0 ||
    selectedTags.length > 0 ||
    followupPreset !== null ||
    customDate.length > 0;

  // ── Tag suggestions ───────────────────────────────────────────────────────
  const { tags: suggestedTags } = useRecentDiagnosisTags(token);

  // Reset form state when the dialog opens fresh
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setDiagText(initialDiagnosisText ?? "");
      setSelectedTags(initialDiagnosisTags ?? []);
      setNewTagInput("");
      setFollowupPreset(null);
      setCustomDate(initialFollowupDate ?? "");
      setFollowupKind(
        initialFollowupKind && initialFollowupKind !== "none"
          ? initialFollowupKind
          : "in_person"
      );
      setShowCustomDate(false);
      setSubmitError(null);
    }
    prevOpen.current = open;
  }, [
    open,
    initialDiagnosisText,
    initialDiagnosisTags,
    initialFollowupDate,
    initialFollowupKind,
  ]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const hasDiagnosis =
    diagText.trim().length > 0 || selectedTags.length > 0;
  const hasFollowup =
    followupPreset !== null || customDate.length > 0;
  const isValid = hasDiagnosis && hasFollowup;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleTag = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        if (prev.includes(tag)) return prev.filter((t) => t !== tag);
        if (prev.length >= MAX_TAGS) return prev;
        return [...prev, tag];
      });
    },
    []
  );

  const addNewTag = useCallback(() => {
    const t = newTagInput.trim();
    if (!t || t.length > 64) return;
    if (!selectedTags.includes(t) && selectedTags.length < MAX_TAGS) {
      setSelectedTags((prev) => [...prev, t]);
    }
    setNewTagInput("");
  }, [newTagInput, selectedTags]);

  const handleNewTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewTag();
    }
  };

  const selectPreset = (preset: "1wk" | "1mo" | "none") => {
    setFollowupPreset(preset);
    setShowCustomDate(false);
    setCustomDate("");
    if (preset !== "none") {
      setFollowupKind("in_person");
    }
  };

  const toggleCustomDate = () => {
    setShowCustomDate((v) => {
      const next = !v;
      if (next) {
        setFollowupPreset("custom");
      } else {
        setFollowupPreset(null);
        setCustomDate("");
      }
      return next;
    });
  };

  const buildPayload = (): WrapUpPayload => {
    let followup_date: string | null = null;
    let followup_kind: FollowupKind | null = null;

    if (followupPreset === "1wk") {
      followup_date = isoDatePlusDays(7);
      followup_kind = followupKind;
    } else if (followupPreset === "1mo") {
      followup_date = isoDatePlusDays(30);
      followup_kind = followupKind;
    } else if (followupPreset === "none") {
      followup_date = null;
      followup_kind = "none";
    } else if (followupPreset === "custom" && customDate) {
      followup_date = customDate;
      followup_kind = followupKind;
    }

    return {
      diagnosis_text: diagText.trim() || null,
      diagnosis_tags: selectedTags,
      followup_date,
      followup_kind,
    };
  };

  const handleSubmit = useCallback(
    async (stayOnPage: boolean) => {
      if (!isValid || submitting) return;
      setSubmitError(null);
      setSubmitting(true);
      try {
        const updated = await postWrapUp(token, appointmentId, buildPayload());
        onSaved(updated, stayOnPage ? { stayOnPage: true } : undefined);
        onClose();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, appointmentId, isValid, submitting, diagText, selectedTags, followupPreset, customDate, followupKind]
  );

  const handleClose = () => {
    if (
      isDirty &&
      triggeredAt !== "auto" &&
      !confirm("Discard wrap-up notes?")
    ) {
      return;
    }
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const patientName =
    appointmentSummary?.patientName ?? "walk-in";
  const modality = appointmentSummary?.modality;
  const showTelemDmLine = isTelemed(modality);

  // All suggested tags + any selected tags not in suggestions
  const allChipTags = Array.from(
    new Set([
      ...suggestedTags.map((s) => s.tag),
      ...selectedTags,
    ])
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleClose();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
          handleClose();
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle>Done with {patientName}</DialogTitle>
          {showTelemDmLine && (
            <p className="text-sm text-muted-foreground">
              We&apos;ll DM the chat history to the patient on close.
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          {/* ── Diagnosis ──────────────────────────────────────────────── */}
          <section aria-labelledby="diag-label">
            <p id="diag-label" className="mb-1.5 text-sm font-medium">
              Diagnosis
            </p>

            <Input
              placeholder="Primary diagnosis (free text)"
              maxLength={2000}
              value={diagText}
              onChange={(e) => setDiagText(e.target.value)}
              disabled={submitting}
            />

            {/* Chip row */}
            {allChipTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allChipTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      disabled={
                        submitting ||
                        (!active && selectedTags.length >= MAX_TAGS)
                      }
                      onClick={() => toggleTag(tag)}
                      className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-md"
                      aria-pressed={active}
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer select-none",
                          !active &&
                            selectedTags.length >= MAX_TAGS &&
                            "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {tag}
                        {active && (
                          <X
                            className="ml-1 h-2.5 w-2.5"
                            aria-hidden
                          />
                        )}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add new tag inline */}
            <div className="mt-2 flex items-center gap-2">
              <Input
                placeholder="+ tag"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleNewTagKeyDown}
                onBlur={addNewTag}
                disabled={submitting || selectedTags.length >= MAX_TAGS}
                className="h-7 w-36 text-xs"
                maxLength={64}
                aria-label="Add diagnosis tag"
              />
              {selectedTags.length >= MAX_TAGS && (
                <span className="text-xs text-muted-foreground">
                  Max {MAX_TAGS} tags
                </span>
              )}
            </div>
          </section>

          {/* ── Follow-up ──────────────────────────────────────────────── */}
          <section aria-labelledby="followup-label">
            <p id="followup-label" className="mb-1.5 text-sm font-medium">
              Follow-up
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2">
              {FOLLOWUP_CHIPS.map((chip) => {
                const isActive = followupPreset === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      selectPreset(chip.id as "1wk" | "1mo" | "none")
                    }
                    className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-md"
                    aria-pressed={isActive}
                  >
                    <Badge
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer select-none"
                    >
                      {chip.label}
                    </Badge>
                  </button>
                );
              })}

              {/* Custom date toggle */}
              <button
                type="button"
                disabled={submitting}
                onClick={toggleCustomDate}
                className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-md"
                aria-pressed={showCustomDate}
              >
                <Badge
                  variant={showCustomDate ? "default" : "outline"}
                  className="cursor-pointer select-none"
                >
                  Custom date
                </Badge>
              </button>
            </div>

            {/* Custom date + kind radio */}
            {showCustomDate && (
              <div className="mt-3 flex flex-col gap-2.5">
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  disabled={submitting}
                  min={todayLocalIso()}
                  aria-label="Custom follow-up date"
                />

                <div
                  className="flex items-center gap-4"
                  role="radiogroup"
                  aria-label="Follow-up kind"
                >
                  {(
                    [
                      { value: "in_person", label: "In-person" },
                      { value: "tele", label: "Tele" },
                    ] as { value: FollowupKind; label: string }[]
                  ).map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-1.5 text-sm"
                    >
                      <input
                        type="radio"
                        name="followup-kind"
                        value={value}
                        checked={followupKind === value}
                        onChange={() => setFollowupKind(value)}
                        disabled={submitting}
                        className="h-4 w-4 accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Kind radio for preset chips (1wk / 1mo) */}
            {(followupPreset === "1wk" || followupPreset === "1mo") && (
              <div
                className="mt-2 flex items-center gap-4"
                role="radiogroup"
                aria-label="Follow-up kind"
              >
                {(
                  [
                    { value: "in_person", label: "In-person" },
                    { value: "tele", label: "Tele" },
                  ] as { value: FollowupKind; label: string }[]
                ).map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="followup-kind-preset"
                      value={value}
                      checked={followupKind === value}
                      onChange={() => setFollowupKind(value)}
                      disabled={submitting}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* ── Error strip ────────────────────────────────────────────── */}
          {submitError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* Cancel */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={handleClose}
          >
            Cancel
          </Button>

          {/* Save & stay */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={isValid ? undefined : 0}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isValid || submitting}
                    onClick={() => void handleSubmit(true)}
                    aria-disabled={!isValid}
                  >
                    {submitting ? "Saving…" : "Save & stay"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isValid && (
                <TooltipContent>
                  Add a diagnosis or pick a follow-up to save.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* Save & next (primary, autoFocus when dirty) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={isValid ? undefined : 0}>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={!isValid || submitting}
                    onClick={() => void handleSubmit(false)}
                    autoFocus={isDirty}
                    aria-disabled={!isValid}
                  >
                    {submitting ? "Saving…" : "Save & next ▸"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isValid && (
                <TooltipContent>
                  Add a diagnosis or pick a follow-up to save.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
