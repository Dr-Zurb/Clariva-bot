"use client";

import { useState, type RefObject } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildScopedTemplateApplyActions,
  buildScopedTemplateSavePayload,
  scopeHasContent,
  type FormStateTemplateScope,
} from "@/lib/cockpit/apply-subjective-template";
import type { CreateRxTemplatePayload, DoctorRxTemplate, RxTemplateScope } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

/** Server-backed scopes whose save/apply go through a chart hook (subj-17). */
export type ServerBackedTemplateScope = Extract<RxTemplateScope, "past_medical" | "allergies">;

/** Every scope the shared button can drive. */
export type SectionTemplateScope = FormStateTemplateScope | ServerBackedTemplateScope;

const SAVE_EMPTY_MESSAGES: Record<SectionTemplateScope, string> = {
  chief_complaints: "Add at least one complaint before saving a template.",
  past_surgical: "Add past surgical history before saving a template.",
  family_history: "Add family history before saving a template.",
  social_history: "Add social / personal history before saving a template.",
  past_medical: "Add a condition or medication before saving a template.",
  allergies: "Add an allergy before saving a template.",
};

const SAVE_PROMPT_LABELS: Record<SectionTemplateScope, string> = {
  chief_complaints: "Save current complaints as template",
  past_surgical: "Save current past surgical history as template",
  family_history: "Save current family history as template",
  social_history: "Save current social history as template",
  past_medical: "Save current medical history as template",
  allergies: "Save current allergies as template",
};

const TEMPLATE_ARIA_LABELS: Record<SectionTemplateScope, string> = {
  chief_complaints: "Templates for chief complaints",
  past_surgical: "Templates for past surgical history",
  family_history: "Templates for family history",
  social_history: "Templates for social history",
  past_medical: "Templates for past medical history",
  allergies: "Templates for allergies",
};

const SAVE_ARIA_LABELS: Record<SectionTemplateScope, string> = {
  chief_complaints: "Save chief complaints as template",
  past_surgical: "Save past surgical history as template",
  family_history: "Save family history as template",
  social_history: "Save social history as template",
  past_medical: "Save medical history as template",
  allergies: "Save allergies as template",
};

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

function isFormStateScope(scope: SectionTemplateScope): scope is FormStateTemplateScope {
  return scope !== "past_medical" && scope !== "allergies";
}

function defaultSaveName(
  scope: FormStateTemplateScope,
  fields: ReturnType<typeof useRxForm>["state"]["fields"],
): string {
  switch (scope) {
    case "chief_complaints":
      return fields.complaints.find((c) => c.name.trim())?.name.trim() || "";
    case "past_surgical":
      return fields.pastSurgicalHistoryStructured?.procedures?.[0]?.procedure === "other"
        ? fields.pastSurgicalHistoryStructured.procedures[0]?.procedureOther?.trim() || ""
        : "Past surgical";
    case "family_history":
      return "Family history";
    case "social_history":
      return "Social history";
  }
}

/** Scoped save payload (subjective/pmh/allergies slice) or `null` when empty. */
export type ScopedSavePayload = Omit<CreateRxTemplatePayload, "name">;

/** Live bindings a server-backed section registers for header-mounted controls. */
export interface SectionTemplateControlsBinding {
  applyOverride: (template: DoctorRxTemplate) => Promise<void> | void;
  buildSaveOverride: () => ScopedSavePayload | null;
  defaultSaveName?: string;
}

export interface SubjectiveSectionTemplateButtonProps {
  scope: SectionTemplateScope;
  disabled?: boolean;
  /**
   * subj-17 server-backed seam. When provided, apply calls this hook-backed
   * function instead of dispatching reducer actions (form-state path untouched).
   */
  applyOverride?: (template: DoctorRxTemplate) => Promise<void> | void;
  /**
   * subj-17 server-backed seam. Returns the scoped save payload snapshotted from
   * chart state, or `null` when there is nothing to save (guard fired).
   */
  buildSaveOverride?: () => ScopedSavePayload | null;
  /** Default name seed for the save prompt (server-backed scopes). */
  defaultSaveName?: string;
}

export function SubjectiveSectionTemplateButton({
  scope,
  disabled = false,
  applyOverride,
  buildSaveOverride,
  defaultSaveName: serverDefaultName,
}: SubjectiveSectionTemplateButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    if (applyOverride) {
      await applyOverride(template);
      return;
    }
    if (!isFormStateScope(scope)) return;
    const actions = buildScopedTemplateApplyActions(scope, template);
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    let payload: ScopedSavePayload;
    let nameSeed: string;

    if (buildSaveOverride) {
      const built = buildSaveOverride();
      if (!built) {
        window.alert(SAVE_EMPTY_MESSAGES[scope]);
        return;
      }
      payload = built;
      nameSeed = serverDefaultName ?? "";
    } else {
      if (!isFormStateScope(scope)) return;
      if (!scopeHasContent(scope, state.fields)) {
        window.alert(SAVE_EMPTY_MESSAGES[scope]);
        return;
      }
      payload = buildScopedTemplateSavePayload(scope, state.fields);
      nameSeed = defaultSaveName(scope, state.fields);
    }

    const name = window.prompt(`${SAVE_PROMPT_LABELS[scope]} — enter a short name:`, nameSeed);
    if (!name?.trim()) return;

    setSaving(true);
    try {
      await createRxTemplate(token, { name: name.trim(), ...payload });
      setOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <IconTooltipGroup>
        <span className="inline-flex items-center gap-0.5">
          <IconTooltip label={SAVE_ARIA_LABELS[scope]}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`subjective-section-template-save-${scope}`}
              aria-label={SAVE_ARIA_LABELS[scope]}
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label={TEMPLATE_ARIA_LABELS[scope]}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`subjective-section-template-${scope}`}
              aria-label={TEMPLATE_ARIA_LABELS[scope]}
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </span>
      </IconTooltipGroup>

      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        variant="subjective"
        scope={scope}
        onApply={handleApply}
      />
    </>
  );
}

/** Header actions wired to a live ref from a server-backed chart section. */
export function SubjectiveSectionTemplateHeaderActions({
  scope,
  controlsRef,
  ready,
  disabled = false,
}: {
  scope: ServerBackedTemplateScope;
  controlsRef: RefObject<SectionTemplateControlsBinding | null>;
  ready: boolean;
  disabled?: boolean;
}) {
  if (disabled || !ready) return null;
  return (
    <SubjectiveSectionTemplateButton
      scope={scope}
      disabled={!controlsRef.current}
      applyOverride={(template) => controlsRef.current?.applyOverride(template)}
      buildSaveOverride={() => controlsRef.current?.buildSaveOverride() ?? null}
      defaultSaveName={controlsRef.current?.defaultSaveName}
    />
  );
}
