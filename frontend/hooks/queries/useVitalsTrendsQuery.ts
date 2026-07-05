"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPrescriptionsByPatient } from "@/lib/api";
import {
  buildVitalsTrendSeries,
  indexVitalsTrendSeries,
  type VitalTrendMetricKey,
  type VitalTrendSeries,
} from "@/lib/cockpit/vitals-trends";
import {
  buildCategoricalVitalTimelines,
  type CategoricalVitalTimeline,
} from "@/lib/cockpit/categorical-vitals-timeline";
import {
  buildCustomVitalTextTimelines,
  buildCustomVitalTrendSeries,
  indexCustomVitalTrendSeries,
  type CustomVitalTextTimeline,
  type CustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";

export interface UseVitalsTrendsQueryResult {
  series: VitalTrendSeries[];
  byMetric: Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>>;
  categoricalTimelines: CategoricalVitalTimeline[];
  customTrendSeries: CustomVitalTrendSeries[];
  byCustomId: Readonly<Record<string, CustomVitalTrendSeries>>;
  customTextTimelines: CustomVitalTextTimeline[];
  isLoading: boolean;
  isEmpty: boolean;
  error: Error | null;
}

/**
 * Read-only per-vital trend series for a patient (obj-25).
 * Wraps the shipped doctor-scoped per-patient prescription read — no new endpoint.
 */
export function useVitalsTrendsQuery(
  token: string,
  patientId: string | null | undefined,
): UseVitalsTrendsQueryResult {
  const enabled = Boolean(token) && Boolean(patientId);

  const query = useQuery({
    queryKey: queryKeys.patient(patientId ?? "").vitalsTrends(),
    queryFn: async () => {
      const res = await listPrescriptionsByPatient(token, patientId!);
      const prescriptions = res.data.prescriptions ?? [];
      return {
        series: buildVitalsTrendSeries(prescriptions),
        categoricalTimelines: buildCategoricalVitalTimelines(prescriptions),
        customTrendSeries: buildCustomVitalTrendSeries(prescriptions),
        customTextTimelines: buildCustomVitalTextTimelines(prescriptions),
      };
    },
    enabled,
    staleTime: STALE.CLINICAL,
  });

  const series = query.data?.series ?? buildVitalsTrendSeries([]);
  const categoricalTimelines =
    query.data?.categoricalTimelines ?? buildCategoricalVitalTimelines([]);
  const customTrendSeries =
    query.data?.customTrendSeries ?? buildCustomVitalTrendSeries([]);
  const customTextTimelines =
    query.data?.customTextTimelines ?? buildCustomVitalTextTimelines([]);
  const byMetric = useMemo(() => indexVitalsTrendSeries(series), [series]);
  const byCustomId = useMemo(
    () => indexCustomVitalTrendSeries(customTrendSeries),
    [customTrendSeries],
  );

  const isEmpty =
    enabled &&
    !query.isLoading &&
    !query.isError &&
    series.every((s) => s.points.length === 0) &&
    customTrendSeries.every((s) => s.points.length === 0) &&
    customTextTimelines.every((t) => t.points.length === 0);

  return {
    series,
    byMetric,
    categoricalTimelines,
    customTrendSeries,
    byCustomId,
    customTextTimelines,
    isLoading: enabled && query.isLoading,
    isEmpty,
    error: query.error ?? null,
  };
}
