# Plan 02 — Recording governance foundation: consent capture, audit tables, retention policy, deletion doctrine

## Land Decision 4's global recording doctrine *before* any new modality ships an artifact

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 4 (recording-on-by-default, no global doctor opt-out, per-session pause/resume, patient consent at booking with soft re-pitch on decline, 90-day patient self-serve TTL with mutual access notifications, indefinite for regulatory retention + doctor dashboard) **LOCKED**. Decision 12 (voice recording) inherits this doctrine — no fork.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Depends only on Plan 01's `consultation_sessions.id` as FK source.

---

## Goal

Land **the schema, services, and consent UI for recording governance** before any new modality ships an artifact. After this plan ships:

- Patients see a recording-consent checkbox at booking with a soft re-pitch flow on decline.
- `appointments` carries `recording_consent_at` + `recording_consent_decision` columns; consent timestamp is auditable per booking.
- Three new audit/retention tables exist: `consultation_recording_audit`, `recording_access_audit`, `signed_url_revocation`.
- A `regulatory_retention_policy` table keyed on `(country, specialty)` drives the per-region retention window (India 3–10 yr per state/specialty). Default rows seeded for India + a baseline international fallback.
- A nightly archival worker hides patient self-serve replay URLs at the 90-day mark **without** deleting the underlying artifact (regulatory retention extends well past 90 days).
- An account-deletion worker writes to `signed_url_revocation` and redacts PII from operational logs while preserving clinical content (DPDP / GDPR medical-record carve-out).

This plan does **not** ship the recording **read** surface (replay player, mutual notifications, transcript PDF). That's Plan 07. This plan ships the **write** + **governance** layer so when text/voice land in Plans 04 + 05 every artifact they create is born under the right rules.

---

## Companion plans

- [plan-01-foundation-consultation-sessions.md](./plan-01-foundation-consultation-sessions.md) — Plan 02's audit tables FK back to `consultation_sessions.id`.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md) + [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md) — both consult the consent decision via `appointments.recording_consent_decision` before starting their respective recording paths; if `false`, they record nothing and surface a doctor banner.
- [plan-07-recording-replay-and-history.md](./plan-07-recording-replay-and-history.md) — depends on this plan's `recording_access_audit` + `signed_url_revocation` tables.
- [plan-08-video-recording-escalation.md](./plan-08-video-recording-escalation.md) — depends on this plan's audit shape; extends `recording_access_audit` with an `access_type` column for audio-vs-video differentiation.

---

## Audit summary (current code)

### What exists today

| Component | Path | Plan-02 disposition |
|-----------|------|---------------------|
| Booking flow (where consent capture lands) | `backend/src/workers/instagram-dm-webhook-handler.ts` + booking-confirmation steps | **Extend** with `recordingConsent` step before `awaiting_payment`. Soft re-pitch lives here. |
| Booking-confirmation DM copy | `backend/src/utils/dm-copy.ts` | **Extend** with `buildRecordingConsentExplainer` (the "why we record" soft re-pitch) |
| Existing video recording lifecycle | `backend/src/services/consultation-room-service.ts` (renamed `video-session-twilio.ts` after Plan 01) | **Read-only consume** in this plan — recording start/stop continues to fire as it does today; the audit/governance layer wraps around it. Plan 07 extends this with the pause/resume control. |
| Account-related cleanup logic | (none unified today; ad-hoc per surface) | **New** unified `account-deletion-worker.ts` |

### What's missing (this plan delivers)

| Gap | Why it must ship before any new modality |
|-----|------------------------------------------|
| No consent capture at booking | Without it, every consult after Plans 04/05/06 ship is non-auditable retroactively. Decision 4 LOCKED makes this consent the legal basis for recording. |
| No audit table for pause/resume / start/stop events | Doctor pause-resume control lands in Plan 07 but the **audit destination** must exist now so Plan 07 is purely UI + service-call wiring. |
| No retention policy table | Without `regulatory_retention_policy`, the archival worker has no rules to apply, so all artifacts would be at risk of either premature deletion or never being deleted. |
| No revocation-list table | Account-deletion needs a place to write revoked signed-URL prefixes so the replay player (Plan 07) can 404 them. |

---

