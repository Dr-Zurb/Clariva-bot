"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bulkTagPatients } from "@/lib/api/patients";
import { exportPatientsCsv } from "@/lib/patients-v2/list-utils";
import {
  PATIENT_TAGS_MAX,
  applyTagOp,
  coercePatientTags,
  normalizeTagLabel,
  patientHasTag,
  unappliedAddLabels,
  type PatientTagOp,
} from "@/lib/patients-v2/patient-tags";
import { trackPatientsV2BulkAction } from "@/lib/patients-v2/telemetry";
import type { PatientSummary } from "@/types/patient";
import { cn } from "@/lib/utils";

export interface BulkActionsBarProps {
  selectedCount: number;
  /** Canonical IDs to tag — must match the selection count (cross-page safe). */
  selectedPatientIds: string[];
  /** Resolved summaries for CSV + max-tag checks (may be a subset if roster still loading). */
  selectedPatients: PatientSummary[];
  token: string;
  knownTags?: string[];
  onClear: () => void;
  /** Optimistic local patch — called before the network request. */
  onTagged?: (op: PatientTagOp, tags: string[], patientIds: string[]) => void;
  /** Rollback / refetch after a failed network apply. */
  onTagFailed?: () => void;
  /**
   * Delete a tag from the clinic list: remove it from every patient who has it
   * and drop it from known tags.
   */
  onDeleteKnownTag?: (tag: string) => void;
}

type TagPresence = "all" | "some" | "none";

function presenceForTag(
  patients: PatientSummary[],
  tag: string,
): TagPresence {
  if (patients.length === 0) return "none";
  let has = 0;
  for (const p of patients) {
    if (
      patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), tag)
    ) {
      has += 1;
    }
  }
  if (has === 0) return "none";
  if (has === patients.length) return "all";
  return "some";
}

function patchPatientsLocal(
  patients: PatientSummary[],
  op: PatientTagOp,
  tags: string[],
  ids: string[],
): PatientSummary[] {
  const idSet = new Set(ids);
  return patients.map((p) => {
    if (!idSet.has(p.id)) return p;
    const next = applyTagOp(
      coercePatientTags(p.patient_tags, p.patient_tag),
      op,
      tags,
    );
    return {
      ...p,
      patient_tags: next,
      patient_tag: next[0] ?? null,
    };
  });
}

