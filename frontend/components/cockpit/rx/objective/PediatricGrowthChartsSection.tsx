"use client";

/**
 * Collapsed expand wrapper for pediatric growth charts (obj-28).
 * Fetches demographics once; hides entirely when DOB/sex absent.
 */

import { useQuery } from "@tanstack/react-query";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  PediatricGrowthCharts,
  pediatricGrowthPreview,
  shouldOfferGrowthCharts,
} from "@/components/cockpit/rx/objective/GrowthChart";
import { getPatientById } from "@/lib/api";
import { resolveGrowthSex } from "@/lib/cockpit/growth-percentiles";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import type { VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

export interface PediatricGrowthChartsSectionProps {
  token: string;
  patientId: string | null | undefined;
  series: {
    weight: VitalTrendSeries;
    height: VitalTrendSeries;
    headCircumference: VitalTrendSeries;
  };
  trendsLoading?: boolean;
}

export function PediatricGrowthChartsSection({
  token,
  patientId,
  series,
  trendsLoading = false,
}: PediatricGrowthChartsSectionProps): JSX.Element | null {
  const enabled = Boolean(token) && Boolean(patientId);

  const demographicsQuery = useQuery({
    queryKey: queryKeys.patient(patientId ?? "").growthDemographics(),
    queryFn: async () => {
      const res = await getPatientById(token, patientId!);
      return {
        dateOfBirth: res.data.patient.date_of_birth ?? null,
        gender: res.data.patient.gender ?? null,
      };
    },
    enabled,
    staleTime: STALE.CLINICAL,
  });

  const dob = demographicsQuery.data?.dateOfBirth;
  const gender = demographicsQuery.data?.gender;
  const sex = resolveGrowthSex(gender);

  if (!enabled) return null;
  if (demographicsQuery.isLoading || trendsLoading) return null;
  if (!shouldOfferGrowthCharts(dob, gender) || !dob || !sex) return null;

  const measurementCount =
    series.weight.points.length +
    series.height.points.length +
    series.headCircumference.points.length;

  return (
    <CollapsibleContainer
      title="Pediatric growth charts"
      defaultOpen={false}
      toggleLabel="Expand pediatric growth charts"
      ariaLabel="Pediatric growth percentile charts"
      preview={
        trendsLoading
          ? "Loading…"
          : pediatricGrowthPreview(dob, gender, measurementCount)
      }
      className="border-dashed"
    >
      <PediatricGrowthCharts dateOfBirth={dob} sex={sex} series={series} />
    </CollapsibleContainer>
  );
}
