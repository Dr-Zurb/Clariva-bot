# Task rec-07: Migration — doctor recording attestation (versioned)

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 1 — **S, ~1.5h**

---

## Task overview

REC-D4 makes the audio mandate two-sided: a doctor accepts a **versioned six-clause attestation** before their first consult. This task lands the durable record that the gate reads. Service, endpoint and UI are rec-11's; this task ships schema + type + content-sanity test and nothing else.

The table answers exactly one question, asked on every consult start: *has this doctor accepted the currently-active policy version?*

**Estimated time:** ~1.5h
**Status:** ✅ Done 2026-08-23 — migration **210** (charter budgeted 196; live head was 209). RLS on, zero policies.
**Hard deps:** none — first task in the phase.
**Source:** REC-D4, REC2-D1, REC2-D2, REC2-D3, REC2-D4, REC2-D5.

**Change Type:**
- [x] **New feature** — new table, no existing object touched
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** `doctor_verification` (migration `183_doctor_verification.sql`) — the nearest precedent for a doctor-scoped gating table keyed 1:1 on `auth.users(id)`. `doctor_settings` (009) and `doctor_instagram` (011) share the shape. `update_updated_at_column()` from migration 001 is the reusable trigger function. `appointments.recording_consent_version` (migration 053) is the existing precedent for storing a copy-version snapshot as the defensibility pointer.
- ❌ **What's missing:** any doctor-side attestation record. There is no table, no type, no gate.
- ⚠️ **Notes:** there is **no `doctors` table** — a doctor *is* the `auth.users` row (doctor-funnel DF-D2). Key on `auth.users(id)` exactly as 183 does. Head of `backend/migrations/` at planning time is `195_appointment_start_notify_stamp.sql`; the charter budgets **196** for this file. **Re-derive it anyway** (below).

---

## Model & execution guidance

**Recommended model:** **Opus.** Mandatory — new migration, which is on the hard-rules list in `.cursor/rules/00-agent-contract.mdc` and `.cursor/rules/migrations.mdc`. Auto must not write this file.

**New chat?** **Yes.** Pre-load, in this order:

