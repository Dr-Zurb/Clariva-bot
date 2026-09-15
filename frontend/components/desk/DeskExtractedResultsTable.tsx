import {
  formatTestResultRefRange,
} from "@/lib/cockpit/test-results";
import { visitExtractedPanelToForm } from "@/lib/cockpit/visit-extracted-labs";
import type { VisitExtractedLabPanel } from "@/types/visit-documents";
import { cn } from "@/lib/utils";

const GRID =
  "grid grid-cols-[minmax(6.5rem,1.2fr)_4.25rem_3.25rem_5.25rem_5.25rem_minmax(4.5rem,1fr)] items-center gap-x-1.5";

export function DeskExtractedResultsTable({
  panels,
}: {
  panels: readonly VisitExtractedLabPanel[];
}) {
  if (panels.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="desk-extracted-results">
      {panels.map((panel) => {
        const { rows } = visitExtractedPanelToForm(panel);
        if (rows.length === 0) return null;
        return (
          <div key={panel.report.id} className="overflow-x-auto">
            {panel.report.title ? (
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {panel.report.title}
              </p>
            ) : null}
            <div role="table" aria-label="Extracted results">
              <div
                className={cn(
                  GRID,
                  "border-b border-border/60 bg-muted px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                )}
                role="row"
              >
                <span role="columnheader">Test</span>
                <span role="columnheader">Value</span>
                <span role="columnheader">Unit</span>
                <span role="columnheader">Range</span>
                <span role="columnheader">Method</span>
                <span role="columnheader">Notes</span>
              </div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    GRID,
                    "border-b border-border/40 px-2 py-1.5 text-sm text-foreground"
                  )}
                  role="row"
                  data-testid={`desk-extracted-row-${row.id}`}
                >
                  <span role="cell" className="min-w-0 truncate">
                    {row.name}
                  </span>
                  <span role="cell" className="tabular-nums">
                    {row.value ?? "—"}
                  </span>
                  <span role="cell" className="truncate text-muted-foreground">
                    {row.unit ?? ""}
                  </span>
                  <span role="cell" className="tabular-nums text-muted-foreground">
                    {formatTestResultRefRange(row)}
                  </span>
                  <span role="cell" className="truncate text-muted-foreground">
                    {row.method ?? ""}
                  </span>
                  <span role="cell" className="min-w-0 truncate text-muted-foreground">
                    {row.notes ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
