import { Badge } from "@/components/ui/badge";
import type { PatientChronicCondition } from "@/types/patient-chart";
import { OverviewCardFrame } from "./OverviewCardFrame";
import { formatYear } from "./overview-utils";

interface ChronicConditionsCardProps {
  conditions: PatientChronicCondition[] | undefined;
}

export function ChronicConditionsCard({ conditions }: ChronicConditionsCardProps) {
  const rows = conditions ?? [];

  return (
    <OverviewCardFrame title="Chronic conditions">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chronic conditions recorded.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const isActive = c.archived_at == null;
            const year = formatYear(c.diagnosed_on);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <span className="font-medium">{c.condition}</span>
                  {year ? (
                    <span className="ml-2 text-muted-foreground">since {year}</span>
                  ) : null}
                </div>
                {isActive ? (
                  <Badge variant="success" className="text-xs">
                    Active
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCardFrame>
  );
}
