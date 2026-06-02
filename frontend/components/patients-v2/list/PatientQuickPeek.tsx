"use client";

import { useEffect, useState } from "react";
import { getPatientOverview } from "@/lib/api/patients";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  getCachedOverview,
  setCachedOverview,
} from "@/components/patients-v2/list/patientQuickPeekCache";
import type { PatientOverviewData } from "@/types/patient";

interface PatientQuickPeekProps {
  patientId: string;
  token: string;
}

export function PatientQuickPeek({ patientId, token }: PatientQuickPeekProps) {
  const [data, setData] = useState<PatientOverviewData | null>(() =>
    getCachedOverview(patientId),
  );
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedOverview(patientId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    getPatientOverview(token, patientId)
      .then((overview) => {
        if (cancelled) return;
        setCachedOverview(patientId, overview);
        setData(overview);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">Couldn&apos;t load quick-peek</p>
    );
  }

  const { snapshot, active_problems, allergies, chronic_conditions } = data;
  const problems = active_problems.slice(0, 3);
  const moreProblems = active_problems.length - problems.length;
  const allergyChips = allergies.slice(0, 3);
  const moreAllergies = allergies.length - allergyChips.length;
  const conditionChips = chronic_conditions.slice(0, 3);
  const moreConditions = chronic_conditions.length - conditionChips.length;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">{data.patient.name}</p>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          <li>Blood group: {snapshot.blood_group ?? "—"}</li>
          <li>
            Height: {snapshot.height_cm != null ? `${snapshot.height_cm} cm` : "—"} · Weight:{" "}
            {snapshot.weight_kg != null ? `${snapshot.weight_kg} kg` : "—"}
          </li>
        </ul>
      </div>

      {problems.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Active problems</p>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((p, i) => (
              <li key={`${p.label}-${i}`}>{p.label}</li>
            ))}
          </ul>
          {moreProblems > 0 ? (
            <p className="text-xs text-muted-foreground">+{moreProblems} more</p>
          ) : null}
        </div>
      ) : null}

      {allergyChips.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Allergies</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {allergyChips.map((a) => (
              <Badge key={a.id} variant="destructive" className="text-xs">
                {a.allergen}
              </Badge>
            ))}
            {moreAllergies > 0 ? (
              <span className="text-xs text-muted-foreground">+{moreAllergies}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {conditionChips.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Chronic conditions</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {conditionChips.map((c) => (
              <Badge key={c.id} variant="secondary" className="text-xs">
                {c.condition}
              </Badge>
            ))}
            {moreConditions > 0 ? (
              <span className="text-xs text-muted-foreground">+{moreConditions}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
