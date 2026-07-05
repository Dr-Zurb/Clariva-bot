"use client";

import { useState } from "react";
import {
  EDEMA_CONTEXT_CHIPS,
  EDEMA_GRADE_CHIPS,
  EDEMA_LATERALITY_CHIPS,
  EDEMA_SEVERITY_CHIPS,
  EDEMA_SITE_CATALOG,
  type EdemaGrade,
  type EdemaSeverity,
  type EdemaSiteEntry,
  type EdemaSiteId,
  edemaSiteLabel,
  patchEdemaSites,
  toggleEdemaSite,
} from "@/lib/cockpit/edema-sites";
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
import { EdemaGradeHelp } from "@/components/cockpit/rx/inputs/EdemaGradeHelp";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_EXAM_FIELD_LABEL_BLOCK_CLASS,
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

function chipTestSlug(chip: string): string {
  return chip.replace(/\s+/g, "-").replace(/\//g, "-").toLowerCase();
}

/** Collapsed one-line summary of an edema site's recorded detail (no label). */
function edemaEntryPreview(entry: EdemaSiteEntry): string {
  const parts: string[] = [];
  if (entry.laterality) parts.push(entry.laterality);
  if (entry.grade) parts.push(entry.grade);
  if (entry.severity) parts.push(entry.severity);
  if (entry.context?.length) parts.push(...entry.context);
  if (entry.notes?.trim()) parts.push(entry.notes.trim());
  return parts.join(", ");
}

export interface EdemaSitesPanelProps {
  sites: readonly EdemaSiteEntry[];
  disabled?: boolean;
  onChange: (sites: EdemaSiteEntry[]) => void;
}

function EdemaSiteFields({
  entry,
  disabled,
  onPatch,
}: {
  entry: EdemaSiteEntry;
  disabled?: boolean;
  onPatch: (patch: Partial<Omit<EdemaSiteEntry, "site">>) => void;
}) {
  const siteId = entry.site;
  const showLaterality = siteId !== "generalized";
  const selectedContext = entry.context ?? [];

  return (
    <>
      {showLaterality ? (
        <div>
          <span className={RX_EXAM_FIELD_LABEL_CLASS}>Laterality</span>
          <div
            className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
            role="group"
            aria-label={`${edemaSiteLabel(siteId)} laterality`}
          >
            {EDEMA_LATERALITY_CHIPS.map((chip) => {
              const isSelected = entry.laterality === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  data-testid={`general-edema-${siteId}-laterality-${chipTestSlug(chip)}`}
                  onClick={() => onPatch({ laterality: isSelected ? undefined : chip })}
                  className={chartSelectChipClass(isSelected)}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center gap-1">
          <span className={RX_EXAM_FIELD_LABEL_CLASS}>Grade</span>
          <EdemaGradeHelp siteId={siteId} />
        </div>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={`${edemaSiteLabel(siteId)} grade`}
        >
          {EDEMA_GRADE_CHIPS.map((chip) => {
            const isSelected = entry.grade === chip;
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-edema-${siteId}-grade-${chipTestSlug(chip)}`}
                onClick={() => onPatch({ grade: isSelected ? undefined : (chip as EdemaGrade) })}
                className={chartSelectChipClass(isSelected)}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Severity</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={`${edemaSiteLabel(siteId)} severity`}
        >
          {EDEMA_SEVERITY_CHIPS.map((chip) => {
            const isSelected = entry.severity === chip;
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-edema-${siteId}-severity-${chipTestSlug(chip)}`}
                onClick={() =>
                  onPatch({ severity: isSelected ? undefined : (chip as EdemaSeverity) })
                }
                className={chartSelectChipClass(isSelected)}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Context</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={`${edemaSiteLabel(siteId)} context`}
        >
          {EDEMA_CONTEXT_CHIPS.map((chip) => {
            const isSelected = selectedContext.some(
              (item) => item.toLowerCase() === chip.toLowerCase(),
            );
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-edema-${siteId}-context-${chipTestSlug(chip)}`}
                onClick={() => {
                  const next = isSelected
                    ? selectedContext.filter((item) => item.toLowerCase() !== chip.toLowerCase())
                    : [...selectedContext, chip];
                  onPatch({ context: next.length > 0 ? next : undefined });
                }}
                className={chartSelectChipClass(isSelected)}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor={`general-edema-${siteId}-notes`}
          className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
        >
          Notes
        </label>
        <input
          id={`general-edema-${siteId}-notes`}
          type="text"
          value={entry.notes ?? ""}
          disabled={disabled}
          placeholder="Optional detail"
          maxLength={500}
          data-testid={`general-edema-${siteId}-notes`}
          onChange={(event) => onPatch({ notes: event.target.value || undefined })}
          className={RX_FIELD_INPUT_CLASS}
        />
      </div>
    </>
  );
}

export function EdemaSitesPanel({
  sites,
  disabled = false,
  onChange,
}: EdemaSitesPanelProps): JSX.Element {
  const activeSiteIds = new Set(sites.map((entry) => entry.site));
  const [openSiteId, setOpenSiteId] = useState<EdemaSiteId | null>(null);

  function patchSite(siteId: EdemaSiteId, patch: Partial<Omit<EdemaSiteEntry, "site">>) {
    onChange(patchEdemaSites(sites, siteId, patch));
  }

  function handleSiteChipClick(siteId: EdemaSiteId) {
    // Toggle membership only. A newly added site appears collapsed (no scroll); the
    // clinician opens it when ready. Removing the open site clears the expanded state.
    if (activeSiteIds.has(siteId) && openSiteId === siteId) {
      setOpenSiteId(null);
    }
    onChange(toggleEdemaSite(sites, siteId));
  }

  function toggleOpen(siteId: EdemaSiteId) {
    setOpenSiteId((current) => (current === siteId ? null : siteId));
  }

  return (
    <div className="space-y-2" data-testid="general-edema-sites-panel">
      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Site</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label="Edema site"
        >
          {EDEMA_SITE_CATALOG.map((item) => {
            const isSelected = activeSiteIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-edema-site-chip-${item.id}`}
                onClick={() => handleSiteChipClick(item.id)}
                className={chartSelectChipClass(isSelected)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {sites.length > 0 ? (
        <div className="space-y-2">
          {sites.map((entry) => (
            <CollapsibleEntryCard
              key={entry.site}
              title={edemaSiteLabel(entry.site)}
              preview={edemaEntryPreview(entry)}
              open={openSiteId === entry.site}
              onToggle={() => toggleOpen(entry.site)}
              onRemove={() => handleSiteChipClick(entry.site)}
              removeLabel={`Remove ${edemaSiteLabel(entry.site)}`}
              disabled={disabled}
              testId={`general-edema-panel-${entry.site}`}
              bodyId={`general-edema-panel-${entry.site}-body`}
            >
              <EdemaSiteFields
                entry={entry}
                disabled={disabled}
                onPatch={(patch) => patchSite(entry.site, patch)}
              />
            </CollapsibleEntryCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}
