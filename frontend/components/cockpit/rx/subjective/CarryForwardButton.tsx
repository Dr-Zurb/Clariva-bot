"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { complaintsFromPrescription } from "@/components/cockpit/rx/RxFormContext";
import {
  buildSubjectiveCarryForwardActions,
  COPY_ALL_SUBJECTIVE_SELECTION,
  mapLastSubjectiveApiToSource,
  resolveSocialHistoryForCarryForward,
  subjectiveCarryForwardHasFamilyHistory,
  subjectiveCarryForwardHasPastSurgicalHistory,
  type SubjectiveCarryForwardSelection,
} from "@/lib/cockpit/carry-forward-subjective";
import {
  getLastSubjectiveForPatient,
  type LastSubjectiveForPatient,
} from "@/lib/api/last-subjective";
import { formatDate } from "@/lib/format-date";
import { Button } from "@/components/ui/button";

export interface CarryForwardButtonProps {
  disabled?: boolean;
}

const DEFAULT_SELECTION: SubjectiveCarryForwardSelection = {
  complaints: true,
  familyHistory: true,
  socialHistory: true,
  pastSurgicalHistory: true,
};

export function CarryForwardButton({ disabled = false }: CarryForwardButtonProps) {
  const { appointmentId, patientId, token, dispatch } = useRxForm();
  const [source, setSource] = useState<LastSubjectiveForPatient | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [selection, setSelection] = useState<SubjectiveCarryForwardSelection>(DEFAULT_SELECTION);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!patientId || !appointmentId || !token) {
      setSource(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getLastSubjectiveForPatient(token, patientId, appointmentId);
      setSource(res.data.subjective);
    } catch {
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, patientId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPickMode(false);
        setSelection(DEFAULT_SELECTION);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!patientId || loading || !source) {
    return null;
  }

  const visitDate = formatDate(source.sourceCreatedAt);
  const mappedSource = mapLastSubjectiveApiToSource({
    complaints: complaintsFromPrescription({ complaints: source.complaints }),
    familyHistory: source.familyHistory,
    familyHistoryStructured: source.familyHistoryStructured,
    socialHistory: source.socialHistory,
    socialHistoryStructured: source.socialHistoryStructured,
    pastSurgicalHistory: source.pastSurgicalHistory,
    pastSurgicalHistoryStructured: source.pastSurgicalHistoryStructured,
  });

  const hasComplaints = mappedSource.complaints.some((c) => c.name.trim());
  const hasFamily = subjectiveCarryForwardHasFamilyHistory(source);
  const hasSocial = resolveSocialHistoryForCarryForward(source) != null;
  const hasSurgical = subjectiveCarryForwardHasPastSurgicalHistory(source);

  const apply = (sel: SubjectiveCarryForwardSelection) => {
    const actions = buildSubjectiveCarryForwardActions(mappedSource, sel);
    if (actions.length === 0) return;
    for (const action of actions) {
      dispatch(action);
    }
    setOpen(false);
    setPickMode(false);
    setSelection(DEFAULT_SELECTION);
  };

  const toggleField = (key: keyof SubjectiveCarryForwardSelection) => {
    setSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="h-8 gap-1.5 text-xs"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="carry-forward-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Same as last visit
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Carry forward subjective from last visit"
          className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg"
          data-testid="carry-forward-panel"
        >
          <p className="text-xs text-muted-foreground">
            From visit on {visitDate}
          </p>

          {!pickMode ? (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                className="w-full"
                data-testid="carry-forward-copy-all"
                onClick={() => apply(COPY_ALL_SUBJECTIVE_SELECTION)}
              >
                Copy all
              </Button>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setPickMode(true)}
              >
                Pick fields…
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <fieldset className="space-y-2">
                <legend className="sr-only">Fields to copy</legend>
                {hasComplaints ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.complaints}
                      onChange={() => toggleField("complaints")}
                    />
                    Chief complaints
                  </label>
                ) : null}
                {hasFamily ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.familyHistory}
                      onChange={() => toggleField("familyHistory")}
                    />
                    Family history
                  </label>
                ) : null}
                {hasSocial ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.socialHistory}
                      onChange={() => toggleField("socialHistory")}
                    />
                    Social history
                  </label>
                ) : null}
                {hasSurgical ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.pastSurgicalHistory}
                      onChange={() => toggleField("pastSurgicalHistory")}
                    />
                    Past surgical history
                  </label>
                ) : null}
              </fieldset>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPickMode(false);
                    setSelection(DEFAULT_SELECTION);
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  data-testid="carry-forward-apply-selected"
                  onClick={() => apply(selection)}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
