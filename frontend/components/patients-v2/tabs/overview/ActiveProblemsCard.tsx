import { Badge } from "@/components/ui/badge";
import type { ProblemListItem } from "@/types/patient-chart";
import { OverviewCardFrame } from "./OverviewCardFrame";
import { formatShortDate } from "./overview-utils";

interface ActiveProblemsCardProps {
  problems: ProblemListItem[] | undefined;
}

function problemStatusBadge(problem: ProblemListItem): string | null {
  if (problem.episode_status) return problem.episode_status;
  if (problem.source === "recurring" && problem.occurrence_count != null) {
    return `${problem.occurrence_count}× in 6 mo`;
  }
  return null;
}

export function ActiveProblemsCard({ problems }: ActiveProblemsCardProps) {
  const rows = problems ?? [];

  return (
    <OverviewCardFrame title="Active problems">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active problems recorded.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p, i) => {
            const status = problemStatusBadge(p);
            return (
              <li key={`${p.label}-${p.source}-${i}`} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {status ? (
                      <Badge variant="secondary" className="text-xs capitalize">
                        {status.replace(/_/g, " ")}
                      </Badge>
                    ) : null}
                  </div>
                  {p.since_date ? (
                    <p className="text-xs text-muted-foreground">
                      Since {formatShortDate(p.since_date)}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCardFrame>
  );
}
