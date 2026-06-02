# Task 34: Per-country / per-specialty regulatory retention policy table + nightly TTL job

## 19 April 2026 — Plan [Recording governance foundation](../Plans/plan-02-recording-governance-foundation.md) — Phase E (Decision 4 LOCKED)

---

## Task overview

Decision 4 in the master plan locked **patient self-serve TTL = 90 days** and **doctor / regulatory retention = indefinite (subject to local law)**. Realising that doctrine requires two things this codebase doesn't have today:

1. A **policy table** that says, per country + specialty, how long we must keep clinical recordings before we're allowed to hard-delete. India-day-one means at least: general medicine (~3 yr), pediatrics (~21 yr — minor's age + statute of limitations), gynecology (~7 yr). International fallback row for everywhere else (~7 yr).
2. A **two-phase archival worker** that runs nightly:
   - **Phase 1 — hide-from-patient at 90 days.** Marks the artifact `patient_self_serve_visible = false` so Plan 07's replay player 404s patient-side requests; doctor-side access continues unaffected.
   - **Phase 2 — hard-delete at retention-years end.** Removes the underlying object from storage, writes to `archival_history`, and removes any matching entries from `signed_url_revocation` (the prefix is moot once the object is gone).

Both phases share the same worker so the rules sit colocated; both have a **dry-run mode** (`--dry-run` CLI flag, also exposed via env) that logs what *would* happen without mutating anything. Dry-run output drives the ops-dashboard surface "next 7 days of pending hide / delete actions" — the safety check that lets ops catch a bad seed before it deletes something it shouldn't.

This is the **highest-risk task in Plan 02**: a wrong seed value either over-deletes (compliance failure, doctor cannot produce records under regulator subpoena) or never deletes (storage cost + DPDP "data minimisation" issue + signal that the worker is broken). Owner-signed-off legal review of seed values is **non-negotiable** before merge.

This is the Plan 02 task that ships **after Task 27** and **in parallel with Task 33**. It must land before Plan 04 / 05 ship, because every artifact those plans produce will be born under this policy.

**Estimated time:** ~4 hours (excluding the legal-review wait time, which is not engineering hours)

**Status:** Not started — **gated on owner-confirmed legal review of seed values**

**Depends on:**
- **Soft:** Task 27 (`appointments.recording_consent_*` exists; the worker checks consent before assuming it can hold artifacts at all).
- **Soft:** Task 33 (`signed_url_revocation` exists; the hard-delete phase cleans up matching prefixes after deletion). If Task 33 hasn't shipped yet, this task can ship without the cleanup half — add a TODO comment and follow up.
- **Hard:** Plan 01 Task 15 (`consultation_sessions.actual_ended_at` exists — that's the column the worker reads to compute "is this artifact past its 90-day TTL?").

**Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md)

---

## Acceptance criteria

- [ ] **Migration `0NN_regulatory_retention_policy.sql`** ships:
  ```sql
  CREATE TABLE IF NOT EXISTS regulatory_retention_policy (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code             TEXT        NOT NULL,                       -- ISO 3166-1 alpha-2; '*' = fallback
    specialty                TEXT        NOT NULL,                       -- specialty key; '*' = any-specialty within country
    retention_years          INT         NOT NULL CHECK (retention_years > 0),
    patient_self_serve_days  INT         NOT NULL DEFAULT 90 CHECK (patient_self_serve_days > 0),
    source                   TEXT        NOT NULL,                       -- regulator citation or memo URL
    effective_from           DATE        NOT NULL,
    effective_until          DATE,                                        -- NULL = currently active
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (country_code, specialty, effective_from)
  );

  CREATE INDEX IF NOT EXISTS idx_retention_policy_lookup
    ON regulatory_retention_policy (country_code, specialty, effective_from DESC);
  ```
  RLS enabled, service-role read/write only. The `effective_until` column lets us version a policy without losing the audit trail of what was in force when.
