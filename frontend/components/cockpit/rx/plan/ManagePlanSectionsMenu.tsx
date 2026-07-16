"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import { SOAP_TAB_CHROME_ICON_BTN_CLASS } from "@/components/cockpit/rx/SoapTabChromeActions";
import type { CustomSubsection } from "@/types/prescription";
import {
  customBlockIdFromSectionId,
  isCustomBlockSectionId,
  resolvePlanSectionLabel,
  type PlanSectionId,
} from "@/lib/cockpit/plan-section-order";
import { isSectionHidden } from "@/lib/cockpit/plan-section-visibility";
import { medicinesNamedCount } from "@/lib/cockpit/apply-medicines-template";
import { investigationsOrdersCount } from "@/lib/cockpit/apply-investigations-template";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { cn } from "@/lib/utils";

function customBlockHasContent(section: CustomSubsection): boolean {
  if (section.title.trim() || section.body?.trim()) return true;
  return (section.children ?? []).some(
    (child) => Boolean(child.title.trim() || child.body?.trim()),
  );
}

/** Boolean-only hint for the menu — never surfaces field content. */
export function resolvePlanSectionHasDataHint(
  sectionId: PlanSectionId,
  fields: RxFormFields,
  customSections: readonly CustomSubsection[] = [],
): boolean {
  if (isCustomBlockSectionId(sectionId)) {
    const blockId = customBlockIdFromSectionId(sectionId);
    const block = customSections.find((s) => s.id === blockId);
    return block ? customBlockHasContent(block) : false;
  }
  switch (sectionId) {
    case "investigations":
      return investigationsOrdersCount(fields.investigationsOrders) > 0;
    case "medications":
      return medicinesNamedCount(fields.medicines) > 0;
    case "follow_up":
      return Boolean(
        fields.followUp.trim() ||
          fields.followUpValue != null ||
          fields.followUpUnit != null,
      );
    case "advice":
      return Boolean(fields.advice.trim());
    case "referral":
      return Boolean(
        fields.referral.trim() ||
          fields.referralUrgency?.trim() ||
          fields.referralReason?.trim() ||
          fields.referralSpecialties.length > 0,
      );
    case "clinical_notes":
      return Boolean(fields.clinicalNotes.trim());
    default:
      return false;
  }
}

export interface ManagePlanSectionsMenuProps {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sectionOrder: readonly PlanSectionId[];
  mountableIds: readonly PlanSectionId[];
  hiddenIds: readonly string[];
  fields: RxFormFields;
  customSections: readonly CustomSubsection[];
  onToggleHidden: (sectionId: PlanSectionId) => void;
  onMoveSection: (sectionId: PlanSectionId, direction: "up" | "down") => void;
  onAddCustomSection: () => void;
  onRemoveCustomSection: (sectionId: PlanSectionId) => void;
}

export function ManagePlanSectionsMenu({
  disabled = false,
  open,
  onOpenChange,
  sectionOrder,
  mountableIds,
  hiddenIds,
  fields,
  customSections,
  onToggleHidden,
  onMoveSection,
  onAddCustomSection,
  onRemoveCustomSection,
}: ManagePlanSectionsMenuProps) {
  const mountableSet = useMemo(() => new Set(mountableIds), [mountableIds]);

  const menuSections = useMemo(
    () => sectionOrder.filter((id) => mountableSet.has(id)),
    [mountableSet, sectionOrder],
  );

  const hiddenMountableCount = useMemo(
    () => menuSections.filter((id) => isSectionHidden(id, hiddenIds, mountableIds)).length,
    [hiddenIds, menuSections, mountableIds],
  );

  const triggerLabel =
    hiddenMountableCount > 0 ? `Sections · ${hiddenMountableCount} hidden` : "Manage sections";

  const sectionCountLabel = `${menuSections.length} section${menuSections.length === 1 ? "" : "s"}`;
  const headerSubtitle =
    hiddenMountableCount > 0
      ? `${sectionCountLabel} · ${hiddenMountableCount} hidden`
      : `${sectionCountLabel} · reorder or hide for this visit`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <IconTooltipGroup>
        <IconTooltip label={triggerLabel}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(SOAP_TAB_CHROME_ICON_BTN_CLASS, "relative")}
              aria-label={triggerLabel}
              data-testid="plan-section-manager-trigger"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              {hiddenMountableCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-muted-foreground px-0.5 text-[9px] font-semibold leading-none text-background">
                  {hiddenMountableCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </IconTooltip>
      </IconTooltipGroup>
      <PopoverContent align="end" className="w-[30rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Manage sections</p>
          <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="list">
          {menuSections.map((sectionId, menuIndex) => {
            const label = resolvePlanSectionLabel(sectionId, customSections);
            const hasData = resolvePlanSectionHasDataHint(sectionId, fields, customSections);
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
                data-testid={`plan-section-manager-row-${sectionId}`}
              >
                <div className="flex shrink-0 items-center gap-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40" aria-hidden />
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
                      testId={`plan-section-manager-remove-${sectionId}`}
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
                    data-testid={`plan-section-manager-toggle-${sectionId}`}
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
            data-testid="plan-section-manager-add-custom"
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
