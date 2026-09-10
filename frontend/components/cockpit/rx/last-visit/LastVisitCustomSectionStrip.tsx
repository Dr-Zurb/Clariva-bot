"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";
import {
  applyLastVisitCustomSection,
  findMatchingCustomSection,
  formatLastVisitDate,
  lastVisitCustomSectionAlreadyApplied,
  lastVisitCustomSectionLabel,
  lastVisitCustomSectionsWithContent,
} from "@/lib/cockpit/last-visit-apply";
import type { CustomSubsection } from "@/types/prescription";

export type LastVisitCustomScope = "subjective" | "assessment" | "plan";

export interface LastVisitCustomSectionStripProps {
  scope: LastVisitCustomScope;
  sectionId: string;
  disabled?: boolean;
}

export interface LastVisitUnmatchedCustomSectionsStripProps {
  scope: LastVisitCustomScope;
  disabled?: boolean;
}

function priorSectionsForScope(
  summary: LastVisitSummary | null,
  scope: LastVisitCustomScope
): CustomSubsection[] {
  if (!summary) return [];
  if (scope === "assessment") {
    return lastVisitCustomSectionsWithContent(summary.assessmentCustomSections);
  }
  if (scope === "plan") {
    return lastVisitCustomSectionsWithContent(summary.planCustomSections);
  }
  return lastVisitCustomSectionsWithContent(summary.customSubsections);
}

function currentSectionsForScope(
  fields: ReturnType<typeof useRxForm>["state"]["fields"],
  scope: LastVisitCustomScope
): CustomSubsection[] {
  if (scope === "assessment") return fields.assessmentCustomSections;
  if (scope === "plan") return fields.planCustomSections;
  return fields.customSubsections;
}

function applyCustomSection(
  dispatch: ReturnType<typeof useRxForm>["dispatch"],
  scope: LastVisitCustomScope,
  current: CustomSubsection[],
  prior: CustomSubsection
): void {
  const index = findMatchingCustomSection(current, prior);
  const next = applyLastVisitCustomSection(
    index >= 0 ? current[index]! : null,
    prior
  );
  if (index < 0) {
    if (scope === "assessment") {
      dispatch({ type: "ADD_ASSESSMENT_CUSTOM_SECTION", section: next });
      return;
    }
    if (scope === "plan") {
      dispatch({ type: "ADD_PLAN_CUSTOM_SECTION", section: next });
      return;
    }
    dispatch({ type: "ADD_CUSTOM_SUBSECTION", section: next });
    return;
  }
  if (scope === "assessment") {
    dispatch({
      type: "UPDATE_ASSESSMENT_CUSTOM_SECTION",
      index,
      patch: { body: next.body, children: next.children },
    });
    return;
  }
  if (scope === "plan") {
    dispatch({
      type: "UPDATE_PLAN_CUSTOM_SECTION",
      index,
      patch: { body: next.body, children: next.children },
    });
    return;
  }
  dispatch({
    type: "UPDATE_CUSTOM_SUBSECTION",
    index,
    patch: { body: next.body, children: next.children },
  });
}

export function LastVisitCustomSectionStrip({
  scope,
  sectionId,
  disabled = false,
}: LastVisitCustomSectionStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const current = currentSectionsForScope(state.fields, scope);
  const prior = priorSectionsForScope(summary, scope).find((section) => {
    const match = findMatchingCustomSection(current, section);
    return match >= 0 && current[match]?.id === sectionId;
  });
  if (!summary || !prior) return null;
  const existing = current.find((section) => section.id === sectionId);
  const applied = lastVisitCustomSectionAlreadyApplied(existing, prior);
  const label = lastVisitCustomSectionLabel(prior);

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary=""
      items={[
        {
          key: prior.id,
          label,
          applied,
          actions: applied
            ? []
            : [
                {
                  label: "Add",
                  testId: `last-visit-custom-${scope}-${sectionId}-add`,
                  onClick: () => {
                    if (disabled) return;
                    applyCustomSection(dispatch, scope, current, prior);
                  },
                },
              ],
        },
      ]}
      disabled={disabled}
      testId={`last-visit-custom-${scope}-${sectionId}`}
    />
  );
}

export function LastVisitUnmatchedCustomSectionsStrip({
  scope,
  disabled = false,
}: LastVisitUnmatchedCustomSectionsStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const current = currentSectionsForScope(state.fields, scope);
  const unmatched = priorSectionsForScope(summary, scope).filter(
    (section) => findMatchingCustomSection(current, section) < 0
  );
  if (!summary || unmatched.length === 0) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary=""
      items={unmatched.map((section) => ({
        key: section.id,
        label: `${section.title.trim() || "Untitled section"} · ${lastVisitCustomSectionLabel(section)}`,
        actions: [
          {
            label: "Add",
            testId: `last-visit-custom-${scope}-unmatched-${section.id}-add`,
            onClick: () => {
              if (disabled) return;
              applyCustomSection(dispatch, scope, current, section);
            },
          },
        ],
      }))}
      disabled={disabled}
      testId={`last-visit-custom-${scope}-unmatched`}
    />
  );
}