## Tasks (from the master plan, in implementation order)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 27 | Recording consent capture at booking + soft re-pitch flow + decline handling | E (Decision 4) | ~3h | Low — additive booking-state-machine extension + UI checkbox |
| 33 | Account deletion → patient-side access severance + signed-URL revocation list | E (Decision 4) | ~3h | Low — wraps existing deletion paths; no auth changes |
| 34 | Per-country / per-specialty regulatory retention policy table + nightly TTL job | E (Decision 4) | ~4h | **Medium** — gets the seed data wrong and the worker either over-deletes (compliance failure) or never deletes (storage bloat). Heavy on owner-review of the seed values. |

**Suggested order:** 27 (ship first; consent capture is the user-visible blocker) → parallel: 33 (deletion wiring) + 34 (retention policy table + worker). All three should land before Plan 04 ships.

**Note on Tasks 28 + 29 + 30 + 31 + 32:** these belong to Plan 07 (recording **read** surface) and depend on Plans 04 + 05 producing artifacts to read. Don't pull them into Plan 02.

---

## Schema deliverables (Tasks 27, 33, 34)

### Migration A — `appointments` consent columns (Task 27)

```sql
ALTER TABLE appointments
  ADD COLUMN recording_consent_decision BOOLEAN,           -- NULL = not yet asked, TRUE/FALSE = patient answer
  ADD COLUMN recording_consent_at        TIMESTAMPTZ,
  ADD COLUMN recording_consent_version   TEXT;             -- e.g. 'v1.0' — semver of the consent copy text shown
```

`recording_consent_version` matters because the legal-defensibility argument depends on knowing **which exact consent text** the patient agreed to. Bumping the copy = bumping the version + invalidating "is consent still valid" checks.

### Migration B — `consultation_recording_audit` (used by Plan 07's pause/resume; ship the table now)

```sql
CREATE TYPE recording_audit_action AS ENUM (
  'recording_started',
  'recording_paused',
  'recording_resumed',
  'recording_stopped',
  'patient_declined_pre_session',     -- doctor-side banner trigger
  'patient_revoked_video_mid_session' -- Plan 08 will write this; column exists now
);

CREATE TABLE consultation_recording_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES doctors(id),
  action       recording_audit_action NOT NULL,
  reason       TEXT,                          -- ≥5 chars when action IN ('recording_paused','recording_stopped','patient_revoked_video_mid_session')
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recording_audit_session_time ON consultation_recording_audit(session_id, occurred_at DESC);
```

### Migration C — `recording_access_audit`

```sql
CREATE TABLE recording_access_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_artifact  TEXT NOT NULL,                  -- generic — points at audio composition / video composition / transcript blob
  session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE RESTRICT,
  accessed_by_user_id UUID NOT NULL,
  accessor_role       TEXT NOT NULL,                  -- 'doctor' | 'patient' | 'support_staff' | 'admin'
  accessed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  -- access_type column added in Plan 08 (Decision 10 — audio_only vs full_video)
);

CREATE INDEX idx_access_audit_session_time ON recording_access_audit(session_id, accessed_at DESC);
CREATE INDEX idx_access_audit_user_time     ON recording_access_audit(accessed_by_user_id, accessed_at DESC);
```

### Migration D — `signed_url_revocation` (Task 33)

```sql
CREATE TABLE signed_url_revocation (
  url_prefix     TEXT PRIMARY KEY,                    -- e.g. 's3://recordings/patient_abc123/'
  revoked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revocation_reason TEXT NOT NULL                     -- e.g. 'account_deleted', 'support_request_2026-04-19'
);
```

The replay player (Plan 07) checks the prefix list before minting any signed URL. New URLs for revoked prefixes 404 hard.

### Migration E — `regulatory_retention_policy` (Task 34)

