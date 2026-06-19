"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, LayoutList, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  isStaticObjectiveSectionId,
  resolveObjectiveSectionLabel,
  type ObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";
import { isSectionHidden } from "@/lib/cockpit/objective-section-visibility";
import { cn } from "@/lib/utils";

const ANY_VITALS_KEYS = [
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsHr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsHtCm",
  "vitalsRr",
  "vitalsPainScore",
  "vitalsGlucoseMgDl",
  "vitalsGcsTotal",
  "vitalsHeadCircumferenceCm",
  "vitalsMuacCm",
  "vitalsWaistCm",
] as const satisfies readonly (keyof RxFormFields)[];

/** Boolean-only hint for the menu — never surfaces field content (P10-D5). */
export function resolveObjectiveSectionHasDataHint(
  sectionId: ObjectiveSectionId,
  fields: RxFormFields,
): boolean {
  if (!isStaticObjectiveSectionId(sectionId)) return false;

  switch (sectionId) {
    case "vitals":
      return ANY_VITALS_KEYS.some((key) => fields[key] != null);
    case "exam":
      return fields.examFindings.length > 0;
    case "test_results":
      return Boolean(fields.testResults.trim());
    case "legacy_exam":
      return Boolean(fields.examinationFindings.trim());
    case "legacy_vitals":
      return Boolean(fields.vitalsText.trim());
    default:
      return false;
  }
}

export interface ManageObjectiveSectionsMenuProps {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sectionOrder: readonly ObjectiveSectionId[];
  mountableIds: readonly ObjectiveSectionId[];
  hiddenIds: readonly string[];
  fields: RxFormFields;
  onToggleHidden: (sectionId: ObjectiveSectionId) => void;
  onMoveSection: (sectionId: ObjectiveSectionId, direction: "up" | "down") => void;
  /** Optional add-custom action — wired by obj-13 once the custom-section engine lands. */
  onAddCustomSection?: () => void;
}

export function ManageObjectiveSectionsMenu({
  disabled = false,
  open,
  onOpenChange,
  sectionOrder,
  mountableIds,
  hiddenIds,
  fields,
  onToggleHidden,
  onMoveSection,
  onAddCustomSection,
}: ManageObjectiveSectionsMenuProps) {
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
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={triggerLabel}
          data-testid="objective-section-manager-trigger"
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
            const label = resolveObjectiveSectionLabel(sectionId);
            const hasData = resolveObjectiveSectionHasDataHint(sectionId, fields);
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
                data-testid={`objective-section-manager-row-${sectionId}`}
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
                  {hidden || hasData ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
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
                  <button
                    type="button"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      hidden && "bg-muted/40",
                    )}
                    aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
                    aria-pressed={hidden}
                    disabled={disabled}
                    data-testid={`objective-section-manager-toggle-${sectionId}`}
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
        {onAddCustomSection ? (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
              disabled={disabled}
              data-testid="objective-section-manager-add-custom"
              onClick={onAddCustomSection}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add custom section
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
