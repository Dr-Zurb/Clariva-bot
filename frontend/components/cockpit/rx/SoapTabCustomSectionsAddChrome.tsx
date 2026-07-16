"use client";

/**
 * Visible empty / footer chrome for Assessment & Plan custom sections —
 * mirrors Subjective's `CustomSubsectionsChrome` (+ Objective add chrome)
 * so "+ Add custom section" is discoverable without opening Manage sections.
 */

const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

export interface SoapTabCustomSectionsAddChromeProps {
  disabled?: boolean;
  sectionCount: number;
  max: number;
  emptyHint: string;
  emptyTestId: string;
  addFirstTestId: string;
  addMoreTestId: string;
  onAdd: () => void;
}

export function SoapTabCustomSectionsAddChrome({
  disabled = false,
  sectionCount,
  max,
  emptyHint,
  emptyTestId,
  addFirstTestId,
  addMoreTestId,
  onAdd,
}: SoapTabCustomSectionsAddChromeProps) {
  if (disabled) return null;

  if (sectionCount === 0) {
    return (
      <div
        className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4"
        data-testid={emptyTestId}
      >
        <p className="text-center text-sm text-muted-foreground">{emptyHint}</p>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className={ADD_CHIP_CLASS}
            data-testid={addFirstTestId}
            onClick={onAdd}
          >
            + Add custom section
          </button>
        </div>
      </div>
    );
  }

  if (sectionCount >= max) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className={ADD_CHIP_CLASS}
        data-testid={addMoreTestId}
        onClick={onAdd}
      >
        + Add custom section
      </button>
    </div>
  );
}
