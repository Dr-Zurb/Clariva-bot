"use client";

import { useState } from "react";
import {
  LYMPH_CHARACTER_CHIPS,
  LYMPH_LATERALITY_CHIPS,
  LYMPH_SITE_CATALOG,
  LYMPH_SIZE_CHIPS,
  type LymphSiteEntry,
  type LymphSiteId,
  type LymphSize,
  lymphSiteLabel,
  patchLymphSites,
  toggleLymphSite,
} from "@/lib/cockpit/lymphadenopathy-sites";
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
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
  return chip.replace(/\s+/g, "-").replace(/\//g, "-").replace(/[<>≤]/g, "").toLowerCase();
}

export interface LymphadenopathySitesPanelProps {
  sites: readonly LymphSiteEntry[];
  disabled?: boolean;
  onChange: (sites: LymphSiteEntry[]) => void;
}

/** Collapsed one-line summary of a lymph node site's recorded detail (no label). */
function lymphEntryPreview(entry: LymphSiteEntry): string {
  const parts: string[] = [];
  if (entry.laterality) parts.push(entry.laterality);
  if (entry.size) parts.push(entry.size);
  if (entry.character?.length) parts.push(...entry.character);
  if (entry.notes?.trim()) parts.push(entry.notes.trim());
  return parts.join(", ");
}

function LymphSiteFields({
  entry,
  disabled,
  onPatch,
}: {
  entry: LymphSiteEntry;
  disabled?: boolean;
  onPatch: (patch: Partial<Omit<LymphSiteEntry, "site">>) => void;
}) {
  const siteId = entry.site;
  const showLaterality = siteId !== "generalized";
  const selectedCharacter = entry.character ?? [];

  return (
    <>
      {showLaterality ? (
        <div>
          <span className={RX_EXAM_FIELD_LABEL_CLASS}>Laterality</span>
          <div
            className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
            role="group"
            aria-label={`${lymphSiteLabel(siteId)} laterality`}
          >
            {LYMPH_LATERALITY_CHIPS.map((chip) => {
              const isSelected = entry.laterality === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  data-testid={`general-lymph-${siteId}-laterality-${chipTestSlug(chip)}`}
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
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Size</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={`${lymphSiteLabel(siteId)} size`}
        >
          {LYMPH_SIZE_CHIPS.map((chip) => {
            const isSelected = entry.size === chip;
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-lymph-${siteId}-size-${chipTestSlug(chip)}`}
                onClick={() => onPatch({ size: isSelected ? undefined : (chip as LymphSize) })}
                className={chartSelectChipClass(isSelected)}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Character</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={`${lymphSiteLabel(siteId)} character`}
        >
          {LYMPH_CHARACTER_CHIPS.map((chip) => {
            const isSelected = selectedCharacter.some(
              (item) => item.toLowerCase() === chip.toLowerCase(),
            );
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-lymph-${siteId}-character-${chipTestSlug(chip)}`}
                onClick={() => {
                  const next = isSelected
                    ? selectedCharacter.filter(
                        (item) => item.toLowerCase() !== chip.toLowerCase(),
                      )
                    : [...selectedCharacter, chip];
                  onPatch({ character: next.length > 0 ? next : undefined });
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
          htmlFor={`general-lymph-${siteId}-notes`}
          className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
        >
          Notes
        </label>
        <input
          id={`general-lymph-${siteId}-notes`}
          type="text"
          value={entry.notes ?? ""}
          disabled={disabled}
          placeholder="Size or other detail"
          maxLength={500}
          data-testid={`general-lymph-${siteId}-notes`}
          onChange={(event) => onPatch({ notes: event.target.value || undefined })}
          className={RX_FIELD_INPUT_CLASS}
        />
      </div>
    </>
  );
}

export function LymphadenopathySitesPanel({
  sites,
  disabled = false,
  onChange,
}: LymphadenopathySitesPanelProps): JSX.Element {
  const activeSiteIds = new Set(sites.map((entry) => entry.site));
  const [openSiteId, setOpenSiteId] = useState<LymphSiteId | null>(null);

  function patchSite(siteId: LymphSiteId, patch: Partial<Omit<LymphSiteEntry, "site">>) {
    onChange(patchLymphSites(sites, siteId, patch));
  }

  function handleSiteChipClick(siteId: LymphSiteId) {
    // Toggle membership only; new sites appear collapsed (no scroll jump). Clearing the
    // currently open site collapses the expanded state.
    if (activeSiteIds.has(siteId) && openSiteId === siteId) {
      setOpenSiteId(null);
    }
    onChange(toggleLymphSite(sites, siteId));
  }

  function toggleOpen(siteId: LymphSiteId) {
    setOpenSiteId((current) => (current === siteId ? null : siteId));
  }

  return (
    <div className="space-y-2" data-testid="general-lymph-sites-panel">
      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>Site</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label="Lymphadenopathy site"
        >
          {LYMPH_SITE_CATALOG.map((item) => {
            const isSelected = activeSiteIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`general-lymph-site-chip-${item.id}`}
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
              title={lymphSiteLabel(entry.site)}
              preview={lymphEntryPreview(entry)}
              open={openSiteId === entry.site}
              onToggle={() => toggleOpen(entry.site)}
              onRemove={() => handleSiteChipClick(entry.site)}
              removeLabel={`Remove ${lymphSiteLabel(entry.site)}`}
              disabled={disabled}
              testId={`general-lymph-panel-${entry.site}`}
              bodyId={`general-lymph-panel-${entry.site}-body`}
            >
              <LymphSiteFields
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
