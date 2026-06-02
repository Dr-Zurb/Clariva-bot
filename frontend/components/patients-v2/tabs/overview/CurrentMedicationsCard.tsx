"use client";

import { useState } from "react";
import type { PatientCurrentMedication } from "@/types/patient";
import { OverviewCardFrame } from "./OverviewCardFrame";
import { formatShortDate } from "./overview-utils";

interface CurrentMedicationsCardProps {
  meds: PatientCurrentMedication[] | undefined;
}

const VISIBLE_LIMIT = 5;

export function CurrentMedicationsCard({ meds }: CurrentMedicationsCardProps) {
  const rows = meds ?? [];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, rows.length - VISIBLE_LIMIT);

  return (
    <OverviewCardFrame title="Current medications">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No current medications.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((m, i) => {
            const meta = [m.dose, m.frequency].filter(Boolean).join(" · ");
            return (
              <li key={`${m.drug_name}-${m.prescribed_at}-${i}`} className="text-sm">
                <p className="font-semibold">{m.drug_name}</p>
                {meta ? <p className="text-muted-foreground">{meta}</p> : null}
                <p className="text-xs text-muted-foreground">
                  since {formatShortDate(m.prescribed_at)}
                </p>
              </li>
            );
          })}
          {!expanded && hiddenCount > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                +{hiddenCount} more
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </OverviewCardFrame>
  );
}