```sql
CREATE TABLE regulatory_retention_policy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    TEXT NOT NULL,                      -- ISO 3166-1 alpha-2; '*' for fallback
  specialty       TEXT NOT NULL,                      -- e.g. 'general_medicine'; '*' for any-specialty within country
  retention_years INT  NOT NULL CHECK (retention_years > 0),
  patient_self_serve_days INT NOT NULL DEFAULT 90 CHECK (patient_self_serve_days > 0),
  source          TEXT NOT NULL,                      -- regulator citation or memo URL
  effective_from  DATE NOT NULL,
  UNIQUE (country_code, specialty, effective_from)
);

-- seed (illustrative — owner must verify exact values before merge):
INSERT INTO regulatory_retention_policy (country_code, specialty, retention_years, source, effective_from) VALUES
  ('IN', '*',                3,  'Indian Medical Council Regulations 2002 §1.3.1 (general baseline)', '2026-04-19'),
  ('IN', 'pediatrics',       21, 'IMC Regulations + Limitation Act for minors (until age 21)',         '2026-04-19'),
  ('IN', 'gynecology',       7,  'Practice norm; verify per state',                                   '2026-04-19'),
  ('*',  '*',                7,  'International conservative fallback',                                '2026-04-19');
```

**The seed values above are placeholders.** Task 34 is gated on owner-confirmed legal review — a wrong value here is a compliance failure on either side (deleting too early = liability; never deleting = storage cost + DPDP issue). Document the citations in `source`.

---

## Service deliverables

### Task 27 — `recording-consent-service.ts`

```ts
// backend/src/services/recording-consent-service.ts (NEW)

export async function captureBookingConsent(input: {
  appointmentId: string;
  decision: boolean;             // patient's answer
  consentVersion: string;        // 'v1.0'
}): Promise<void>;

export async function rePitchOnDecline(input: {
  appointmentId: string;
}): Promise<{ shouldShow: boolean; copy: string }>;

// Soft re-pitch state machine: ask once, on decline show explainer, allow patient
// to flip to TRUE once, then accept FALSE as final and let booking proceed
// (booking is NEVER blocked on consent decline — Decision 4 LOCKED).

export async function getConsentForSession(input: {
  sessionId: string;
}): Promise<{ decision: boolean | null; capturedAt: Date | null; version: string | null }>;
```

Plans 04 / 05 / (existing video) call `getConsentForSession()` at session start. If `decision === false`, recording paths are skipped end-to-end and the doctor sees Plan 02's `<SessionStartBanner>` (see Frontend section).

### Task 33 — `account-deletion-worker.ts`

```ts
// backend/src/workers/account-deletion-worker.ts (NEW or EXTEND existing)

// Triggered by patient account-deletion event.
//
// Steps (all in one transaction where possible):
//   1. Enumerate all signed-URL prefixes attached to the patient's recording artifacts.
//   2. INSERT each into signed_url_revocation with reason='account_deleted'.
//   3. Redact PII from operational logs (Loki / Sentry / etc.) — keep clinical content.
//      Concretely: scrub patient name, phone, email, IG handle from log lines tagged with patient_id.
//   4. DO NOT DELETE clinical recording / transcript artifacts — regulatory retention overrides.
//   5. Patient sees an explainer DM (built via dm-copy.ts) citing the legal basis.
//   6. Doctor's dashboard view of the patient's history continues to work (clinical record stays).
//   7. Audit row written into a top-level account_deletion_audit (or reuses existing pattern).
```

### Task 34 — `recording-archival-worker.ts`

```ts
// backend/src/workers/recording-archival-worker.ts (NEW)

// Cron: nightly.
// For every recording artifact whose source session has an actual_ended_at older than
// `regulatory_retention_policy(country, specialty).patient_self_serve_days` days:
//   - Mark it as patient-side hidden (a column on the artifact metadata; e.g. a row in a new
//     `recording_artifact_index` table, or a flag on consultation_sessions; pick one in the task file).
//   - The archival worker NEVER deletes the underlying object until the full
//     regulatory_retention_policy(country, specialty).retention_years window has passed.
//   - At regulatory expiry: hard-delete from object storage + DELETE FROM signed_url_revocation any
//     associated entries + write to a dedicated archival_history table for compliance reporting.
```

**The archival worker has two phases per artifact:** (1) hide-from-patient at 90 days, (2) hard-delete at retention-years-end. Both phases share the same worker so the rules are colocated.

---

## Frontend deliverables (Task 27)