- [ ] **Migration `0NN_recording_artifact_index.sql`** ships (Plan 02 open question #2 — recommendation: dedicated table, accepted):
  ```sql
  CREATE TABLE IF NOT EXISTS recording_artifact_index (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id                  UUID        NOT NULL REFERENCES consultation_sessions(id) ON DELETE RESTRICT,
    artifact_kind               TEXT        NOT NULL,                    -- 'audio_composition' | 'video_composition' | 'transcript' | 'chat_export'
    storage_uri                 TEXT        NOT NULL,                    -- e.g. 's3://recordings/patient_xxx/sess_yyy/audio.mp4'
    bytes                       BIGINT,
    patient_self_serve_visible  BOOLEAN     NOT NULL DEFAULT TRUE,
    patient_self_serve_hidden_at TIMESTAMPTZ,
    hard_deleted_at             TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, artifact_kind, storage_uri)
  );

  CREATE INDEX IF NOT EXISTS idx_recording_artifact_session
    ON recording_artifact_index(session_id);
  CREATE INDEX IF NOT EXISTS idx_recording_artifact_visibility_hidden_at
    ON recording_artifact_index(patient_self_serve_hidden_at)
    WHERE patient_self_serve_visible = FALSE AND hard_deleted_at IS NULL;
  ```
  Plans 04 / 05 / 07 / 08 INSERT one row per artifact they produce. The `patient_self_serve_visible` flag is what the replay player (Plan 07) reads to decide if the patient sees the artifact in their history.
- [ ] **Migration `0NN_archival_history.sql`** ships:
  ```sql
  CREATE TABLE IF NOT EXISTS archival_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id     UUID        NOT NULL,                                -- reference to recording_artifact_index.id (no FK; that row is gone)
    session_id      UUID        NOT NULL,                                -- denormalised; survives session deletion too
    artifact_kind   TEXT        NOT NULL,
    storage_uri     TEXT        NOT NULL,
    bytes           BIGINT,
    deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deletion_reason TEXT        NOT NULL,                                -- e.g. 'retention_expired_country=IN_specialty=*_years=3'
    policy_id       UUID                                                 -- regulatory_retention_policy.id at time of deletion (no FK; policy row may be archived too)
  );

  CREATE INDEX IF NOT EXISTS idx_archival_history_session ON archival_history(session_id);
  CREATE INDEX IF NOT EXISTS idx_archival_history_deleted_at ON archival_history(deleted_at DESC);
  ```
  This table is **append-only and never deleted**. It's our audit trail of every artifact we've removed from storage and why.
- [ ] **Seed migration `0NN_regulatory_retention_policy_seed.sql`** ships with these initial rows:
  ```sql
  INSERT INTO regulatory_retention_policy (country_code, specialty, retention_years, patient_self_serve_days, source, effective_from) VALUES
    ('IN', '*',          3,  90, 'Indian Medical Council Regulations 2002 §1.3.1 — general baseline (3 yr from last visit)', '2026-04-19'),
    ('IN', 'pediatrics', 21, 90, 'IMC Regulations + Limitation Act for minors — retain until age 21 of patient', '2026-04-19'),
    ('IN', 'gynecology', 7,  90, 'Practice norm; verify per state. Owner to confirm.', '2026-04-19'),
    ('*',  '*',          7,  90, 'International conservative fallback', '2026-04-19')
  ON CONFLICT (country_code, specialty, effective_from) DO NOTHING;
  ```
  **Every value above is illustrative.** The owner MUST confirm exact retention years against current Indian regulator guidance + owner's chosen international stance before this seed migration merges. Wrong values here are a compliance failure either direction.
- [ ] **`backend/src/services/regulatory-retention-service.ts`** (NEW) exporting:
  ```ts
  export async function resolveRetentionPolicy(input: {
    countryCode: string;
    specialty:   string;
    asOf?:       Date;     // defaults to now()
  }): Promise<{
    retentionYears:        number;
    patientSelfServeDays:  number;
    source:                string;
    policyId:              string;
  }>;
  ```
  Lookup precedence: (1) exact `(countryCode, specialty)`, (2) `(countryCode, '*')`, (3) `('*', '*')` fallback. Throws `InternalError` if even the fallback row is missing — the seed is the safety net.
- [ ] **`backend/src/workers/recording-archival-worker.ts`** (NEW) with two phases:
  ```ts
  export async function runHidePhase(input: {
    dryRun:        boolean;
    correlationId: string;
  }): Promise<{ candidates: number; hidden: number }>;

  export async function runHardDeletePhase(input: {
    dryRun:        boolean;
    correlationId: string;
  }): Promise<{ candidates: number; deleted: number; bytesFreed: number }>;
  ```
  - **Hide phase** SELECTs from `recording_artifact_index` joined to `consultation_sessions` joined to `appointments` joined to `doctors` (for `country_code` + `specialty`); for every artifact where `patient_self_serve_visible = TRUE AND hard_deleted_at IS NULL AND consultation_sessions.actual_ended_at < now() - resolveRetentionPolicy(...).patientSelfServeDays`, sets `patient_self_serve_visible = FALSE` and `patient_self_serve_hidden_at = now()`.
  - **Hard-delete phase** SELECTs candidates where `consultation_sessions.actual_ended_at < now() - resolveRetentionPolicy(...).retentionYears` AND `hard_deleted_at IS NULL`; for each: deletes the object from storage (Supabase Storage / S3 — wrap in `storage-service.ts#deleteObject`), INSERTs `archival_history` row, sets `hard_deleted_at = now()` on the index row, optionally `DELETE FROM signed_url_revocation WHERE url_prefix LIKE artifact.storage_uri || '%'`.
  - Both phases support `dryRun` — when `true`, runs the SELECT but logs the candidates instead of mutating. Dry-run output is structured (`event: 'archival_dry_run', phase: 'hide'|'delete', count, sample: [...]`) for ops dashboard ingestion.
- [ ] **Cron driver:** `backend/src/workers/recording-archival-cron.ts` (or extend the existing nightly cron entry-point) calls both phases nightly. Hide phase runs first (idempotent, safe even with mistakes — visibility flag is reversible). Hard-delete phase runs second, ALWAYS in dry-run mode unless `env.ARCHIVAL_HARD_DELETE_ENABLED === 'true'`. Default to dry-run-only for production for the first 30 days post-deploy. Document the env-flag flip ritual in this task's Notes.
- [ ] **Env vars** added to `backend/src/config/env.ts`:
  - `ARCHIVAL_HARD_DELETE_ENABLED` (default `'false'`) — gates the hard-delete phase.
  - `ARCHIVAL_DRY_RUN_REPORT_DAYS` (default `7`) — how many days of upcoming candidates the dry-run reports.
- [ ] **Ops dashboard surface:** new admin route `GET /api/v1/admin/archival-preview?days=7` returns:
  ```ts
  {
    asOf: string;
    hidePhase:   { candidates: Array<{ sessionId: string; artifactKind: string; ageDays: number; policy: { country: string; specialty: string; selfServeDays: number } }> };
    deletePhase: { candidates: Array<{ sessionId: string; artifactKind: string; ageDays: number; policy: { country: string; specialty: string; retentionYears: number } }> };
  }
  ```
  Backed by the dry-run worker. Auth: admin role only. Frontend admin page is out of scope here (separate small follow-up); the API is what unblocks the safety review loop.
- [ ] **Tests:**
  - `backend/tests/unit/services/regulatory-retention-service.test.ts` — exact lookup, country-fallback, global fallback, missing fallback throws.
  - `backend/tests/unit/workers/recording-archival-worker.test.ts` — hide phase identifies right candidates, dry-run does not mutate, idempotent on second run, hard-delete phase respects retention years per-policy, hard-delete writes archival_history, hard-delete is gated by `ARCHIVAL_HARD_DELETE_ENABLED`.
  - `backend/tests/unit/migrations/seed-regulatory-retention.test.ts` — verifies seed migration is idempotent (`ON CONFLICT DO NOTHING`).
- [ ] **Type-check + lint clean.** All migrations apply forward + reverse. **Owner-signed-off legal-review note attached to PR body before merge** (PR template should require it).

---

## Out of scope

- Plan 07's replay player. Plan 07 reads `recording_artifact_index.patient_self_serve_visible`; this task only writes that flag.
- Plan 08's video-vs-audio differentiation in `access_type`. The `recording_access_audit` table from Plan 02 already exists; this task does not touch it.
- Doctor-facing UI for "your recording was hidden from patient self-serve today." Not needed in v1 — ops dashboard preview API is enough; doctors can pull a recording via existing dashboard regardless of patient-visibility flag.
- A "restore deleted artifact" path. Once `hard_deleted_at` is set, the artifact is gone from storage. Restoring would require backups, which is a separate disaster-recovery plan. Out of scope.
- Multi-region storage residency rules ("Indian patients' recordings must stay in `ap-south-1`"). That's a separate plan touching storage configuration, not retention policy.
- Per-doctor override of the policy ("this doctor wants to retain longer than the regulator requires"). Possible v2 addition; not in scope.
- A frontend admin page for the archival preview. Just the API; UI is a small follow-up.

---

## Files expected to touch

**Backend (migrations):**

- `backend/migrations/0NN_regulatory_retention_policy.sql` — new
- `backend/migrations/0NN_recording_artifact_index.sql` — new
- `backend/migrations/0NN_archival_history.sql` — new
- `backend/migrations/0NN_regulatory_retention_policy_seed.sql` — new

**Backend (code):**

- `backend/src/services/regulatory-retention-service.ts` — new
- `backend/src/workers/recording-archival-worker.ts` — new
- `backend/src/workers/recording-archival-cron.ts` — new (or extend existing nightly cron entry)
- `backend/src/config/env.ts` — add `ARCHIVAL_HARD_DELETE_ENABLED`, `ARCHIVAL_DRY_RUN_REPORT_DAYS`
- `backend/src/routes/admin.ts` (or wherever admin routes live) — `GET /api/v1/admin/archival-preview`
- `backend/src/services/storage-service.ts` — add `deleteObject(uri: string): Promise<void>` if it doesn't already exist (it likely does — verify before adding)

**Tests:**

- `backend/tests/unit/services/regulatory-retention-service.test.ts` — new
- `backend/tests/unit/workers/recording-archival-worker.test.ts` — new
- `backend/tests/unit/migrations/seed-regulatory-retention.test.ts` — new

---

## Notes / open decisions

1. **Seed values are illustrative — owner must legal-review.** Pediatrics in India is the trickiest: "retain until patient is 21" requires knowing the patient's DOB at retention-check time, which means the worker can't just use `consultation_sessions.actual_ended_at + 21 years` — it must compute `patient.date_of_birth + 21 years`. Document this exception in `regulatory-retention-service.ts` and either (a) hard-code the pediatric branch, or (b) fold "patient-DOB-bound retention" into the policy table schema (extra column `retention_until_age INT`). Recommendation: (b) is more general and future-proof; ship it in v1.
2. **Country + specialty come from where?** `country_code` from `doctors.country_code` (today: maybe missing — check schema, may need an additive migration to backfill from clinic locale). `specialty` from `doctors.specialty` (or the equivalent column today). If neither is set, fall back to `('*', '*')` and log a `retention_policy_fallback_used` event — that's a data-quality signal, not a worker failure.
3. **Hard-delete is dry-run-only by default for the first 30 days.** Operationally: ship the worker with `ARCHIVAL_HARD_DELETE_ENABLED=false` in production. After 30 days of stable dry-run output (i.e. zero unexpected candidates surfacing), flip the env var. Document this ritual in this task's PR description so the on-call rotation knows when to flip the flag.
4. **What happens to an artifact whose policy retroactively shortens?** A policy bump from 7 yr → 5 yr means some artifacts that *would* have stayed are now eligible for delete. The worker uses **the currently-effective policy at run-time** — i.e. it always reads the latest policy. That's the simplest doctrine; document it. Owner can decide later whether to grandfather existing artifacts under the policy in force at session-end (would require a `policy_id` column on `recording_artifact_index` — additive, can ship later if needed).
5. **The hide phase is reversible.** Toggling `patient_self_serve_visible = TRUE` un-hides; useful for support-driven exceptions. Add an admin route `POST /api/v1/admin/recording-artifacts/:id/restore-visibility` in a follow-up task — not in v1 scope but document as a known-good path.
6. **Storage deletion is irreversible.** Unlike the hide phase, hard-delete is final. The worker should re-verify `hard_deleted_at IS NULL` inside the same transaction as the storage call, with a row-level lock — defense against double-delete attempts under concurrent cron runs.
7. **Coordination with Task 33's revocation list:** if a patient deleted their account on day 5 and an artifact's regulatory retention is 7 yr, the artifact stays in storage for 7 yr but the URL prefix is in `signed_url_revocation` for that whole time — Plan 07's player 404s every patient request. After hard-delete, this task `DELETE`s the matching `signed_url_revocation` rows (point 1 of the storage-cleanup section). Document this interaction in `regulatory-retention-service.ts`.
8. **Bytes-tracking is informational, not load-bearing.** `recording_artifact_index.bytes` and `archival_history.bytes` exist so ops can answer "how much storage did we free this month?" Plans 04 / 05 / 07 / 08 should populate it where cheap; if a plan can't, leaving it `NULL` is fine.

---

## References

- **Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md) — Migration E + Task 34 service deliverables + Open question #2.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED entry; "regulatory retention overrides patient TTL" doctrine.
- **Plan 01 Task 15 — `consultation_sessions.actual_ended_at`:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)
- **Task 33 — `signed_url_revocation` table:** [task-33-account-deletion-revocation-list.md](./task-33-account-deletion-revocation-list.md)
- **Indian Medical Council Regulations 2002 §1.3.1:** owner to attach exact citation + URL to PR body.
- **Limitation Act for minors (India) — pediatric retention rationale:** owner to attach citation.
- **DPDP Act 2023 / GDPR Article 9 medical-record carve-out:** same citations as Task 33.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — **gated on owner-confirmed legal review of seed values before merge**
