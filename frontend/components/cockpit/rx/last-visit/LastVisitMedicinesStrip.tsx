"use client";

import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_RX_MEDICINE,
  useRxForm,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import {
  appendLastVisitMedicines,
  formatLastVisitDate,
  formatLastVisitMedicineLabel,
  namedMedicines,
  rxMedicineFromLastVisit,
} from "@/lib/cockpit/last-visit-apply";
import { applyMode } from "@/lib/cockpit/rx-diff";

export interface LastVisitMedicinesStripProps {
  disabled?: boolean;
  medicineInstanceIds: string[];
  setMedicineInstanceIds: React.Dispatch<React.SetStateAction<string[]>>;
  generateInstanceIds: (count: number) => string[];
}

interface RepeatSnapshot {
  medicines: RxMedicine[];
  instanceIds: string[];
}

export function LastVisitMedicinesStrip({
  disabled = false,
  medicineInstanceIds,
  setMedicineInstanceIds,
  generateInstanceIds,
}: LastVisitMedicinesStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const [snapshot, setSnapshot] = useState<RepeatSnapshot | null>(null);

  const current = state.fields.medicines;
  const prior = summary?.medicines ?? [];

  const commitMedicines = useCallback(
    (next: RxMedicine[]) => {
      const list = next.length > 0 ? next : [{ ...EMPTY_RX_MEDICINE }];
      dispatch({ type: "SET_MEDICINES", medicines: list });
      setMedicineInstanceIds(generateInstanceIds(list.length));
    },
    [dispatch, generateInstanceIds, setMedicineInstanceIds]
  );

  const items = useMemo(
    () =>
      prior.map((medicine, index) => {
        const row = rxMedicineFromLastVisit(medicine);
        const already = namedMedicines(current).some(
          (m) =>
            m.medicineName.toLowerCase().trim() ===
              row.medicineName.toLowerCase().trim() &&
            m.dosage.toLowerCase().trim() === row.dosage.toLowerCase().trim()
        );
        const key = `${medicine.medicineName}-${index}`;
        return {
          key,
          label: formatLastVisitMedicineLabel(medicine),
          applied: already,
          actions:
            already || disabled
              ? []
              : [
                  {
                    label: "Repeat",
                    testId: `last-visit-medicines-item-${key}-repeat`,
                    onClick: () => {
                      setSnapshot({
                        medicines: current.map((m) => ({ ...m })),
                        instanceIds: [...medicineInstanceIds],
                      });
                      const next = applyMode(
                        namedMedicines(current),
                        [row],
                        "append"
                      );
                      const blanks = current.filter(
                        (m) => !m.medicineName.trim()
                      );
                      commitMedicines(
                        blanks.length > 0 ? [...next, ...blanks] : next
                      );
                    },
                  },
                ],
        };
      }),
    [commitMedicines, current, disabled, medicineInstanceIds, prior]
  );

  const handleRepeat = useCallback(() => {
    if (disabled || prior.length === 0) return;
    const next = appendLastVisitMedicines(current, prior);
    const currentNamed = namedMedicines(current);
    if (namedMedicines(next).length === currentNamed.length) return;
    setSnapshot({
      medicines: current.map((m) => ({ ...m })),
      instanceIds: [...medicineInstanceIds],
    });
    commitMedicines(next);
  }, [commitMedicines, current, disabled, medicineInstanceIds, prior]);

  const handleUndo = useCallback(() => {
    if (!snapshot) return;
    dispatch({ type: "SET_MEDICINES", medicines: snapshot.medicines });
    setMedicineInstanceIds(snapshot.instanceIds);
    setSnapshot(null);
  }, [dispatch, setMedicineInstanceIds, snapshot]);

  if (!summary || items.length === 0) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary=""
      items={items}
      primaryAction={
        items.some((item) => !item.applied)
          ? {
              label: "Repeat last Rx",
              onClick: handleRepeat,
              testId: "last-visit-medicines-repeat",
            }
          : undefined
      }
      undoAction={
        snapshot
          ? {
              onClick: handleUndo,
              testId: "last-visit-medicines-undo",
            }
          : undefined
      }
      disabled={disabled}
      testId="last-visit-medicines"
      actionsPlacement="start"
    />
  );
}