- `frontend/components/booking/RecordingConsentCheckbox.tsx` (**new**) — appears in the booking confirmation step. Default checked. Copy: *"I agree to my consultation being recorded for medical records and quality. The doctor can pause recording at any time. I can review or download my recording for 90 days, or request access for the full medical-record retention period anytime."*
- `frontend/components/booking/RecordingConsentRePitchModal.tsx` (**new**) — triggered on uncheck. Soft explainer of why we record (legal protection both ways, second-opinion review, AI assist for clinical accuracy). Two CTAs: `[Keep recording on] [Continue without recording]`.
- `frontend/components/consultation/SessionStartBanner.tsx` (**new**) — appears in `<VideoRoom>` / `<VoiceConsultRoom>` (Plan 05) / `<TextConsultRoom>` (Plan 04) / `<LiveConsultPanel>` (Plan 03) when `recording_consent_decision === false`. Copy: *"Patient declined recording. This consult is not being recorded. Take detailed clinical notes."*
- (Plan 07 owns the actual pause/resume button + indicator + replay player; this plan does not ship those.)

---

## DM copy (extend `backend/src/utils/dm-copy.ts`)

- `buildRecordingConsentExplainer(version: string): string` — used by the IG-bot soft re-pitch flow if patient declines via IG (mirror of the modal's copy)
- `buildAccountDeletionExplainerDm(citation: string): string` — sent at the end of `account-deletion-worker.ts`

---

## Acceptance criteria

- [ ] **Task 27:** Booking flow captures consent; `appointments.recording_consent_decision` populated for every new booking >99% of the time; soft re-pitch shows on first decline; declined consent surfaces `<SessionStartBanner>` to the doctor at session start; consent is **versioned** so legal review can pin a specific copy.
- [ ] **Task 33:** Account-deletion path writes to `signed_url_revocation` for every patient artifact prefix; existing recording artifacts are preserved (regulatory retention); explainer DM dispatched; PII scrubbed from operational logs; smoke test with a synthetic patient account confirms each step.
- [ ] **Task 34:** `regulatory_retention_policy` seeded with at least: `(IN, *)`, `(IN, pediatrics)`, `(IN, gynecology)`, `(*, *)`; `recording-archival-worker.ts` runs nightly; dry-run mode logs what *would* be hidden / deleted before any prod sweep; ops dashboard surface for "next 7 days of pending hide / delete actions"; **owner-signed-off legal-review note attached to the task PR before merge**.
- [ ] All four migrations apply cleanly forward and reverse (`down()` defined for each).
- [ ] No live video recording flow regresses (smoke: existing video appointment runs end-to-end with recording on).

---

## Open questions / decisions for during implementation

1. **Consent versioning bump policy:** when copy changes, do we re-prompt patients with active future bookings? (Owner call. Recommendation: only re-prompt if the new version materially expands the recording scope, otherwise carry the old version forward.)
2. **Where does the `recording_artifact_index` row live?** Options: (a) extend `consultation_sessions` with a JSON `recording_artifacts` column; (b) new dedicated table. Recommendation: dedicated table because video-vs-audio (Plan 08) means multiple artifacts per session.
3. **Account-deletion grace period:** 7-day soft-delete window before signed-URL revocation actually fires? Standard practice for accident-recovery. Recommendation: yes, ship a 7-day grace. Make it configurable in env.
4. **Default recording version string:** `'v1.0'` for now. Document the consent text in a YAML or constants file for legal traceability.

---

## Non-goals

- No recording **read** surface (replay player, mutual access notifications, transcript PDF). All in Plan 07.
- No pause/resume **UI** or service. Plan 07 owns the service; this plan ships the audit table that Plan 07 writes to.
- No video escalation / track-toggle. Plan 08 owns it; the `recording_audit_action` enum in this plan already includes `patient_revoked_video_mid_session` so Plan 08 only adds a column, not a fork.
- No frontend consumer of audit data. The doctor dashboard surface for "your patient just replayed your recording" lands in Plan 07.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 4 LOCKED + Decision 12 LOCKED entries.
- **Today's video recording lifecycle:** `backend/src/services/consultation-room-service.ts` (renamed in Plan 01)
- **Today's appointments schema:** `backend/migrations/021_appointments_consultation_room.sql`
- **DPDP Act 2023 / GDPR Article 9 medical-record carve-out:** owner to attach citations to Task 33 + Task 34 PRs.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. **Owner sign-off required on `regulatory_retention_policy` seed values before Task 34 merges.**
