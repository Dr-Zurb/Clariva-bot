# Task rec-21: Migration — video escalation grant bounds + patient video pause state

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 1 — **S, ~1.5h**

---

## Task overview

Give the video grant a **bounded lifetime** and give the patient a **pause state**, both on `video_escalation_audit`. Today the table records that a grant was asked for and answered; it records nothing about how long the grant lasts, whether the doctor has already extended it, or whether the patient has temporarily paused it. REC-D8 and REC-D7 need all three.

This is the **only** migration in p4 (REC4-D1). Everything else in the phase reads or writes what this task lands.

**Estimated time:** ~1.5h
**Status:** ✅ Done 2026-08-20 (schema + types + content-sanity; live CHECK probe still founder)
**Hard deps:** none. **The migration number must be re-derived from the live folder** — budget is 198, head at planning time was `195_appointment_start_notify_stamp.sql`, and other programs (p2's attestation, p3's pause codes) may land first.
**Source:** REC-D7, REC-D8, REC-D12, REC4-D1, REC4-D6, REC4-D8.

**Current state**

- ✅ `video_escalation_audit` exists (Migration 070) with `session_id`, `doctor_id`, `requested_at`, `reason`, `preset_reason_code`, `patient_response`, `responded_at`, `correlation_id`, and a response-shape CHECK pinning "response and timestamp are co-present".
- ✅ Migration 072 added `twilio_error_code`. Migration 073 added `revoked_at` + `revoke_reason` with three CHECKs: a value CHECK on `revoke_reason` (`patient_revoked` / `doctor_revert` / `system_error_fallback`), a co-presence CHECK with `revoked_at`, and a `revoke_requires_allow` CHECK.
- ✅ RLS is enabled with a participant SELECT policy and **no** client-write policies — the service role writes everything. That posture does not change here.
- ✅ `idx_video_escalation_audit_session_time` on `(session_id, requested_at DESC)` already covers the wider read rec-23 introduces.
- ❌ Nothing records grant expiry, extension consumption, patient pause state, or who initiated the request.
- ⚠️ `revoke_reason`'s CHECK has no value that honestly describes an automatic revert at grant expiry. `system_error_fallback` would be a lie (nothing failed) and `doctor_revert` would be a lie (nobody clicked). The CHECK must be widened **in this file**.

---

## Model & execution guidance

**Recommended model:** **Opus** — mandatory. New migration (agent hard-rules list), on a table carrying four interlocking CHECK constraints, one of which must be widened without loosening the other three.

**New chat?** **Yes.** Pre-load, in this order:

- This task file + [charter](../../plan-recording-governance-v2-charter.md) §Migration budget + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) decision lock.
- `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md` — **read before writing anything**, per `CODE_CHANGE_RULES.md` §4.
- `backend/migrations/070_video_escalation_audit_and_otp_window.sql` — whole file (252 lines). The table definition is L66-131; the CHECK-vs-ENUM doctrine is L21-27; the RLS block is L139-156; the comment style is L158-180.
- `backend/migrations/073_video_escalation_audit_revoked_and_dashboard_event_widen.sql` — whole file (176 lines). The three CHECKs you must not break are L89-120; the additive DROP/ADD widening pattern you should copy is L138-146.
- `backend/migrations/072_video_escalation_audit_twilio_error_code.sql` — the smallest precedent for an additive column on this table.
- `backend/migrations/195_appointment_start_notify_stamp.sql` — current header/date/rollback style.
- `backend/src/services/recording-escalation-service.ts:272-301` — the `AuditRowSnapshot` interface and the pinned `AUDIT_ROW_SELECT` constant. Both must learn the new columns or the reads will silently drop them.
- **Re-derive the number:** `ls backend/migrations/ | grep -E '^[0-9]{3}_' | sort | tail -1`. **Do not use a bare `ls … | sort | tail -1`** — `_inspection_consultation_rls.sql` is unnumbered and sorts last, so it will hand you the wrong head. The numeric head at planning time was `195_appointment_start_notify_stamp.sql`; the budget in the charter is a budget, not a reservation.
- Read the prior migrations in numeric order far enough to be sure about naming, trigger reuse and RLS conventions — this repo's rule, not a formality.

