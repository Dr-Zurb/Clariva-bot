"use client";

import { useState } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  buildObjectiveTemplateApplyActions,
  buildObjectiveTemplateSavePayload,
  defaultObjectiveSaveName,
  objectiveScopeHasContent,
} from "@/lib/cockpit/apply-objective-template";
import { specialtyPackToSyntheticTemplate } from "@/lib/cockpit/objective-specialty-pack-apply";
import {
  describeObjectivePackSummary,
  type ObjectiveSpecialtyPack,
} from "@/lib/cockpit/objective-specialty-packs";
import { useObjectiveSpecialtyPacks } from "@/lib/cockpit/useObjectiveSpecialtyPacks";
import { createRxTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";

export interface ObjectiveSpecialtyPacksStripProps {
  /** Doctor specialty label from settings (P3 source). */
  specialty: string | null | undefined;
  disabled?: boolean;
}

/**
 * Surfaces read-only specialty starter packs (§E2). Apply fills form state only
 * via obj-17; saving creates a per-doctor template — never layout config (P4-D4).
 */
export function ObjectiveSpecialtyPacksStrip({
  specialty,
  disabled = false,
}: ObjectiveSpecialtyPacksStripProps) {
  const packs = useObjectiveSpecialtyPacks(specialty);
  const { token, dispatch, state } = useRxForm();
  const [applyingPackId, setApplyingPackId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (packs.length === 0) return null;

  const handleApply = async (pack: ObjectiveSpecialtyPack) => {
    setApplyingPackId(pack.id);
    try {
      const template = specialtyPackToSyntheticTemplate(pack);
      const actions = buildObjectiveTemplateApplyActions(
        "objective_full",
        template,
        state.fields,
      );
      for (const action of actions) {
        dispatch(action);
      }
    } finally {
      setApplyingPackId(null);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!objectiveScopeHasContent("objective_full", state.fields)) {
      window.alert("Apply a pack or add objective content before saving a template.");
      return;
    }

    const payload = buildObjectiveTemplateSavePayload("objective_full", state.fields);
    const nameSeed = defaultObjectiveSaveName("objective_full", state.fields);
    const name = window.prompt("Save current objective as template — enter a short name:", nameSeed);
    if (!name?.trim()) return;

    setSaving(true);
    try {
      await createRxTemplate(token, { name: name.trim(), ...payload });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-md border border-border bg-muted/20 px-3 py-2.5"
      data-testid="objective-specialty-packs-strip"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Specialty starter packs</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={disabled || saving}
          onClick={() => void handleSaveAsTemplate()}
        >
          Save objective as template
        </Button>
      </div>
      <ul className="mt-2 space-y-2">
        {packs.map((pack) => {
          const busy = applyingPackId === pack.id;
          return (
            <li
              key={pack.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2"
              data-testid={`objective-specialty-pack-${pack.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{pack.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {describeObjectivePackSummary(pack)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0"
                disabled={disabled || busy || saving}
                aria-busy={busy}
                onClick={() => void handleApply(pack)}
              >
                {busy ? "Applying…" : "Apply"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
