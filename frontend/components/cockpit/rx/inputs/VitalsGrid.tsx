"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  VitalField,
  VitalsExtended,
  type GhostVitals,
} from "@/components/cockpit/rx/inputs/VitalsExtended";
import { ExamSystemShortcutButton } from "@/components/cockpit/rx/inputs/ExamSystemShortcutButton";
import { VitalsMeasurementContextBar } from "@/components/cockpit/rx/inputs/VitalsMeasurementContextBar";
import {
  ManageVitalsMenu,
  resolveVitalHasDataHint,
} from "@/components/cockpit/rx/inputs/ManageVitalsMenu";
import { CustomVitalsGridFields } from "@/components/cockpit/rx/inputs/CustomVitalField";
import { BpReadingsBlock } from "@/components/cockpit/rx/inputs/BpReadingsBlock";
import { GlucoseReadingsBlock } from "@/components/cockpit/rx/inputs/GlucoseReadingsBlock";
import { HeightVitalField } from "@/components/cockpit/rx/inputs/HeightVitalField";
import {
  shouldShowWeightHeightDerivedRow,
  WeightHeightDerivedRow,
} from "@/components/cockpit/rx/inputs/WeightHeightDerivedRow";
import { useLastVisitVitals } from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import { patientDemographicsToRangeContext } from "@/components/cockpit/rx/objective/VitalTrendChart";
import { VitalTrendButton } from "@/components/cockpit/rx/objective/VitalTrendButton";
import { AllVitalTrendsDialog } from "@/components/cockpit/rx/objective/AllVitalTrendsDialog";
import {
  enrichCustomVitalTextTimelineGroups,
  enrichCustomVitalTrendGroups,
  indexCustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import { useVitalsTrendsQuery } from "@/hooks/queries/useVitalsTrendsQuery";
import { getPatientById } from "@/lib/api";
import { computeBmi } from "@/lib/cockpit/bmi";
import {
  resolveCategoricalVital,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { computeBsa } from "@/lib/cockpit/vitals-derive";
import {
  hasVisibleBpPair,
  hasVisibleGlucose,
  vitalFieldShortLabel,
  vitalGridSpan,
  vitalSparklineLabel,
  VITALS_CONTAINER_CLASS,
  VITALS_GRID_CLASS,
  VITAL_CLUSTER_GRID_CLASS,
  VITALS_GROUP_CARD_CLASS,
  VITALS_GROUP_HEADING_CLASS,
  visibleCoreMainGridKeys,
  visibleCoreSecondaryGridKeys,
} from "@/lib/cockpit/vitals-group-layout";
import { resolveVital, VITAL_ORDER, type VitalKey } from "@/lib/cockpit/vitals-schema";
import {
  expandBpClusterVisibilityKeys,
  BP_CLUSTER_MENU_KEY,
  bpClusterHasData,
  isBpClusterHidden,
  isBpClusterVisibilityKey,
  resolveBpClusterMenuLabel,
} from "@/lib/cockpit/bp-cluster";
import {
  expandPupilClusterVisibilityKeys,
  isPupilClusterVisibilityKey,
  pupilClusterHasData,
  resolvePupilClusterMenuLabel,
} from "@/lib/cockpit/pupil-cluster";
import {
  fetchVitalsHidden,
  isVitalHidden,
  resolveEffectiveVitalsHidden,
  resolveDefaultVitalsLayout,
  resolveVisibleCategoricalVitals,
  resolveVisibleVitals,
  saveVitalsHidden,
  serializeVitalsHidden,
  vitalsHiddenOverridesToPersist,
  type VitalsHiddenSet,
  type VitalVisibilityKey,
} from "@/lib/cockpit/vitals-visibility";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import type { VitalTrendMetricKey } from "@/lib/cockpit/vitals-trends";
import { buildVitalsMenuCatalog } from "@/lib/cockpit/vitals-menu-catalog";
import {
  customVitalDefsStructureKey,
  fetchCustomVitals,
  mergeCustomVitalDefs,
  saveCustomVitalsDefault,
  updateCustomVitalDef,
  type CustomVitalDef,
} from "@/lib/cockpit/vitals-custom";
import {
  applyWnlFillPlan,
  buildWnlFillPlan,
  wnlFillPlanHasTargets,
} from "@/lib/cockpit/vitals-quick-fill";

const DOCTOR_LAYOUT_AUTOSAVE_MS = 500;

const FACTORY_DEFAULT_HIDDEN = resolveEffectiveVitalsHidden({ storedHidden: [] }).hidden;

function resolveVisibilityKeyLabel(key: VitalVisibilityKey): string {
  const bpLabel = resolveBpClusterMenuLabel(key);
  if (bpLabel) return bpLabel;
  const clusterLabel = resolvePupilClusterMenuLabel(key);
  if (clusterLabel) return clusterLabel;
  if ((VITAL_ORDER as readonly string[]).includes(key)) {
    return resolveVital(key as VitalKey).label;
  }
  return resolveCategoricalVital(key as CategoricalVitalKey).label;
}

export interface VitalsGridProps {
  disabled?: boolean;
}

export function VitalsGrid({ disabled = false }: VitalsGridProps) {
  const { state, token, patientId, setField } = useRxForm();
  const ghost = useLastVisitVitals();
  const { byMetric, categoricalTimelines, customTrendSeries, customTextTimelines, isLoading } =
    useVitalsTrendsQuery(token, patientId);

  const customDefs = state.fields.vitalsCustomDefs;
  const customValues = state.fields.vitalsCustomValues;
  const hasSeededCustomRef = useRef(false);
  const lastPersistedCustomRef = useRef<string>("");

  useEffect(() => {
    if (!token || hasSeededCustomRef.current) return;
    let cancelled = false;
    void fetchCustomVitals(token)
      .then((stored) => {
        if (cancelled) return;
        hasSeededCustomRef.current = true;
        lastPersistedCustomRef.current = customVitalDefsStructureKey(stored);
        setField("vitalsCustomDefs", mergeCustomVitalDefs(state.fields.vitalsCustomDefs, stored));
      })
      .catch(() => {
        // Non-blocking — keep any defs already seeded from the prescription.
      });
    return () => {
      cancelled = true;
    };
    // Seed once on mount when the token is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const persistCustomDefs = useCallback(
    (defs: CustomVitalDef[]) => {
      if (!token) return;
      const key = customVitalDefsStructureKey(defs);
      if (key === lastPersistedCustomRef.current) return;
      void (async () => {
        try {
          const saved = await saveCustomVitalsDefault(token, defs);
          lastPersistedCustomRef.current = customVitalDefsStructureKey(saved);
        } catch {
          // Autosave failure is non-blocking — retried on the next add/remove.
        }
      })();
    },
    [token],
  );

  const handleAddCustomVital = useCallback(
    (def: CustomVitalDef) => {
      const next = mergeCustomVitalDefs([...customDefs, def], []);
      setField("vitalsCustomDefs", next);
      persistCustomDefs(next);
    },
    [customDefs, persistCustomDefs, setField],
  );

  const handleEditCustomVital = useCallback(
    (def: CustomVitalDef) => {
      const prev = customDefs.find((d) => d.id === def.id);
      const next = updateCustomVitalDef(customDefs, def);
      setField("vitalsCustomDefs", next);
      persistCustomDefs(next);
      if (prev && prev.kind !== def.kind) {
        setField("vitalsCustomValues", { ...customValues, [def.id]: null });
      }
    },
    [customDefs, customValues, persistCustomDefs, setField],
  );

  const handleRemoveCustomVital = useCallback(
    (id: string) => {
      const next = customDefs.filter((def) => def.id !== id);
      setField("vitalsCustomDefs", next);
      // Stored per-visit values are retained (V14 retain-on-remove); just drop
      // the active value so it stops contributing to this visit's payload.
      const { [id]: _dropped, ...restValues } = customValues;
      setField("vitalsCustomValues", restValues);
      persistCustomDefs(next);
    },
    [customDefs, customValues, persistCustomDefs, setField],
  );

  const handleCustomValueChange = useCallback(
    (id: string, value: number | string | null) => {
      setField("vitalsCustomValues", { ...customValues, [id]: value });
    },
    [customValues, setField],
  );

  const customCatalog = useMemo(
    () => buildVitalsMenuCatalog(customDefs),
    [customDefs],
  );

  const [storedVitalsHidden, setStoredVitalsHidden] = useState<VitalsHiddenSet | null>(null);
  const [hiddenIds, setHiddenIds] = useState<VitalsHiddenSet>(FACTORY_DEFAULT_HIDDEN);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHideKey, setPendingHideKey] = useState<VitalVisibilityKey | null>(null);
  const [pendingWnlPlan, setPendingWnlPlan] = useState<ReturnType<typeof buildWnlFillPlan> | null>(
    null,
  );
  const hasHydratedHiddenRef = useRef(false);
  const lastPersistedHiddenRef = useRef<string>("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetchVitalsHidden(token).then((hidden) => {
      if (!cancelled) setStoredVitalsHidden(hidden);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (storedVitalsHidden === null) return;
    if (hasHydratedHiddenRef.current) return;
    hasHydratedHiddenRef.current = true;

    const { hidden: initialHidden } = resolveEffectiveVitalsHidden({
      storedHidden: storedVitalsHidden,
    });
    setHiddenIds(initialHidden);
    lastPersistedHiddenRef.current = serializeVitalsHidden(
      vitalsHiddenOverridesToPersist(initialHidden),
    );
  }, [storedVitalsHidden]);

  useEffect(() => {
    if (disabled || !token || storedVitalsHidden === null) return;

    const toPersist = vitalsHiddenOverridesToPersist(hiddenIds);
    const serialized = serializeVitalsHidden(toPersist);
    if (serialized === lastPersistedHiddenRef.current) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveVitalsHidden(token, toPersist);
          lastPersistedHiddenRef.current = serializeVitalsHidden(saved);
          setStoredVitalsHidden(saved);
        } catch {
          // Autosave failure is non-blocking — doctor can retry via another toggle.
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, hiddenIds, storedVitalsHidden, token]);

  const applyToggleHidden = useCallback((key: VitalVisibilityKey) => {
    const bpKeys = expandBpClusterVisibilityKeys(key);
    const keysToToggle =
      bpKeys.length > 1 ? bpKeys : expandPupilClusterVisibilityKeys(key);
    setHiddenIds((prev) => {
      const isHidden = isBpClusterVisibilityKey(key)
        ? isBpClusterHidden(prev)
        : prev.includes(key);
      if (isHidden) {
        return prev.filter((id) => !keysToToggle.includes(id));
      }
      const next = [...prev];
      for (const clusterKey of keysToToggle) {
        if (!next.includes(clusterKey)) next.push(clusterKey);
      }
      return next;
    });
  }, []);

  const effectiveHiddenIds = useMemo(
    () =>
      storedVitalsHidden === null
        ? resolveDefaultVitalsLayout().defaultHidden
        : hiddenIds,
    [hiddenIds, storedVitalsHidden],
  );

  const visibleCategoricalKeys = useMemo(
    () => new Set(resolveVisibleCategoricalVitals({ hidden: effectiveHiddenIds })),
    [effectiveHiddenIds],
  );

  const visibleCustomDefs = useMemo(
    () =>
      customDefs.filter(
        (def) => !isVitalHidden(def.id as VitalVisibilityKey, effectiveHiddenIds),
      ),
    [customDefs, effectiveHiddenIds],
  );

  const visibleCoreCustomDefs = useMemo(
    () => visibleCustomDefs.filter((def) => def.group === "core"),
    [visibleCustomDefs],
  );

  const toggleHiddenRef = useRef<(key: VitalVisibilityKey) => void>(() => {});
  toggleHiddenRef.current = (key: VitalVisibilityKey) => {
    const effectivelyHidden =
      key === BP_CLUSTER_MENU_KEY || isBpClusterVisibilityKey(key)
        ? isBpClusterHidden(effectiveHiddenIds)
        : isVitalHidden(key, effectiveHiddenIds);

    if (!effectivelyHidden) {
      const hasData = isPupilClusterVisibilityKey(key)
        ? pupilClusterHasData(state.fields)
        : isBpClusterVisibilityKey(key)
          ? bpClusterHasData(state.fields)
          : resolveVitalHasDataHint(key, state.fields);
      if (hasData) {
        setPendingHideKey(key);
        return;
      }
      applyToggleHidden(key);
      return;
    }
    applyToggleHidden(key);
  };

  const handleToggleHidden = useCallback((key: VitalVisibilityKey) => {
    toggleHiddenRef.current(key);
  }, []);

  const visibleNumericKeys = useMemo(
    () => new Set(resolveVisibleVitals({ hidden: effectiveHiddenIds })),
    [effectiveHiddenIds],
  );

  const showBp = hasVisibleBpPair(visibleNumericKeys);
  const showGlucose = hasVisibleGlucose(visibleNumericKeys);
  const coreMainKeys = visibleCoreMainGridKeys(visibleNumericKeys);
  const coreSecondaryKeys = visibleCoreSecondaryGridKeys(visibleNumericKeys);

  const demographicsQuery = useQuery({
    queryKey: queryKeys.patient(patientId ?? "").growthDemographics(),
    queryFn: async () => {
      const res = await getPatientById(token, patientId!);
      return {
        dateOfBirth: res.data.patient.date_of_birth ?? null,
        gender: res.data.patient.gender ?? null,
      };
    },
    enabled: Boolean(token) && Boolean(patientId),
    staleTime: STALE.CLINICAL,
  });

  const rangeCtx = useMemo(
    () =>
      patientDemographicsToRangeContext(
        demographicsQuery.data?.dateOfBirth,
        demographicsQuery.data?.gender,
      ),
    [demographicsQuery.data?.dateOfBirth, demographicsQuery.data?.gender],
  );

  const enrichedByCustomId = useMemo(
    () => indexCustomVitalTrendSeries(enrichCustomVitalTrendGroups(customTrendSeries, customDefs)),
    [customTrendSeries, customDefs],
  );

  const enrichedCustomTextTimelines = useMemo(
    () => enrichCustomVitalTextTimelineGroups(customTextTimelines, customDefs),
    [customTextTimelines, customDefs],
  );

  const sparklineFor = useCallback(
    (metric: VitalTrendMetricKey, label: string) => (
      <VitalTrendButton
        metric={metric}
        byMetric={byMetric}
        label={label}
        rangeCtx={rangeCtx}
        isLoading={isLoading}
      />
    ),
    [byMetric, isLoading, rangeCtx],
  );

  const sparklineForVital = useCallback(
    (vitalKey: VitalKey, label: string) => sparklineFor(vitalKey, label),
    [sparklineFor],
  );

  const heightCm = state.fields.vitalsHtCm ?? null;
  const weightKg = state.fields.vitalsWtKg ?? null;
  const bmi = computeBmi(heightCm, weightKg);
  const bsa = computeBsa(heightCm, weightKg);

  const showWtHtDerived = shouldShowWeightHeightDerivedRow(visibleNumericKeys, bmi, bsa);

  const pendingHideLabel = pendingHideKey ? resolveVisibilityKeyLabel(pendingHideKey) : "";

  const wnlFillPlan = useMemo(
    () =>
      buildWnlFillPlan({
        fields: state.fields,
        visibleNumericKeys: visibleNumericKeys,
        showBp,
        showGlucose,
        ctx: rangeCtx,
      }),
    [rangeCtx, showBp, showGlucose, state.fields, visibleNumericKeys],
  );

  const wnlFillEnabled = !disabled && wnlFillPlanHasTargets(wnlFillPlan);

  const wnlSummaryLines = useMemo(() => {
    const plan = pendingWnlPlan ?? wnlFillPlan;
    return [
      ...plan.vitals.map((entry) => entry.summaryLine),
      ...(plan.bp ? [plan.bp.summaryLine] : []),
      ...(plan.glucose ? [plan.glucose.summaryLine] : []),
    ];
  }, [pendingWnlPlan, wnlFillPlan]);

  const requestWnlFill = useCallback(() => {
    if (!wnlFillPlanHasTargets(wnlFillPlan)) return;
    setPendingWnlPlan(wnlFillPlan);
  }, [wnlFillPlan]);

  const confirmWnlFill = useCallback(() => {
    if (!pendingWnlPlan) return;
    applyWnlFillPlan(setField, state.fields, pendingWnlPlan);
    setPendingWnlPlan(null);
  }, [pendingWnlPlan, setField, state.fields]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`${VITALS_CONTAINER_CLASS} space-y-4`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!wnlFillEnabled}
          data-testid="vitals-wnl-fill-trigger"
          onClick={requestWnlFill}
        >
          All within normal limits
        </Button>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <AllVitalTrendsDialog
            byMetric={byMetric}
            categoricalTimelines={categoricalTimelines}
            customTrendSeries={enrichCustomVitalTrendGroups(customTrendSeries, customDefs)}
            customTextTimelines={enrichedCustomTextTimelines}
            rangeCtx={rangeCtx}
            isLoading={isLoading}
            token={token}
            patientId={patientId}
          />
          <ManageVitalsMenu
            disabled={disabled}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            effectiveHiddenIds={effectiveHiddenIds}
            fields={state.fields}
            onToggleHidden={handleToggleHidden}
            catalog={customCatalog}
            onAddCustomVital={handleAddCustomVital}
            onEditCustomVital={handleEditCustomVital}
            onRemoveCustomVital={handleRemoveCustomVital}
          />
        </div>
      </div>

      <VitalsMeasurementContextBar />

      <section className={VITALS_GROUP_CARD_CLASS} data-testid="vitals-group-core">
        <h3 className={VITALS_GROUP_HEADING_CLASS}>Core</h3>
        {showBp || showGlucose ? (
          <div className={VITAL_CLUSTER_GRID_CLASS} data-testid="vitals-cluster-row">
            {showBp ? (
              <BpReadingsBlock ghost={ghost} sparklineFor={sparklineFor} rangeCtx={rangeCtx} />
            ) : null}
            {showGlucose ? (
              <GlucoseReadingsBlock ghost={ghost} sparklineFor={sparklineFor} rangeCtx={rangeCtx} />
            ) : null}
          </div>
        ) : null}
        <div className={VITALS_GRID_CLASS}>
        {coreMainKeys.map((vitalKey) =>
          vitalKey === "vitalsHtCm" ? (
            <HeightVitalField
              key={vitalKey}
              label={vitalFieldShortLabel(vitalKey)}
              rangeCtx={rangeCtx}
              ghost={ghost?.[vitalKey]}
              sparkline={sparklineForVital(vitalKey, vitalSparklineLabel(vitalKey))}
              gridSpan={vitalGridSpan(vitalKey)}
            />
          ) : (
            <VitalField
              key={vitalKey}
              vitalKey={vitalKey}
              label={vitalFieldShortLabel(vitalKey)}
              rangeCtx={rangeCtx}
              ghost={ghost?.[vitalKey]}
              sparkline={sparklineForVital(vitalKey, vitalSparklineLabel(vitalKey))}
              gridSpan={vitalGridSpan(vitalKey)}
              trailing={
                vitalKey === "vitalsHr" ? (
                  <ExamSystemShortcutButton systemId="cvs" label="Examine CVS" />
                ) : undefined
              }
            />
          ),
        )}
        {coreSecondaryKeys.map((vitalKey) => (
          <VitalField
            key={vitalKey}
            vitalKey={vitalKey}
            label={vitalFieldShortLabel(vitalKey)}
            rangeCtx={rangeCtx}
            ghost={ghost?.[vitalKey]}
            sparkline={sparklineForVital(vitalKey, vitalSparklineLabel(vitalKey))}
            gridSpan={vitalGridSpan(vitalKey)}
          />
        ))}
        {showWtHtDerived ? (
          <WeightHeightDerivedRow
            bmi={bmi}
            bsa={bsa}
            bmiSparkline={sparklineFor("bmi", "BMI")}
          />
        ) : null}
        <CustomVitalsGridFields
          defs={visibleCoreCustomDefs}
          values={customValues}
          disabled={disabled}
          byCustomTrendId={enrichedByCustomId}
          trendsLoading={isLoading}
          onChange={handleCustomValueChange}
        />
        </div>
      </section>

      <VitalsExtended
        ghost={ghost}
        rangeCtx={rangeCtx}
        sparklineFor={sparklineForVital}
        visibleKeys={visibleNumericKeys}
        visibleCategoricalKeys={visibleCategoricalKeys}
        customVitals={visibleCustomDefs}
        customVitalValues={customValues}
        onCustomVitalChange={handleCustomValueChange}
        customVitalsDisabled={disabled}
        byCustomTrendId={enrichedByCustomId}
        customTrendsLoading={isLoading}
      />

      <AlertDialog
        open={pendingWnlPlan != null}
        onOpenChange={(open) => {
          if (!open) setPendingWnlPlan(null);
        }}
      >
        <AlertDialogContent data-testid="vitals-wnl-fill-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Fill normal values?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Empty visible vitals will be set to typical normal readings:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {wnlSummaryLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmWnlFill}>Fill</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingHideKey != null}
        onOpenChange={(open) => {
          if (!open) setPendingHideKey(null);
        }}
      >
        <AlertDialogContent data-testid="hide-vital-with-data-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Hide {pendingHideLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Value is kept, just hidden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingHideKey) applyToggleHidden(pendingHideKey);
                setPendingHideKey(null);
              }}
            >
              Hide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </div>
    </TooltipProvider>
  );
}
