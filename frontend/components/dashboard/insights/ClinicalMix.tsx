"use client";

/**
 * Clinical mix widget (insights-v1 · ins-04).
 *
 * Three ranked lists — top diagnoses, medicines, investigations — as
 * de-identified `{ label, count }` rows. Consumes the shared Insights range.
 * Never renders patient names, notes, or free-text clinical narrative.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicalMixQuery } from "@/hooks/queries/useClinicalMixQuery";
import type { ClinicalMixItem } from "@/lib/api";
import { useInsightsRange } from "./InsightsRangeControl";

interface RankedListProps {
  title: string;
  items: ClinicalMixItem[];
  isLoading: boolean;
  emptyLabel: string;
  showCode?: boolean;
}

function RankedList({
  title,
  items,
  isLoading,
  emptyLabel,
  showCode = false,
}: RankedListProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ol className="space-y-2" aria-label={title}>
            {items.map((item, index) => (
              <li
                key={`${item.label}-${item.code ?? ""}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">
                  <span className="mr-2 tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  {item.label}
                  {showCode && item.code ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({item.code})
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {item.count}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

interface ClinicalMixProps {
  token: string;
}

export function ClinicalMix({ token }: ClinicalMixProps): JSX.Element {
  const { range } = useInsightsRange();
  const query = useClinicalMixQuery(token, {
    from: range.from,
    to: range.to,
  });

  const data = query.data;
  const isLoading = (query.isLoading || query.isFetching) && !data;

  const isEmpty = Boolean(
    data &&
      data.topDiagnoses.length === 0 &&
      data.topMedicines.length === 0 &&
      data.topInvestigations.length === 0,
  );

  return (
    <section className="space-y-3" aria-label="Clinical mix">
      <div>
        <h2 className="text-base font-medium text-foreground">Clinical mix</h2>
        <p className="text-sm text-muted-foreground">
          Top diagnoses, medicines, and investigations over the last{" "}
          {range.days} days
        </p>
      </div>

      {isEmpty ? (
        <p
          className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
          data-testid="clinical-mix-empty-state"
        >
          No clinical activity in the last {range.days} days
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <RankedList
            title="Top diagnoses"
            items={data?.topDiagnoses ?? []}
            isLoading={isLoading}
            emptyLabel="No diagnoses in this range."
            showCode
          />
          <RankedList
            title="Top medicines"
            items={data?.topMedicines ?? []}
            isLoading={isLoading}
            emptyLabel="No medicines in this range."
          />
          <RankedList
            title="Top investigations"
            items={data?.topInvestigations ?? []}
            isLoading={isLoading}
            emptyLabel="No investigations in this range."
          />
        </div>
      )}
    </section>
  );
}