export function BulkActionsBar({
  selectedCount,
  selectedPatientIds,
  selectedPatients,
  token,
  knownTags = [],
  onClear,
  onTagged,
  onTagFailed,
  onDeleteKnownTag,
}: BulkActionsBarProps) {
  const [tagOpen, setTagOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  /** Instant popover view — updated before parent props catch up. */
  const [viewPatients, setViewPatients] = useState(selectedPatients);
  /** Tags deleted this session — hide immediately even before knownTags updates. */
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());
  const listId = useId();

  const selectedPatientsRef = useRef(selectedPatients);
  selectedPatientsRef.current = selectedPatients;

  // Sync from parent when idle. Skip while in-flight so a stale table
  // reload cannot flash checkboxes back to the old state.
  useEffect(() => {
    if (inFlight.current.size > 0) return;
    setViewPatients(selectedPatients);
  }, [selectedPatients]);

  const tagRows = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const t of knownTags) {
      const trimmed = t.trim();
      if (trimmed) byKey.set(trimmed.toLowerCase(), trimmed);
    }
    for (const p of viewPatients) {
      for (const t of coercePatientTags(p.patient_tags, p.patient_tag)) {
        const key = t.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, t);
      }
    }
    return Array.from(byKey.values())
      .filter((t) => !hiddenTags.has(t.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [knownTags, viewPatients, hiddenTags]);

  const applyOp = (op: PatientTagOp, tags: string[], ids: string[]): boolean => {
    if (ids.length === 0) return false;
    const flightKey = `${op}:${tags.map((t) => t.toLowerCase()).join("|")}:${ids.join(",")}`;
    if (inFlight.current.has(flightKey)) return false;
    inFlight.current.add(flightKey);

    setTagError(null);
    // Paint checkbox/badge state immediately (popover + table).
    setViewPatients((prev) => patchPatientsLocal(prev, op, tags, ids));
    onTagged?.(op, tags, ids);

    void bulkTagPatients(token, ids, {
      op,
      tags: op === "clear" ? [] : tags,
    })
      .then(() => {
        trackPatientsV2BulkAction("tag", ids.length);
      })
      .catch((e: unknown) => {
        setTagError(e instanceof Error ? e.message : "Failed to update tags");
        onTagFailed?.();
      })
      .finally(() => {
        inFlight.current.delete(flightKey);
        if (inFlight.current.size === 0) {
          setViewPatients(selectedPatientsRef.current);
        }
      });

    return true;
  };

  const toggleTag = (tag: string) => {
    const label = normalizeTagLabel(tag);
    if (!label) return;

    const presence = presenceForTag(viewPatients, label);
    if (presence === "all") {
      const ids = viewPatients
        .filter((p) =>
          patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), label),
        )
        .map((p) => p.id);
      applyOp("remove", [label], ids.length > 0 ? ids : selectedPatientIds);
      return;
    }

    const missing = viewPatients.filter(
      (p) =>
        !patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), label),
    );
    const targets = missing.filter(
      (p) =>
        unappliedAddLabels(
          coercePatientTags(p.patient_tags, p.patient_tag),
          [label],
        ).length === 0,
    );
    if (missing.length > 0 && targets.length === 0) {
      setTagError(
        `Selected patients already have ${PATIENT_TAGS_MAX} tags. Remove one before adding.`,
      );
      return;
    }
    const ids =
      targets.length > 0 ? targets.map((p) => p.id) : selectedPatientIds;
    const ok = applyOp("add", [label], ids);
    if (
      ok &&
      missing.length > 0 &&
      targets.length > 0 &&
      targets.length < missing.length
    ) {
      setTagError(
        `Added for ${targets.length}; ${missing.length - targets.length} already at ${PATIENT_TAGS_MAX} tags.`,
      );
    }
  };

  const addDraftTag = () => {
    const label = normalizeTagLabel(draft);
    if (!label) return;
    setDraft("");
    toggleTag(label);
  };

  const clearAllTags = () => {
    const ok = window.confirm(
      `Clear all tags from ${selectedCount} selected patient${selectedCount === 1 ? "" : "s"}?`,
    );
    if (!ok) return;
    applyOp("clear", [], selectedPatientIds);
  };

  const deleteKnownTag = (tag: string) => {
    const label = normalizeTagLabel(tag);
    if (!label || !onDeleteKnownTag) return;
    const ok = window.confirm(
      `Delete tag “${label}”? It will be removed from every patient who has it.`,
    );
    if (!ok) return;
    setTagError(null);
    setHiddenTags((prev) => new Set(prev).add(label.toLowerCase()));
    setViewPatients((prev) =>
      patchPatientsLocal(
        prev,
        "remove",
        [label],
        prev.map((p) => p.id),
      ),
    );
    onDeleteKnownTag(label);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">
        {selectedCount} selected ·{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={onClear}
        >
          Clear
        </button>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={selectedPatients.length === 0}
        onClick={() => {
          exportPatientsCsv(selectedPatients);
          trackPatientsV2BulkAction("export_csv", selectedCount);
        }}
      >
        Export CSV
      </Button>
      <Popover
        open={tagOpen}
        onOpenChange={(open) => {
          setTagOpen(open);
          if (!open) {
            setTagError(null);
            setDraft("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Tag…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <p className="text-xs text-muted-foreground">
            Tags for {selectedCount} selected. Click a tag to turn it on or
            off.
          </p>

          <Input
            list={listId}
            placeholder="Type a new tag and press Enter…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (tagError) setTagError(null);
            }}
            maxLength={64}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!draft.trim()) return;
                addDraftTag();
              }
            }}
            aria-label="New tag"
          />
          {tagRows.length > 0 ? (
            <datalist id={listId}>
              {tagRows.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          ) : null}

          {tagRows.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Tags</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border/60">
                {tagRows.map((tag) => {
                  const presence = presenceForTag(viewPatients, tag);
                  const checked =
                    presence === "all"
                      ? true
                      : presence === "some"
                        ? ("indeterminate" as const)
                        : false;
                  return (
                    <li
                      key={tag}
                      className="flex items-center gap-0.5 pr-0.5 hover:bg-muted/50"
                    >
                      <label
                        className={cn(
                          "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTag(tag)}
                          aria-label={
                            presence === "all"
                              ? `Remove tag ${tag}`
                              : `Add tag ${tag}`
                          }
                        />
                        <span className="truncate">
                          {tag}
                          {presence === "some" ? (
                            <span className="text-muted-foreground">
                              {" "}
                              (some)
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {onDeleteKnownTag ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={`Delete tag ${tag}`}
                          aria-label={`Delete tag ${tag}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteKnownTag(tag);
                          }}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No tags yet. Type a name above and press Enter.
            </p>
          )}

          {tagError ? (
            <p className="text-xs text-destructive">{tagError}</p>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={clearAllTags}
          >
            Clear all tags
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