- This task file.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D4 and **§Attestation** (the six clauses; you are not rendering them here, but the version contract depends on them) and **§Migration budget**.
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — REC2-D1..D5 decision lock and the REC-D2 blocker header.
- [`MIGRATIONS_AND_CHANGE.md`](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — **read fully before writing SQL.**
- [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) **§4** — "read all previous migrations in numeric order" is a MUST, not a suggestion.
- `backend/migrations/183_doctor_verification.sql` — the full file. Header style, `auth.users` FK + `ON DELETE CASCADE`, RLS rationale block, trigger reuse, in-file reverse block, `COMMENT ON` conventions.
- `backend/migrations/053_appointments_recording_consent.sql` — the version-snapshot rationale you are mirroring.
- `backend/migrations/195_appointment_start_notify_stamp.sql` — the current head; match its header date/batch line format.
- `backend/tests/unit/migrations/183-doctor-verification-migration.test.ts` — the content-sanity test convention you are copying.

**Before writing the file, run:** `ls backend/migrations/ | sort | tail` and derive the next free number from what you actually see. Ignore the `_inspection_*.sql` file — it is not numbered. If the head is not `195`, the number is **not** 196 and the charter's budget line is stale; use the real next number and note the drift in this task's Notes section.

**Estimated turns:** 1–2.

---

## ✅ Task breakdown (hierarchical)

### 1. Pre-flight (do not skip — CODE_CHANGE_RULES §4)

- [ ] 1.1 Read prior migrations in numeric order for the objects and conventions this file depends on
  - [ ] 1.1.1 `001` — confirm `update_updated_at_column()` exists and is the shared trigger function
  - [ ] 1.1.2 `002` — the RLS conventions doc block, including the server-minted `auth.jwt() ->> 'role' = 'admin'` claim convention
  - [ ] 1.1.3 `009`, `011`, `183` — the doctor-scoped `auth.users(id)` keying pattern
  - [ ] 1.1.4 `053` — the consent-version snapshot pattern this table's `policy_version` mirrors
- [ ] 1.2 Derive the migration number from the live folder head; record the number you derived in Notes
- [ ] 1.3 Confirm no existing table, type or index name collides with the name you intend to use

### 2. The migration file

- [ ] 2.1 Create `backend/migrations/<N>_doctor_recording_attestation.sql` with a header matching 183/195: date, program + task (`recording-governance-v2` / rec-07), purpose, the REC-D4 decision reference, RLS rationale, retention/deletion note, safety note, in-file reverse block
- [ ] 2.2 Create the table with these columns and nothing more (REC2-D3 — no IP, no user-agent, no free text)
  - [ ] 2.2.1 Surrogate primary key; **`(doctor_id, policy_version)` is UNIQUE** — this is what makes re-acceptance idempotent and the whole table append-only (REC2-D2)
  - [ ] 2.2.2 `doctor_id` → `auth.users(id)` with `ON DELETE CASCADE`, matching 183's retention contract
  - [ ] 2.2.3 `policy_version` — NOT NULL text; the snapshot of the attestation version the doctor actually saw. Never rewritten
  - [ ] 2.2.4 `accepted_at` — NOT NULL timestamptz defaulting to `now()` so the DB clock is the audit timestamp, not the caller's (the `captureBookingConsent` precedent got this right and is worth copying)
  - [ ] 2.2.5 `created_at` / `updated_at` per house style
- [ ] 2.3 Index for the gate's read path: the gate looks up one doctor + the active version, so the unique constraint already covers it — **add no redundant index.** State that reasoning in a comment rather than adding one "just in case"
- [ ] 2.4 `COMMENT ON TABLE` and `COMMENT ON COLUMN policy_version` explaining append-only semantics, the REC-D4 origin, and that the version string is owner-approved (REC-D2), not agent-authored
- [ ] 2.5 Reuse `update_updated_at_column()` for the `updated_at` trigger — do not define a new function
- [ ] 2.6 Idempotent statements throughout (`CREATE TABLE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` pairs) so a re-run is a no-op
- [ ] 2.7 Document the reverse operations in-file at the foot, with the same "do not revert once rows exist" warning 183 carries

### 3. RLS (REC2-D4 — read this whole section before writing a policy)

- [ ] 3.1 Enable row-level security on the table
- [ ] 3.2 Add **no doctor-facing policy.** rec-11's endpoint is the only reader and it runs service-role, which bypasses RLS. With RLS on and no policy, a doctor holding an `authenticated` JWT gets nothing from PostgREST — which is the correct posture and needs no `auth.uid()` expression
- [ ] 3.3 Explain in the header **why** there is no `SELECT`-own policy, contrasting with 183 (which added one for defence-in-depth). The contrast is deliberate: 183 anticipated a user-scoped read; this table does not have one, and adding a policy we do not need puts an `auth.uid()` expression on the hard-rules list for no benefit
- [ ] 3.4 Add **no** doctor `INSERT` / `UPDATE` policy. 183's privilege-escalation reasoning applies with more force here: a doctor who could `PATCH` their own attestation row could self-attest past the entire gate
- [ ] 3.5 If you conclude a policy keyed on `auth.uid()` is genuinely required — **STOP.** Do not write it. Surface the reasoning and wait. Same for any `auth.jwt()`-keyed admin policy

### 4. Type + test

- [ ] 4.1 Add the row type. Prefer a new `backend/src/types/doctor-recording-attestation.ts` mirroring `backend/src/types/doctor-verification.ts` rather than extending a shared database-types module — rec-11 will import it
- [ ] 4.2 Content-sanity unit test `backend/tests/unit/migrations/<N>-doctor-recording-attestation-migration.test.ts`, matching the 183 test's assertions
  - [ ] 4.2.1 Asserts the table, every column, the unique constraint on `(doctor_id, policy_version)`, the CASCADE FK, and the trigger
  - [ ] 4.2.2 Asserts RLS is **enabled**
  - [ ] 4.2.3 Asserts there is **no** `auth.uid()` and **no** `auth.jwt()` expression anywhere in the file — this is the REC2-D4 regression guard and the most valuable line in the test
  - [ ] 4.2.4 Asserts the file contains no `ip`, `ip_address` or `user_agent` column — the REC2-D3 guard
- [ ] 4.3 Confirm exactly one new file landed in `backend/migrations/`

### 5. Verification

- [ ] 5.1 `npm run type-check` green in `backend/`
- [ ] 5.2 `npm run lint` green in `backend/`
- [ ] 5.3 New migration test green; full backend unit suite still green
- [ ] 5.4 Migration applies clean against a scratch database, and applies clean a **second** time (idempotency)
- [ ] 5.5 Record the derived migration number in Notes so rec-11 and rec-12 can reference the real number

---

## 📁 Files to create/update

```
backend/migrations/<N>_doctor_recording_attestation.sql              NEW
backend/src/types/doctor-recording-attestation.ts                   NEW
backend/tests/unit/migrations/<N>-doctor-recording-attestation-migration.test.ts   NEW
```

**Existing code status:**
- ✅ `backend/migrations/183_doctor_verification.sql` — EXISTS (complete; the pattern to mirror, do not modify)
- ✅ `backend/migrations/053_appointments_recording_consent.sql` — EXISTS (do **not** modify, do **not** add a drop; REC-D3 / REC2-D5)
- ❌ `backend/migrations/<N>_doctor_recording_attestation.sql` — MISSING (this task)
- ❌ `backend/src/types/doctor-recording-attestation.ts` — MISSING (this task)

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations in numeric order to understand schema, naming, RLS, triggers, and how the project connects to the database — [`MIGRATIONS_AND_CHANGE.md`](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **Append-only, not upsert (REC2-D2).** The uniqueness is on `(doctor_id, policy_version)`, so a doctor accumulates one immutable row per version they ever accepted. Never add an `ON CONFLICT … DO UPDATE` path that rewrites `accepted_at` or `policy_version` — that would destroy the evidence the table exists to hold.
- **No IP, no user-agent, no notes column (REC2-D3).** Every column must be operationally necessary. A governance table that accretes personal data has no erasure path and inherits the exact problem REC-D14 identifies for pause reasons.
- **No PHI, no PII beyond the doctor FK.** This table holds no patient data at all. Nothing about it should ever appear in a log line next to a patient or appointment identifier ([`COMPLIANCE.md`](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)).
- **The version string is owner-approved (REC-D2).** This migration stores a version; it does not decide what the version *is*. Do not seed a row, do not add a `DEFAULT 'v1.0'`, do not reference a specific version in a `CHECK` constraint. rec-11 wires the constant, and the owner supplies its value.
- **Additive only.** No `ALTER` on an existing table, no drop, no constraint tightening. REC2-D5 forbids column drops anywhere in this phase.
- **Migration count is one.** If this task discovers it needs a second file — for a backfill, an enum, a seed — that is a **STOP-and-surface** (REC2-D1).
- Follow [`STANDARDS.md`](../../../../../../../Reference/engineering/development/STANDARDS.md) naming: snake_case objects, `idx_<table>_<cols>` if an index is ever genuinely needed.

**DO NOT include:** code, pseudo-code, SQL fragments, or column-definition snippets in this task file. The column *names and semantics* above are the contract; the DDL is the executing agent's output.

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **Yes** — new table.
  - [ ] **RLS verified?** Must be **Yes**: RLS enabled, zero policies, service-role-only access, and no `auth.uid()` expression (REC2-D4).
- [ ] **Any PHI in logs?** Must be **No** — this table has no patient data; do not log doctor id alongside acceptance in a way that reads as clinical activity.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Yes** — `ON DELETE CASCADE` on the doctor FK means the row disappears with the account, matching 183. State this explicitly in the header.

---

## ✅ Acceptance criteria

### 1. Migration number and file

- [ ] The number was derived from `ls backend/migrations/ | sort | tail`, not copied from the charter's budget table.
- [ ] Exactly **one** new file exists in `backend/migrations/`.
- [ ] Header matches the 183/195 format: date, program/task attribution, purpose, decision reference (REC-D4), RLS rationale, retention note, safety note.
- [ ] The in-file reverse block exists and carries the "do not revert once rows exist" warning.

### 2. Schema shape

- [ ] `doctor_id` references `auth.users(id)` with `ON DELETE CASCADE`. There is no `doctors` table and none is invented.
- [ ] `(doctor_id, policy_version)` is UNIQUE.
- [ ] `policy_version` is NOT NULL with no default and no `CHECK` pinning a specific value.
- [ ] `accepted_at` is NOT NULL and defaults to the **database** clock.
- [ ] `updated_at` uses the existing `update_updated_at_column()` trigger function; no new function is defined.
- [ ] No `ip`, `ip_address`, `user_agent`, `notes` or free-text column exists (REC2-D3).
- [ ] Every statement is idempotent; a second apply is a no-op.

### 3. RLS

- [ ] RLS is enabled on the table.
- [ ] **Zero policies exist.** No `auth.uid()` expression, no `auth.jwt()` expression anywhere in the file.
- [ ] The header explains why — including the explicit contrast with 183's defence-in-depth `SELECT`-own policy and the privilege-escalation reason doctors get no write policy.
- [ ] If the agent believed a policy was needed, it stopped and surfaced instead of writing one.

### 4. Type + test

- [ ] `backend/src/types/doctor-recording-attestation.ts` exists and mirrors `doctor-verification.ts` in shape and doc-comment style.
- [ ] The content-sanity test asserts columns, unique constraint, CASCADE FK, trigger, RLS-enabled, **absence of `auth.uid()`/`auth.jwt()`**, and **absence of IP/user-agent columns**.
- [ ] Backend typecheck, lint and unit suite are green.

### 5. Nothing else moved

- [ ] `053_appointments_recording_consent.sql` is byte-identical.
- [ ] `049_consultation_sessions.sql` is byte-identical.
- [ ] No service, controller, route or frontend file was touched.

### Out of scope

- The attestation service, endpoint, constants and the six-clause copy — **rec-11**.
- The onboarding / first-consult gate UI — **rec-11**.
- Any change to consent columns, consent code, or consent routes — **rec-08 / rec-09 / rec-10**.
- Backfilling attestations for existing doctors. There is deliberately no backfill: every doctor accepts explicitly, and an implied acceptance would defeat REC-D4.
- Seeding a policy version row.

---

## Scope Guard

- **Expected files touched: 3** (migration, type, migration test). All three are new files.
- **DO NOT TOUCH:**
  - `backend/migrations/053_appointments_recording_consent.sql` and `049_consultation_sessions.sql` — no drops, no edits (REC-D3, REC2-D5).
  - Any existing migration file. This is additive-only.
  - `recording-consent-service.ts`, `validation.ts`, the consent routes, the DM funnel, the booking page — those belong to rec-08/09/10 and touching them here creates a merge collision with two parallel lanes.
  - `recording_artifact_index` (p1), `recording-pause-service.ts` (p3), `recording-escalation-service.ts` (p4).
- **Cross-layer note:** this task is deliberately single-layer (DB + one type + one test). If it starts pulling in a service or controller, that is rec-11's work leaking backward — **STOP and surface** per `.cursor/rules/00-agent-contract.mdc`.
- **Hard stops:** a second migration; any RLS policy; any `auth.uid()` or `auth.jwt()` expression; any PHI column; any column drop.

---

## Done when

One new migration file (number re-derived from the live head) creates an append-only `(doctor_id, policy_version)`-unique attestation table keyed on `auth.users(id)` with `ON DELETE CASCADE`; RLS is enabled with zero policies and no `auth.uid()` expression anywhere; there is no IP, user-agent or free-text column; the row type and content-sanity test land alongside; `053` and `049` are untouched; backend typecheck, lint and tests are green; and the derived migration number is written into this file's Notes for rec-11 and rec-12 to reference.

---

## 📝 Notes

- **Derived migration number:** **210** (`ls backend/migrations | sort -t_ -k1,1n | tail` — head was `209_patients_archived_at.sql`).
- **Charter budget said 196.** Drift of +14 because p3 took 196, p4 took 197, then billing/patients landed 198–209. Flag to rec-12's doc-drift step.

---

## 🔗 Related tasks

- [`task-rec-11-doctor-attestation-service-and-gate.md`](./task-rec-11-doctor-attestation-service-and-gate.md) — the only consumer of this table
- [`task-rec-12-close-gate-and-legal-signoff.md`](./task-rec-12-close-gate-and-legal-signoff.md) — owns the REC-D2 policy-version sign-off
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md)

---

**Last Updated:** 2026-08-17
**Pattern:** doctor-scoped gating table keyed on `auth.users(id)` (`183_doctor_verification.sql`), append-only per version
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7
