"use client";

import { AnalyteTrendButton } from "@/components/cockpit/rx/objective/AnalyteTrendButton";
import type {
  AnalyteTrendSeries,
  ResultsDateGroup,
  ResultsFlowsheet as ResultsFlowsheetModel,
} from "@/lib/cockpit/results-flowsheet";
import { cn } from "@/lib/utils";

function sectionIdForDateKey(dateKey: string): string {
  return dateKey || "undated";
}

export interface ResultsFlowsheetProps {
  sheet: ResultsFlowsheetModel;
  selectedDateKey: string;
  formatDateHeading: (dateKey: string) => string;
  onSelectDate: (dateKey: string) => void;
  onOpenCell: (dateKey: string, rowId: string | null) => void;
  disabled?: boolean;
  trendByKey?: ReadonlyMap<string, AnalyteTrendSeries>;
  trendGroups?: readonly ResultsDateGroup[];
}

export function ResultsFlowsheet({
  sheet,
  selectedDateKey,
  formatDateHeading,
  onSelectDate,
  onOpenCell,
  disabled = false,
  trendByKey,
  trendGroups = [],
}: ResultsFlowsheetProps) {
  const latestDateKey = sheet.dateKeys.find((key) => Boolean(key)) ?? sheet.dateKeys[0] ?? "";

  return (
    <div className="overflow-x-auto" data-testid="test-results-flowsheet">
      <table className="w-full min-w-[20rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="sticky left-0 z-[1] bg-muted/30 px-2 py-1.5 text-left">
              Test
            </th>
            {sheet.dateKeys.map((dateKey) => {
              const heading = formatDateHeading(dateKey);
              const sectionId = sectionIdForDateKey(dateKey);
              const selected = selectedDateKey === dateKey;
              const latest = dateKey === latestDateKey;
              return (
                <th key={sectionId} scope="col" className="px-1 py-1.5 text-center font-medium">
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 normal-case tracking-normal",
                      selected && "bg-primary/10 font-semibold text-foreground",
                      !selected && latest && "text-foreground",
                      !selected && !latest && "hover:bg-muted/60",
                    )}
                    aria-label={`Show ${heading} in compare`}
                    data-testid={`test-results-flowsheet-col-${sectionId}`}
                  >
                    {heading}
                    {latest ? (
                      <span className="ml-1 font-normal normal-case text-[10px] text-muted-foreground">
                        latest
                      </span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border/40"
              data-testid={`test-results-flowsheet-row-${row.key}`}
            >
              <th
                scope="row"
                className="sticky left-0 z-[1] bg-background px-2 py-1.5 text-left font-medium text-foreground"
              >
                <span className="inline-flex items-center gap-1">
                  {trendByKey?.get(row.key) ? (
                    <AnalyteTrendButton
                      series={trendByKey.get(row.key)!}
                      currentGroups={trendGroups}
                    />
                  ) : null}
                  <span>{row.name}</span>
                  {row.unit ? (
                    <span className="font-normal text-muted-foreground">{row.unit}</span>
                  ) : null}
                </span>
              </th>
              {row.cells.map((cell, index) => {
                const dateKey = sheet.dateKeys[index] ?? "";
                const sectionId = sectionIdForDateKey(dateKey);
                const selected = selectedDateKey === dateKey;
                const latest = dateKey === latestDateKey;
                const label = cell?.value?.trim() || "—";
                return (
                  <td
                    key={`${row.key}-${sectionId}`}
                    className={cn(
                      "px-1 py-1 text-center tabular-nums",
                      (selected || latest) && "bg-primary/[0.04]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenCell(dateKey, cell?.rowId ?? null)}
                      className={cn(
                        "w-full rounded px-1 py-0.5",
                        cell?.value ? "text-foreground" : "text-muted-foreground",
                        !disabled && "hover:bg-muted/70",
                      )}
                      aria-label={
                        cell?.value
                          ? `${row.name} on ${formatDateHeading(dateKey)}: ${label}`
                          : `No ${row.name} on ${formatDateHeading(dateKey)}`
                      }
                      data-testid={`test-results-flowsheet-cell-${sectionId}-${row.key}`}
                    >
                      {label}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
