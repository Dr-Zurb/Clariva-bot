/**
 * Opt-in AI refine for an already-added Plan medicine card.
 * Enter never calls this — only the card sparkles button does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import {
  parseMedicineWithAI,
  type AiParsedMedicine,
} from "@/lib/api/medicine-parse";
import type { ChartMedAiStatus } from "@/components/ehr/chart/ChartMedAiProposal";
import {
  mergeAiParsedIntoMedicine,
  rxMedicineFromAiMedicine,
} from "@/lib/cockpit/rx-medicine-from-capture";
import { formatMedicineSigLine } from "@/lib/medicineCodes";

function refineSourceText(med: RxMedicine): string {
  const name = med.medicineName.trim();
  const sig = formatMedicineSigLine(med).trim();
  if (sig && !name.toLowerCase().includes(sig.toLowerCase())) {
    return `${name} ${sig}`.trim();
  }
  return name;
}

export function usePlanMedicineAiRefine({
  token,
  disabled,
  medicines,
  instanceIds,
  onPatch,
  onAddMedicines,
}: {
  token: string;
  disabled: boolean;
  medicines: RxMedicine[];
  instanceIds: string[];
  onPatch: (index: number, patch: Partial<RxMedicine>) => void;
  onAddMedicines: (medicines: RxMedicine[]) => void;
}) {
  const [aiStatus, setAiStatus] = useState<ChartMedAiStatus | "idle">("idle");
  const [aiMeds, setAiMeds] = useState<AiParsedMedicine[]>([]);
  const [refiningInstanceId, setRefiningInstanceId] = useState<string | null>(
    null
  );
  const [cardApplied, setCardApplied] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const resetAi = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setRefiningInstanceId(null);
    setCardApplied(false);
    setAiStatus("idle");
    setAiMeds([]);
  }, []);

  const refiningIndex = refiningInstanceId
    ? instanceIds.indexOf(refiningInstanceId)
    : -1;
  const refiningMedicine =
    refiningIndex >= 0 ? medicines[refiningIndex] : undefined;
  const refineMerge =
    refiningMedicine && aiMeds[0]
      ? mergeAiParsedIntoMedicine(refiningMedicine, aiMeds[0])
      : null;

  const runAiParse = useCallback(
    (text: string, instanceId: string) => {
      const trimmed = text.trim();
      if (!trimmed || !token || disabled) return;

      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setRefiningInstanceId(instanceId);
      setCardApplied(false);
      setAiStatus("loading");
      setAiMeds([]);

      parseMedicineWithAI(token, {
        text: trimmed,
        tier: "escalation",
        signal: controller.signal,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          setAiMeds(res.data.medicines);
          setAiStatus("ready");
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setAiStatus("error");
        });
    },
    [token, disabled]
  );

  const handleCardRefine = useCallback(
    (index: number) => {
      const med = medicines[index];
      if (!med?.medicineName.trim()) return;
      const instanceId = instanceIds[index];
      if (!instanceId) return;
      runAiParse(refineSourceText(med), instanceId);
    },
    [medicines, instanceIds, runAiParse]
  );

  const applyToRefiningCard = useCallback(
    (proposalIndex: number) => {
      const parsed = aiMeds[proposalIndex];
      const med = medicines[refiningIndex];
      if (!parsed || !med || refiningIndex < 0) return;
      const { fieldPatch, suggestedName } = mergeAiParsedIntoMedicine(
        med,
        parsed
      );
      const patch: Partial<RxMedicine> = { ...fieldPatch };
      if (suggestedName) {
        patch.medicineName = suggestedName;
        patch.drugMasterId = null;
      }
      if (Object.keys(patch).length > 0) onPatch(refiningIndex, patch);
    },
    [aiMeds, medicines, refiningIndex, onPatch]
  );

  const dropAiIndex = useCallback(
    (index: number) => {
      const remaining = aiMeds.filter((_, i) => i !== index);
      if (remaining.length === 0) resetAi();
      else setAiMeds(remaining);
    },
    [aiMeds, resetAi]
  );

  const handleApply = useCallback(
    (index: number) => {
      applyToRefiningCard(index);
      setCardApplied(true);
      dropAiIndex(index);
    },
    [applyToRefiningCard, dropAiIndex]
  );

  const handleAdd = useCallback(
    (index: number) => {
      const parsed = aiMeds[index];
      if (!parsed) return;
      onAddMedicines([rxMedicineFromAiMedicine(parsed)]);
      dropAiIndex(index);
    },
    [aiMeds, onAddMedicines, dropAiIndex]
  );

  const handleApplyAll = useCallback(() => {
    if (!cardApplied && refiningIndex >= 0 && aiMeds[0]) {
      applyToRefiningCard(0);
      const extras = aiMeds
        .slice(1)
        .map(rxMedicineFromAiMedicine)
        .filter((row) => row.medicineName.trim());
      if (extras.length > 0) onAddMedicines(extras);
    } else {
      const rows = aiMeds
        .map(rxMedicineFromAiMedicine)
        .filter((row) => row.medicineName.trim());
      if (rows.length > 0) onAddMedicines(rows);
    }
    resetAi();
  }, [
    cardApplied,
    refiningIndex,
    aiMeds,
    applyToRefiningCard,
    onAddMedicines,
    resetAi,
  ]);

  const handleRename = useCallback(() => {
    const suggestedName = refineMerge?.suggestedName;
    if (!suggestedName || refiningIndex < 0) return;
    onPatch(refiningIndex, { medicineName: suggestedName, drugMasterId: null });
  }, [refineMerge?.suggestedName, refiningIndex, onPatch]);

  return {
    aiStatus,
    aiMeds,
    refiningInstanceId,
    cardApplied,
    refineMerge,
    handleCardRefine,
    handleApply,
    handleAdd,
    handleApplyAll,
    handleRename,
    resetAi,
  };
}
