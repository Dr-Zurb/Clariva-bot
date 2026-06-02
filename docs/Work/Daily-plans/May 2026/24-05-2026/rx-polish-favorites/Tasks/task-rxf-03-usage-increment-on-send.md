# rxf-03 · Usage-increment on Send Rx

> **Wave 1** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Backend hook: write to `doctor_drug_usage` when an Rx is sent.

| Property | Value |
|---|---|
| **Size** | S | **Model** | Auto | **Wave** | 1 | **Depends on** | rxf-01 (table) | **Blocks** | rxf-05 read-path correctness (depends on data existing) |

---

## Goal

When `POST /api/v1/appointments/:id/send-prescription` (or equivalent) succeeds, batch-UPSERT into `doctor_drug_usage` for every medicine that has a `drug_master_id`.

---

## What to do

### 1. Locate the send-Rx handler

Search for the existing send flow:

```powershell
# rg "send-prescription|sendPrescription|POST.*send" backend/src --type ts
```

Typical location: `backend/src/services/prescriptions-service.ts` or `backend/src/api/routes/appointments.ts`. Identify the function that runs after medicines persist but before the API returns 200.

### 2. Add the batched UPSERT

```ts
// After medicines persist successfully, inside the same DB transaction:
const drugMasterIds = sentMedicines
  .map((m) => m.drug_master_id)
  .filter((id): id is string => id != null);

if (drugMasterIds.length > 0) {
  await tx.none(
    `
    INSERT INTO doctor_drug_usage (doctor_id, drug_master_id, usage_count, last_used_at)
    SELECT $/doctorId/, drug_id, 1, now()
    FROM unnest($/drugIds/::uuid[]) AS drug_id
    ON CONFLICT (doctor_id, drug_master_id)
    DO UPDATE SET
      usage_count = doctor_drug_usage.usage_count + 1,
      last_used_at = EXCLUDED.last_used_at
    `,
    { doctorId, drugIds: drugMasterIds },
  );
}
```

Use the project's query-builder syntax (likely `pg-promise` / `kysely` / raw `pg`). Match the existing style of nearby queries.

### 3. Don't increment from draft-save

Verify: the auto-save endpoint (`PATCH /api/v1/prescriptions/:id`) MUST NOT trigger this UPSERT. Only the send flow does.

### 4. Don't increment for free-text drugs

The `.filter((id): id is string => id != null)` guard handles DL-2. Verify with a test: a medicine with `drug_master_id: null` does NOT appear in any UPSERT.

### 5. Tests `backend/tests/unit/services/prescriptions-send-usage.test.ts`

- "increments existing row" — pre-seed `(doctor_a, drug_x, 5, ...)`; send Rx with drug X; assert count = 6.
- "inserts new row" — no existing row; send Rx with drug Y; assert row created with count = 1.
- "ignores free-text drugs" — send Rx with one drug-master + one free-text; assert only the drug-master row touched.
- "batches per send" — send Rx with 3 unique drug-master IDs; assert one statement executed (or N statements grouped in a single transaction).
- "no-op on zero-drug send" — should never happen but guard returns cleanly.
- "draft save does NOT increment" — call the draft-save endpoint with medicines; assert `doctor_drug_usage` unchanged.

### 6. Verify

```powershell
pnpm --filter backend tsc --noEmit
pnpm --filter backend lint
pnpm --filter backend test tests/unit/services/prescriptions-send-usage.test.ts
```

---

## Acceptance gate

- [ ] Send-handler writes batched UPSERT after medicines persist.
- [ ] Same transaction as medicine persistence (atomicity).
- [ ] Free-text drugs ignored.
- [ ] Draft save doesn't increment.
- [ ] Tests pass.

---

## Anti-goals

- ❌ Don't fire from draft save.
- ❌ Don't increment per-medicine outside a transaction (race risk + half-success states).
- ❌ Don't add a `decrement` path for "unsend" / cancelled prescriptions — out of scope; capture-inbox if it matters.
- ❌ Don't add metrics / logging for individual upserts; the existing send-Rx audit log is enough.

---

## Notes

- **Transaction scope:** the UPSERT goes inside the same transaction that persists `prescription_medicines`. If anything fails (DB error, validation), the entire send rolls back — including the usage increment. This prevents "ghost usage" from failed sends.
- **Race conditions:** if a doctor sends two Rxes simultaneously (different tabs), the `ON CONFLICT DO UPDATE` arithmetic correctly accumulates both increments. Postgres serializes the conflict resolution.
