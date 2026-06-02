import { Badge } from "@/components/ui/badge";
import type {
  PatientCarePlan,
  PatientRiskFlag,
  PatientRiskFlagSeverity,
} from "@/types/patient";
import { OverviewCardFrame } from "./OverviewCardFrame";
import { maxSeverity, severityBannerClass } from "./overview-utils";
import { cn } from "@/lib/utils";

interface CarePlanCardProps {
  plan: PatientCarePlan | null | undefined;
  riskFlags: PatientRiskFlag[] | undefined;
}

function riskFlagVariant(severity: PatientRiskFlagSeverity): "info" | "warning" | "destructive" {
  if (severity === "danger") return "destructive";
  if (severity === "warning") return "warning";
  return "info";
}

export function CarePlanCard({ plan, riskFlags }: CarePlanCardProps) {
  const flags = riskFlags ?? [];
  const carePlan = plan ?? null;

  if (carePlan == null && flags.length === 0) {
    return (
      <OverviewCardFrame title="Care plan">
        <p className="text-sm text-muted-foreground">No active care recommendations.</p>
      </OverviewCardFrame>
    );
  }

  const bannerSeverity =
    maxSeverity(flags.map((f) => f.severity)) ??
    (carePlan?.overdue?.length ? "warning" : "info");

  return (
    <OverviewCardFrame title="Care plan">
      <div className="space-y-3">
        <div
          className={cn(
            "rounded-lg border px-3 py-3",
            severityBannerClass(bannerSeverity),
          )}
        >
          {carePlan?.next_step ? (
            <p className="text-sm font-semibold leading-snug">{carePlan.next_step}</p>
          ) : (
            <p className="text-sm font-medium">Care recommendations</p>
          )}

          {carePlan?.overdue && carePlan.overdue.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm">
              {carePlan.overdue.map((item, i) => (
                <li key={`${item}-${i}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {flags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <Badge key={f.code} variant={riskFlagVariant(f.severity)} className="text-xs">
                {f.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {carePlan?.rationale && carePlan.rationale.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
              Why these recommendations?
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              {carePlan.rationale.map((line, i) => (
                <li key={`${line}-${i}`}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </OverviewCardFrame>
  );
}
