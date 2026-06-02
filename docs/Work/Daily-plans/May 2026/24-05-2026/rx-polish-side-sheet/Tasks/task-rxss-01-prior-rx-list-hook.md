# rxss-01 · usePriorRxList + filter helper

> **Wave 1** of [rx-polish-side-sheet](../plan-rx-polish-side-sheet-batch.md). Pure helper + thin React wrapper.

| **Size** | S | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | rxss-02 |

---

## What to do

### 1. Pure helper `frontend/lib/cockpit/prior-rx-filter.ts`

```ts
import type { PrescriptionWithRelations } from "@/types/prescription";

export type PriorRxChip = "all" | "active-condition" | "last-30-days" | "same-diagnosis";

export interface PriorRxFilterContext {
  chip: PriorRxChip;
  search: string;
  currentDx: string;
  activeConditions: string[];
}

export function filterPriorRxList(
  rxes: PrescriptionWithRelations[],
  ctx: PriorRxFilterContext,
): PrescriptionWithRelations[] {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  return rxes.filter((rx) => {
    // chip
    switch (ctx.chip) {
      case "all":
        break;
      case "last-30-days": {
        const ts = new Date(rx.created_at).getTime();
        if (!Number.isFinite(ts) || ts < thirtyDaysAgo) return false;
        break;
      }
      case "same-diagnosis": {
        if (!ctx.currentDx.trim()) return false;
        const dx = (rx.diagnosis ?? "").toLowerCase();
        if (!dx.includes(ctx.currentDx.toLowerCase())) return false;
        break;
      }
      case "active-condition": {
        if (ctx.activeConditions.length === 0) return false;
        const dx = (rx.diagnosis ?? "").toLowerCase();
        const matches = ctx.activeConditions.some((c) =>
          dx.includes(c.toLowerCase()),
        );
        if (!matches) return false;
        break;
      }
    }

    // search — substring on any medicine name
    if (ctx.search.trim()) {
      const needle = ctx.search.toLowerCase();
      const hasMatch = (rx.medicines ?? []).some((m) =>
        (m.medicine_name ?? "").toLowerCase().includes(needle),
      );
      if (!hasMatch) return false;
    }

    return true;
  });
}

export function canEnableChip(
  chip: PriorRxChip,
  ctx: Pick<PriorRxFilterContext, "currentDx" | "activeConditions">,
): boolean {
  if (chip === "same-diagnosis") return ctx.currentDx.trim().length > 0;
  if (chip === "active-condition") return ctx.activeConditions.length > 0;
  return true;
}
```

### 2. Tests `frontend/lib/cockpit/__tests__/prior-rx-filter.test.ts`

Cover all chips + search + composition (chip AND search) + canEnableChip predicates.

### 3. Hook `frontend/hooks/usePriorRxList.ts`

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { listPrescriptionsByPatient } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";
import { filterPriorRxList, type PriorRxChip } from "@/lib/cockpit/prior-rx-filter";

export interface UsePriorRxListInput {
  patientId: string | null;
  token: string;
  chip: PriorRxChip;
  search: string;
  currentDx: string;
  activeConditions: string[];
}

export interface UsePriorRxListResult {
  all: PrescriptionWithRelations[];
  filtered: PrescriptionWithRelations[];
  isLoading: boolean;
  error?: Error;
}

export function usePriorRxList(input: UsePriorRxListInput): UsePriorRxListResult {
  const [all, setAll] = useState<PrescriptionWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!input.patientId) {
      setAll([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    listPrescriptionsByPatient(input.token, input.patientId)
      .then((rxes) => {
        if (cancelled) return;
        setAll(rxes);
        setError(undefined);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.patientId, input.token]);

  const filtered = useMemo(
    () =>
      filterPriorRxList(all, {
        chip: input.chip,
        search: input.search,
        currentDx: input.currentDx,
        activeConditions: input.activeConditions,
      }),
    [all, input.chip, input.search, input.currentDx, input.activeConditions],
  );

  return { all, filtered, isLoading, error };
}
```

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/cockpit/__tests__/prior-rx-filter.test.ts
```

---

## Acceptance gate

- [x] Helper exports work; tests all pass.
- [x] Hook fetches once per patient/token; re-filters reactively.

---

## Anti-goals

- ❌ Don't add server-side filter endpoints — client-side is fast enough (prior Rx count is small per patient, < 100 typical).
- ❌ Don't add pagination — DL-10 virtualization handles list-length perf.
- ❌ Don't introduce caching here — let consumers manage (SWR pattern in rxss-02 if needed).