**Estimated turns:** 2–3.

**Global safety gate**

- Data touched? **Yes** — additive columns on an existing governance table. RLS verified: **no policy change**; service-role writes only, exactly as Migration 070 left it.
- PHI in logs? **No.** No new logging in this task.
- External API or AI call? **No.**
- Retention / deletion impact? **No.** Rows still cascade with `consultation_sessions`.

---

## Acceptance criteria

### 1. Migration file

- [x] 1.1 Number re-derived from the live folder (`head + 1`) and the derivation recorded in this task file's Notes. Do **not** assume 198.
- [x] 1.2 Filename describes the change in the house style, e.g. `<N>_video_escalation_grant_bounds_and_pause.sql`.
- [x] 1.3 Header matches 070/073: date, batch (`recording-governance-v2` / p4 / rec-21), purpose, rationale for each column, RLS + PHI note, reverse migration documented at the file foot.
- [x] 1.4 Every statement is idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`) so a re-run is a no-op.
- [x] 1.5 `COMMENT ON COLUMN` for every new column, in the voice of the existing comments — what it means, who writes it, what NULL means.

### 2. Columns (all additive, all nullable unless noted)

| Column | Type | Meaning |
|---|---|---|
| Grant expiry | `TIMESTAMPTZ` | When an active grant auto-reverts to audio-only. Written when the allow lands. NULL on pending / decline / timeout rows and on all legacy rows. |
| Extension stamp | `TIMESTAMPTZ` | Stamped when the doctor's single extension is consumed. Presence **is** the "already extended" flag — no boolean, no counter (REC-D8 allows exactly one). |
| Video pause state | `TIMESTAMPTZ` | Non-NULL means the grant is **currently** paused by the patient. Cleared on resume. Current state only. |
| Initiator | `TEXT` + CHECK | `doctor` or `patient`. Lets `attemptsUsed` exclude patient offers (REC-D12 / REC4-D8). |

- [x] 2.1 Grant expiry, extension stamp and pause state are nullable with no backfill — every existing row is legitimately NULL on all three.
- [x] 2.2 The initiator column leaves **no ambiguous rows**: either NOT NULL with a `doctor` default (so existing rows read correctly) or nullable with the read path documented to treat NULL as `doctor`. Pick one, state which, and make the row types agree.
- [x] 2.3 The initiator CHECK uses `TEXT + CHECK`, not `CREATE TYPE … AS ENUM`, per Migration 070's stated doctrine (L21-27).
- [x] 2.4 **No pause counter column.** Pause history is derivable from the `consultation_recording_audit` ledger, and a denormalised counter would drift from it. If a counter turns out to be genuinely necessary, that is a finding to surface — not a column to add quietly.

### 3. Widening `revoke_reason` (same file)

- [x] 3.1 Add a value describing an automatic revert at grant expiry (`grant_expired` unless a better name emerges from the existing vocabulary) to `video_escalation_audit_revoke_reason_check`, using the DROP/ADD pattern at 073 L138-146.
- [x] 3.2 The three existing values still validate; an unknown value is still rejected.
- [ ] 3.3 The co-presence CHECK (`revoked_at` ⇔ `revoke_reason`) and `revoke_requires_allow` are **untouched and still enforced** — verify by attempting an illegal row shape, not by reading the SQL.
- [x] 3.4 A pause does **not** use any revoke value and does **not** set `revoked_at` (REC4-D6). Say so in the column comment so the next reader cannot get this wrong.

### 4. Types + test

- [x] 4.1 Extend `AuditRowSnapshot` in `backend/src/services/recording-escalation-service.ts:272-291` and add the new columns to `AUDIT_ROW_SELECT` (`:300-301`). The constant exists precisely so two read paths cannot drift — keep that property.
- [x] 4.2 Extend the corresponding row type in `backend/src/types/database.ts` if `video_escalation_audit` is represented there. — **not represented; skipped.**
- [x] 4.3 Content-sanity migration test alongside the existing convention in `backend/tests/unit/migrations/` — asserts the new columns and the widened CHECK value are present in the file and that the untouched CHECKs still appear.
- [x] 4.4 Backend typecheck green.

### 5. Hard stops

- [x] 5.1 If any step appears to need an **RLS policy** change → **STOP** and surface it. Do not add a write policy "for convenience". — **none needed.**
- [x] 5.2 If any step appears to need a **second migration file** → **STOP** and surface it (REC4-D1). — **one file.**
- [x] 5.3 If any step appears to need a change to the `reason` column's NOT NULL or its 5..200 CHECK → **STOP**. That is REC4-D9, explicitly deferred. — **untouched.**

### Out of scope

- Writing to any of these columns (rec-22 writes grant expiry and the extension stamp; rec-24 writes pause state; rec-25 writes the initiator).
- The expiry worker, the extension endpoint, any service logic (rec-22).
- Any change to the derivation rules (rec-23).
- Frontend types and hooks.
- `video_otp_window`, `consultation_recording_audit`, `doctor_dashboard_events`.

---

## Scope Guard

- Expected files touched: **≤ 4** — the new migration, `recording-escalation-service.ts` (row type + select constant only), `backend/src/types/database.ts` if applicable, the migration content-sanity test.
- **DO NOT** touch any behaviour in `recording-escalation-service.ts` beyond the row type and the select constant. Not `deriveState`, not the rate-limit block, not the revoke function.
- **DO NOT** touch `recording-pause-service.ts` (p3), the replay player (p5), or `recording-track-service.ts`.
- **DO NOT** add, drop or alter an RLS policy.
- **DO NOT** create a second migration file.
- Any expansion requires explicit approval.

---

## Done when

Migration applies clean on a fresh database and on one that already has 070/072/073; re-running it is a no-op; all four pre-existing CHECKs on `video_escalation_audit` still reject illegal row shapes; the widened `revoke_reason` accepts the new auto-revert value and nothing else new; no RLS change; row types and `AUDIT_ROW_SELECT` include the new columns; backend typecheck and the content-sanity test green; the derived migration number is recorded in this file.

---

## Notes

- **Number:** **197**. Head was `196_recording_pause_reason_codes_and_auto_resume_stamps.sql` (`ls backend/migrations/ | grep -E '^[0-9]{3}_' | sort | tail -1`). Charter budget 198 unused.
- **Initiator:** `initiated_by TEXT NOT NULL DEFAULT 'doctor'` + CHECK (`doctor` | `patient`). Existing rows are doctor-initiated; no NULL-means-doctor read-path convention.
- **Auto-revert revoke reason:** `grant_expired`. rec-22 stamps this with `revoked_at` (still requires `patient_response = 'allow'`).
- **3.3 live illegal-row probe:** not run this session (no migration apply). Content-sanity test asserts the 073 shape / requires-allow CHECKs are not dropped. Apply 197, then confirm: revoke without allow fails; `revoked_at` without `revoke_reason` fails; unknown `revoke_reason` fails; `grant_expired` on an allow row succeeds.

---

## Related tasks

- [`task-rec-22-grant-expiry-auto-revert.md`](./task-rec-22-grant-expiry-auto-revert.md) — first consumer of the grant columns
- [`task-rec-23-derive-state-counter-split.md`](./task-rec-23-derive-state-counter-split.md) — first consumer of the initiator column
- [`task-rec-24-patient-video-pause-instant-kill.md`](./task-rec-24-patient-video-pause-instant-kill.md) — writes the pause state
- [Charter](../../plan-recording-governance-v2-charter.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
