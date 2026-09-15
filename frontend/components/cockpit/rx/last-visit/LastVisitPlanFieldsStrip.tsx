"use client";

import { useMemo } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import { planPhraseAlreadyPresent } from "@/lib/cockpit/plan-quick-picks";
import {
  appendLastVisitAdvice,
  appendLastVisitInvestigation,
  formatLastVisitDate,
  formatLastVisitFollowUp,
  investigationAlreadyOnNote,
  lastVisitFollowUpAlreadyApplied,
  lastVisitInvestigationOrders,
  lastVisitInvestigationsHeadline,
} from "@/lib/cockpit/last-visit-apply";

export interface LastVisitPlanFieldStripProps {
  disabled?: boolean;
}

export function LastVisitInvestigationsStrip({
  disabled = false,
}: LastVisitPlanFieldStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const current = state.fields.investigationsOrders;
  const orders = lastVisitInvestigationOrders(summary?.investigationsOrders);

  const items = useMemo(
    () =>
      orders.map((order, index) => {
        const applied = investigationAlreadyOnNote(current, order);
        return {
          key: `${order}-${index}`,
          label: order,
          applied,
          actions: applied
            ? []
            : [
                {
                  label: "Repeat",
                  testId: `last-visit-investigations-item-${index}-repeat`,
                  onClick: () => {
                    if (disabled) return;
                    setField(
                      "investigationsOrders",
                      appendLastVisitInvestigation(current, order)
                    );
                  },
                },
              ],
        };
      }),
    [current, disabled, orders, setField]
  );

  if (!summary || items.length === 0) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary={lastVisitInvestigationsHeadline(orders)}
      items={items}
      disabled={disabled}
      testId="last-visit-investigations"
    />
  );
}

export function LastVisitAdviceStrip({
  disabled = false,
}: LastVisitPlanFieldStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = summary?.advice?.trim() ?? "";
  const current = state.fields.advice;
  const applied = Boolean(prior) && planPhraseAlreadyPresent(current, prior);

  if (!summary || !prior) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary={prior.length > 48 ? `${prior.slice(0, 45)}…` : prior}
      items={[
        {
          key: "advice",
          label: prior,
          applied,
          actions: applied
            ? []
            : [
                {
                  label: "Add",
                  testId: "last-visit-advice-add",
                  onClick: () => {
                    if (disabled) return;
                    setField("advice", appendLastVisitAdvice(current, prior));
                  },
                },
              ],
        },
      ]}
      disabled={disabled}
      testId="last-visit-advice"
    />
  );
}

export function LastVisitFollowUpStrip({
  disabled = false,
}: LastVisitPlanFieldStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const label = summary
    ? formatLastVisitFollowUp({
        followUp: summary.followUp,
        followUpValue: summary.followUpValue,
        followUpUnit: summary.followUpUnit,
      })
    : null;
  const applied = summary
    ? lastVisitFollowUpAlreadyApplied(
        {
          followUp: state.fields.followUp,
          followUpValue: state.fields.followUpValue,
          followUpUnit: state.fields.followUpUnit,
        },
        {
          followUp: summary.followUp,
          followUpValue: summary.followUpValue,
          followUpUnit: summary.followUpUnit,
        }
      )
    : true;

  if (!summary || !label) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary={label}
      items={[
        {
          key: "follow-up",
          label,
          applied,
          actions: applied
            ? []
            : [
                {
                  label: "Use",
                  testId: "last-visit-follow-up-use",
                  onClick: () => {
                    if (disabled) return;
                    setField("followUpValue", summary.followUpValue);
                    setField("followUpUnit", summary.followUpUnit);
                    setField("followUp", summary.followUp ?? "");
                  },
                },
              ],
        },
      ]}
      disabled={disabled}
      testId="last-visit-follow-up"
    />
  );
}
