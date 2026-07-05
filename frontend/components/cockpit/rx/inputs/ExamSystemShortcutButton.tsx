"use client";

import { ArrowRight } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";

export interface ExamSystemShortcutButtonProps {
  systemId: string;
  label: string;
}

/** Opens + scrolls to a structured exam system card (e.g. Vitals → CVS). */
export function ExamSystemShortcutButton({
  systemId,
  label,
}: ExamSystemShortcutButtonProps): JSX.Element {
  const { requestFocusExamSystem } = useRxForm();
  return (
    <button
      type="button"
      onClick={() => requestFocusExamSystem(systemId)}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
      data-testid={`exam-system-shortcut-${systemId}`}
    >
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </button>
  );
}
