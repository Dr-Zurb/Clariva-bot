# rxf-05 · DrugAutocomplete personal ranking

> **Status: done** (2026-05-24)

> **Wave 2** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Sort autocomplete results by `doctor_drug_usage` first; today's rules as tiebreaker.

| Property | Value |
|---|---|
| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | rxf-01 (data source) | **Blocks** | — |

---

## Goal

Personalize autocomplete results. Doctor with personal score 200 on Paracetamol sees it above Pamidronate (score 0) when typing "p".

---

## What to do

### 1. Backend service `backend/src/services/doctor-drug-usage-service.ts`

```ts
export async function listMyDrugUsage(doctorId: string): Promise<Record<string, number>> {
  const rows = await db.any(
    `SELECT drug_master_id, usage_count
     FROM doctor_drug_usage
     WHERE doctor_id = $1
     ORDER BY usage_count DESC
     LIMIT 500`,
    [doctorId],
  );
  return Object.fromEntries(rows.map((r) => [r.drug_master_id, r.usage_count]));
}
```

500-row cap protects payload size; doctors with > 500 distinct drugs are vanishingly rare, and the tail beyond 500 has zero ranking signal anyway.

### 2. Backend route `backend/src/api/routes/doctor-drug-usage.ts`

```ts
GET /api/v1/doctors/me/drug-usage  →  { [drug_master_id]: usage_count }
```

Cache-Control: `private, max-age=300` (5-minute browser cache; doctors don't add hundreds of new drugs in a session).

### 3. Frontend hook `frontend/hooks/useDoctorDrugUsage.ts`

```ts
export function useDoctorDrugUsage(token: string): {
  scores: Record<string, number>;
  isLoading: boolean;
} {
  // SWR / React Query (match project convention). Cache-key by doctor.
  // Fetch once per session; SWR's default revalidation is fine.
}
```

### 4. Modify `frontend/components/ehr/DrugAutocomplete.tsx`

Read usage scores via the hook; pass into the existing sort:

```ts
const { scores } = useDoctorDrugUsage(token);

const sortedResults = useMemo(() => {
  return rawResults.slice().sort((a, b) => {
    const aScore = scores[a.id] ?? 0;
    const bScore = scores[b.id] ?? 0;
    if (aScore !== bScore) return bScore - aScore; // personal score DESC
    // existing tiebreakers (prefix-match, alphabetical) stay below:
    return existingCompare(a, b);
  });
}, [rawResults, scores]);
```

Don't replace the existing sort — wrap it. Cold-start (empty scores) leaves ordering identical.

### 5. Tests

- `backend/tests/unit/services/doctor-drug-usage.test.ts` — list returns correct map; RLS filters cross-doctor; empty map for new doctor.
- `frontend/components/ehr/__tests__/DrugAutocomplete.test.tsx` — given scores `{drugA: 100, drugB: 0}`, drug A appears before drug B in results regardless of alphabetical order; cold-start ordering matches today's.

### 6. Verify

```powershell
pnpm --filter backend test tests/unit/services/doctor-drug-usage.test.ts
pnpm --filter frontend test components/ehr/__tests__/DrugAutocomplete.test.tsx
```

---

## Acceptance gate

- [x] Endpoint returns map keyed by drug_master_id.
- [x] 500-row cap honored.
- [x] Hook caches per-session.
- [x] Autocomplete sort prioritizes personal score.
- [x] Cold-start ordering identical to pre-batch.
- [x] Tests pass.

---

## Anti-goals

- ❌ Don't add time-decay (recently-used > long-ago-used) in v1. Capture-inbox.
- ❌ Don't surface usage counts in the autocomplete UI — silent re-rank only.
- ❌ Don't fetch per-keystroke — once per session, cached.
- ❌ Don't try to merge usage data into the drug_master query itself (cross-table join hits hot path); fetch separately + sort client-side.
