"use client";

import { useMemo } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import {
  LAST_VISIT_COMPLAINT_COURSES,
  applyLastVisitCourseNote,
  complaintWithLastVisitCourse,
  findComplaintIndexOnNote,
  formatLastVisitDate,
  lastVisitCourseFromNotes,
} from "@/lib/cockpit/last-visit-apply";

export interface LastVisitComplaintsStripProps {
  disabled?: boolean;
}

export function LastVisitComplaintsStrip({
  disabled = false,
}: LastVisitComplaintsStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const current = state.fields.complaints;

  const complaints = summary?.complaints ?? [];
  const items = useMemo(
    () =>
      complaints
        .filter((c) => c.name.trim())
        .map((complaint) => {
          const index = findComplaintIndexOnNote(current, complaint);
          const existing = index >= 0 ? current[index] : undefined;
          const selected = lastVisitCourseFromNotes(existing?.notes);
          return {
            key: complaint.id,
            label: complaint.name.trim(),
            applied: index >= 0,
            actions: LAST_VISIT_COMPLAINT_COURSES.map((course) => ({
              label: course,
              pressed: selected === course,
              testId: `last-visit-complaints-item-${complaint.id}-${course}`,
              onClick: () => {
                if (disabled) return;
                if (index >= 0 && existing) {
                  dispatch({
                    type: "UPDATE_COMPLAINT",
                    index,
                    patch: {
                      notes: applyLastVisitCourseNote(existing.notes, course),
                    },
                  });
                  return;
                }
                const next = complaintWithLastVisitCourse(complaint, course);
                dispatch({ type: "ADD_COMPLAINT", complaint: next });
              },
            })),
          };
        }),
    [complaints, current, disabled, dispatch]
  );

  if (!summary || items.length === 0) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary=""
      items={items}
      disabled={disabled}
      testId="last-visit-complaints"
    />
  );
}
