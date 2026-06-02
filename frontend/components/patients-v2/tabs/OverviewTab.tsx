"use client";

import { usePatientOverviewQuery } from "@/hooks/queries/usePatientOverviewQuery";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActiveProblemsCard } from "./overview/ActiveProblemsCard";
import { AllergiesCard } from "./overview/AllergiesCard";
import { CarePlanCard } from "./overview/CarePlanCard";
import { ChronicConditionsCard } from "./overview/ChronicConditionsCard";
import { CurrentMedicationsCard } from "./overview/CurrentMedicationsCard";
import { RecentActivityCard } from "./overview/RecentActivityCard";
import { SnapshotCard } from "./overview/SnapshotCard";
import { VitalsTrendsCard } from "./overview/VitalsTrendsCard";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface OverviewTabProps {
  patientId: string;
  token: string;
}

function OverviewSkeletonGrid() {
  const placeholders = Array.from({ length: 8 });
  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {placeholders.map((_, i) => (
        <Card key={i} className="shadow-sm">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function OverviewTab({ patientId, token }: OverviewTabProps) {
  const { data, isLoading, error, refetch } = usePatientOverviewQuery(token, patientId);

  useTabOpenedTelemetry("overview", patientId);

  if (isLoading && !data) {
    return <OverviewSkeletonGrid />;
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Failed to load patient overview";
    return (
      <div className="p-4">
        <Card className="shadow-sm">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-destructive">{message}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return <OverviewSkeletonGrid />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      <SnapshotCard snapshot={data.snapshot} />
      <VitalsTrendsCard trends={data.vitals_trends} />
      <AllergiesCard allergies={data.allergies} />
      <ChronicConditionsCard conditions={data.chronic_conditions} />
      <ActiveProblemsCard problems={data.active_problems} />
      <CurrentMedicationsCard meds={data.current_medications} />
      <CarePlanCard plan={data.care_plan} riskFlags={data.risk_flags} />
      <RecentActivityCard activity={data.recent_activity} />
    </div>
  );
}
