"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildSubjectiveTemplateApplyActions,
  buildSubjectiveTemplateSavePayload,
  fullSubjectiveHasContent,
} from "@/lib/cockpit/apply-subjective-template";
import {
  formatApplySummary,
  pmhTemplateHasContent,
  type ApplyPmhTemplateOptions,
  type TemplateApplySummary,
} from "@/lib/chart/use-pmh-template-apply";
import type { DoctorRxTemplate, RxTemplatePmh } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

/**
 * Bridge from the PMH chart section (subj-17) into the whole-subjective button
 * (subj-18). Registered by `ProblemOrientedMedicalSection` when chart data loads.
 */
export interface PmhTemplateBridge {
  snapshotForSave: () => RxTemplatePmh | null;
  hasContent: () => boolean;
  applyFromTemplate: (
    template: DoctorRxTemplate,
    opts?: ApplyPmhTemplateOptions,
  ) => Promise<void>;
}

interface SubjectivePmhBridgeContextValue {
  setBridge: (bridge: PmhTemplateBridge | null) => void;
}

const SubjectivePmhBridgeContext = createContext<SubjectivePmhBridgeContextValue | null>(null);

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

/** Provider — mount in `SubjectiveSection` around the subjective tab tree. */
export function SubjectivePmhBridgeProvider({
  children,
  setBridge,
}: {
  children: ReactNode;
  setBridge: (bridge: PmhTemplateBridge | null) => void;
}) {
  const value = useMemo(() => ({ setBridge }), [setBridge]);
  return (
    <SubjectivePmhBridgeContext.Provider value={value}>
      {children}
    </SubjectivePmhBridgeContext.Provider>
  );
}

/** PMH section registers its snapshot + apply hooks for the full bundle. */
export function useRegisterPmhTemplateBridge(): ((bridge: PmhTemplateBridge | null) => void) | null {
  return useContext(SubjectivePmhBridgeContext)?.setBridge ?? null;
}

export interface SubjectivePresetButtonProps {
  disabled?: boolean;
  /** Live PMH bridge from `ProblemOrientedMedicalSection` (null when chart not mounted). */
  pmhBridge?: PmhTemplateBridge | null;
}

export function SubjectivePresetButton({
  disabled = false,
  pmhBridge = null,
}: SubjectivePresetButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  const handleApply = async (template: DoctorRxTemplate) => {
    setApplying(true);
    setApplyNotice(null);
    try {
      // Ordering (subj-18): form-state dispatch first (sync), then PMH creates.
      const actions = buildSubjectiveTemplateApplyActions(template, state.fields);
      for (const action of actions) {
        dispatch(action);
      }

      if (pmhBridge && pmhTemplateHasContent(template.pmh_json)) {
        await pmhBridge.applyFromTemplate(template, {
          onSummary: (summary: TemplateApplySummary) => {
            const msg = formatApplySummary(summary, "PMH items");
            if (msg) setApplyNotice(msg);
          },
        });
      }
    } finally {
      setApplying(false);
    }
  };

  const handleSaveCurrent = async () => {
    const pmhSnapshot = pmhBridge?.snapshotForSave() ?? null;
    if (!fullSubjectiveHasContent(state.fields, pmhSnapshot)) {
      window.alert(
        "Add at least one complaint, history field, or medical history item before saving a template.",
      );
      return;
    }

    const name = window.prompt(
      "Save current subjective as template — enter a short name:",
      state.fields.complaints.find((c) => c.name.trim())?.name.trim() || "",
    );
    if (!name?.trim()) return;

    setSaving(true);
    try {
      await createRxTemplate(token, {
        name: name.trim(),
        ...buildSubjectiveTemplateSavePayload(state.fields, pmhSnapshot),
      });
      setOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const busy = applying || saving;

  return (
    <>
      <IconTooltipGroup>
        <span className="inline-flex items-center gap-0.5">
          <IconTooltip label="Save current subjective as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="subjective-template-save-trigger"
              aria-label="Save current subjective as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label={applying ? "Applying…" : "Subjective templates"}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="subjective-template-trigger"
              aria-label={applying ? "Applying template…" : "Subjective templates"}
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </span>
      </IconTooltipGroup>

      {applyNotice ? (
        <span className="text-xs text-muted-foreground" role="status">
          {applyNotice}
        </span>
      ) : null}

      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        variant="subjective"
        onApply={handleApply}
      />
    </>
  );
}
