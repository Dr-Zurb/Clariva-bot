"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, LayoutList, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { CustomSubsection } from "@/types/prescription";
import { hasFamilyHistoryStructuredContent } from "@/lib/cockpit/family-history";
import { hasPastSurgicalHistoryStructuredContent } from "@/lib/cockpit/past-surgical-history";
import { hasSocialHistoryStructuredContent } from "@/lib/cockpit/social-history";
import {
  customBlockIdFromSectionId,
  isCustomBlockSectionId,
  isStaticSubjectiveSectionId,
  resolveSubjectiveSectionLabel,
  type StaticSubjectiveSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";
import { isSectionHidden } from "@/lib/cockpit/subjective-section-visibility";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { cn } from "@/lib/utils";

function customBlockHasContent(section: CustomSubsection): boolean {
  if (section.title.trim() || section.body?.trim()) return true;
  return (section.children ?? []).some(
    (child) => Boolean(child.title.trim() || child.body?.trim()),
  );
}

/** Boolean-only hint for the menu — never surfaces field content (P10-D5). */
export function resolveSectionHasDataHint(
  sectionId: SubjectiveSectionId,
  fields: RxFormFields,
  customSubsections: readonly CustomSubsection[],
): boolean {
  if (isCustomBlockSectionId(sectionId)) {
    const blockId = customBlockIdFromSectionId(sectionId);
    const block = customSubsections.find((section) => section.id === blockId);
    return block ? customBlockHasContent(block) : false;
  }

  if (!isStaticSubjectiveSectionId(sectionId)) return false;

  switch (sectionId) {
    case "chief_complaints":
      return fields.complaints.length > 0 || Boolean(fields.cc.trim());
    case "free_text_notes":
      return Boolean(fields.hopi.trim());
    case "family_history":
      return hasFamilyHistoryStructuredContent(fields.familyHistoryStructured);
    case "social_history":
      return hasSocialHistoryStructuredContent(fields.socialHistoryStructured);
    case "past_surgical":
      return hasPastSurgicalHistoryStructuredContent(fields.pastSurgicalHistoryStructured);
    default:
      return false;
  }
}

export interface SectionManagerMenuProps {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sectionOrder: readonly SubjectiveSectionId[];
  mountableIds: readonly SubjectiveSectionId[];
  hiddenIds: readonly string[];
  customSubsections: readonly CustomSubsection[];
  fields: RxFormFields;
  onToggleHidden: (sectionId: SubjectiveSectionId) => void;
  onMoveSection: (sectionId: SubjectiveSectionId, direction: "up" | "down") => void;
  onAddCustomSection: () => void;
  onRemoveCustomSection: (sectionId: SubjectiveSectionId) => void;
}

export function SectionManagerMenu({
  disabled = false,
  open,
  onOpenChange,
  sectionOrder,
  mountableIds,
  hiddenIds,
  customSubsections,
  fields,
  onToggleHidden,
  onMoveSection,
  onAddCustomSection,
  onRemoveCustomSection,
}: SectionManagerMenuProps) {
  const mountableSet = useMemo(() => new Set(mountableIds), [mountableIds]);

  const menuSections = useMemo(
    () => sectionOrder.filter((id) => mountableSet.has(id)),
    [mountableSet, sectionOrder],
  );

  const hiddenMountableCount = useMemo(
    () =>
      menuSections.filter((id) => isSectionHidden(id, hiddenIds, mountableIds)).length,
    [hiddenIds, menuSections, mountableIds],
  );

  const triggerLabel =
    hiddenMountableCount > 0
      ? `Sections · ${hiddenMountableCount} hidden`
      : "Manage sections";

  const sectionCountLabel = `${menuSections.length} section${menuSections.length === 1 ? "" : "s"}`;
  const headerSubtitle =
    hiddenMountableCount > 0
      ? `${sectionCountLabel} · ${hiddenMountableCount} hidden`
      : `${sectionCountLabel} · reorder or hide for this visit`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={triggerLabel}
          data-testid="section-manager-menu-trigger"
        >
          <LayoutList className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{triggerLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[30rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Manage sections</p>
          <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="list">
          {menuSections.map((sectionId, menuIndex) => {
            const label = resolveSubjectiveSectionLabel(sectionId, customSubsections);
            const hasData = resolveSectionHasDataHint(sectionId, fields, customSubsections);
            const isCustom = isCustomBlockSectionId(sectionId);
            const hidden = isSectionHidden(sectionId, hiddenIds, mountableIds);
            const orderIndex = sectionOrder.indexOf(sectionId);
            const canMoveUp = !disabled && menuIndex > 0 && orderIndex !== -1;
            const canMoveDown =
              !disabled && menuIndex < menuSections.length - 1 && orderIndex !== -1;

            return (
              <li
                key={sectionId}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/50",
                  hidden && "opacity-80",
                )}
                data-testid={`section-manager-row-${sectionId}`}
              >
                <div className="flex shrink-0 items-center gap-1">
                  <GripVertical
                    className="h-4 w-4 text-muted-foreground/40"
                    aria-hidden
                  />
                  <div className="flex items-center gap-px">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                      aria-label={`Move ${label} up`}
                      disabled={!canMoveUp}
                      onClick={() => onMoveSection(sectionId, "up")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                      aria-label={`Move ${label} down`}
                      disabled={!canMoveDown}
                      onClick={() => onMoveSection(sectionId, "down")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug break-words",
                      hidden && "text-muted-foreground line-through decoration-muted-foreground/60",
                    )}
                  >
                    {label}
                  </p>
                  {isCustom || hidden || hasData ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {isCustom ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Custom
                        </span>
                      ) : null}
                      {hidden ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Hidden
                        </span>
                      ) : null}
                      {hasData ? (
                        <span className="text-xs text-muted-foreground">Has data</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {isCustom ? (
                    <RemoveIconButton
                      label={`Remove ${label}`}
                      disabled={disabled}
                      testId={`section-manager-remove-${sectionId}`}
                      className="h-8 w-8"
                      onClick={() => onRemoveCustomSection(sectionId)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      hidden && "bg-muted/40",
                    )}
                    aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
                    aria-pressed={hidden}
                    disabled={disabled}
                    data-testid={`section-manager-toggle-${sectionId}`}
                    onClick={() => onToggleHidden(sectionId)}
                  >
                    {hidden ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4 text-foreground/70" aria-hidden />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border p-2">
          <button
            type="button"
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
            disabled={disabled}
            data-testid="section-manager-add-custom"
            onClick={onAddCustomSection}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add custom section
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
