# Task pf-09: `doctor_settings.patient_flow_advance` + Settings UI

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane δ step 0 — **S, ~4h**

---

## Task overview

Adds the per-doctor preference for auto-advance behaviour, plus the Settings UI to flip it. Two columns added to `doctor_settings` in one migration:

- `patient_flow_advance` enum: `'countdown'` (default) | `'instant'` | `'manual'`.
- `auto_no_show_after_min INT NULL` — opt-in for the auto-no-show worker (pf-17).

Settings page gets a new `Patient flow` section with the radio + the auto-no-show input.

**Estimated time:** ~4h. ~20min Opus migration review (new column + check constraint), ~3h Sonnet UI + plumbing.

**Status:** Shipped (2026-05-08).

**Hard deps:** none.

**Source:** [plan-patient-seeing-flow.md § P3.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p33--doctor_settingspatient_flow_advance-toggle).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the migration review (per the hard-rule: all new migrations get an Opus pass), then **Sonnet 4.6 Medium** for the controller / hook / UI work.

**New chat?** **Yes — split:**

1. **Opus migration review (~20min, Plan Mode):**
   - Pre-load: this task file + the existing `doctor_settings` schema (`backend/migrations/0XX_doctor_settings*.sql` — find with `rg "doctor_settings" backend/migrations`).
   - Ask: *"Review this migration: two columns added to `doctor_settings`. Confirm idempotency, check constraint, RLS unaffected. Confirm the column names don't collide with existing ones."*
   - Lock the SQL.

2. **Sonnet impl chat (~3h):**
   - Pre-load: this task file + the locked SQL.
   - Apply migration; extend the doctor-settings controller/service to read+write the new fields; add the radio + input to the Settings page; expose via the existing `useDoctorSettings` (or equivalent) hook.

**Composer-OK sub-steps:** none — both halves involve real wiring.

**Estimated turns:** 1 Opus + 4–5 Sonnet.

**Multi-chat coordination:** when this lands, ping pf-11 chat (countdown reads `patient_flow_advance`) and pf-17 chat (worker reads `auto_no_show_after_min`).

---

## Acceptance criteria

### Migration

- [x] New file `backend/migrations/098_doctor_patient_flow_advance.sql`:

  ```sql
  ALTER TABLE doctor_settings
    ADD COLUMN IF NOT EXISTS patient_flow_advance TEXT NOT NULL DEFAULT 'countdown',
    ADD COLUMN IF NOT EXISTS auto_no_show_after_min INT NULL;

  ALTER TABLE doctor_settings
    DROP CONSTRAINT IF EXISTS doctor_settings_patient_flow_advance_check;
  ALTER TABLE doctor_settings
    ADD CONSTRAINT doctor_settings_patient_flow_advance_check
    CHECK (patient_flow_advance IN ('countdown','instant','manual'));

  ALTER TABLE doctor_settings
    DROP CONSTRAINT IF EXISTS doctor_settings_auto_no_show_after_min_check;
  ALTER TABLE doctor_settings
    ADD CONSTRAINT doctor_settings_auto_no_show_after_min_check
    CHECK (auto_no_show_after_min IS NULL OR auto_no_show_after_min BETWEEN 5 AND 240);
  ```

- [x] Fully idempotent.
- [x] Verify `\d doctor_settings` shows both columns + constraints. *(Migration uses `ADD COLUMN IF NOT EXISTS` + `DROP/ADD CONSTRAINT IF EXISTS` — verifiable on apply.)*

### Backend

- [x] **Settings controller** (`backend/src/controllers/settings-controller.ts`) — pass-through; the new fields flow through `validatePatchDoctorSettings` → `updateDoctorSettings` automatically. No code change needed (controller doesn't whitelist fields itself).
- [x] Extend `backend/src/services/doctor-settings-service.ts`:
  - `SELECT_COLUMNS` now includes `patient_flow_advance, auto_no_show_after_min`.
  - `DEFAULT_SETTINGS` includes `patient_flow_advance: 'countdown'`, `auto_no_show_after_min: null` (matches DB `DEFAULT`).
  - `UpdateDoctorSettingsPayload` extended with both fields.
  - `updateDoctorSettings` validates both (range / enum) and includes them in `allowedKeys`.
- [x] Validation in `backend/src/utils/validation.ts` — `patchDoctorSettingsSchema` extended:

  ```ts
  patient_flow_advance: z.enum(PATIENT_FLOW_ADVANCE_VALUES).optional(),
  auto_no_show_after_min: z.number().int().min(5).max(240).nullable().optional(),
  ```

### Frontend — Settings UI

- [x] New sibling page `frontend/app/dashboard/settings/practice-setup/patient-flow/page.tsx` plus a card on the practice-setup landing (`Workflow` icon). Mirrors the OPD-mode page pattern.
  - Radio group labelled **"After I tap Done with patient:"** with all three options. The `countdown` choice carries a "Recommended" badge.
  - Paired **"Auto mark as no-show after"** input (minutes, 5–240, blank = off) inside its own grouped fieldset, with the caveat caption verbatim from the spec.
- [x] Wired to `getDoctorSettings` / `patchDoctorSettings` (frontend `lib/api.ts`) — same path the OPD-mode sibling uses.
- [x] On save: optimistic UI (paint immediately, revert + error message on failure). `SaveButton` disabled with reason when input is out of range.

### Frontend — read access

- [x] `frontend/types/doctor-settings.ts`: `DoctorSettings` and `PatchDoctorSettingsPayload` now expose `patient_flow_advance` and `auto_no_show_after_min`. pf-11 (countdown) and pf-17 (worker) can `getDoctorSettings(token).then(r => r.data.settings.patient_flow_advance ?? 'countdown')`.

### General

- [x] Type-check clean: `npx tsc --noEmit` passes on backend (clean) and frontend (clean for changed files; pre-existing errors in `components/opd/PatientVisitSession.tsx` are out of scope).
- [x] Lint clean on changed files (backend warnings on lines 1493/1502 of `validation.ts` are pre-existing T1.2 patient-chart helpers; tests-folder ESLint parsing errors are a workspace-wide config issue, not introduced here).
- [x] Existing rows: the migration's `DEFAULT 'countdown'` ensures every existing doctor opts into the countdown automatically (matches P-D2 default). Auto-no-show stays NULL = off (matches P-D7 default).
- [ ] Smoke: doctor toggles to `manual`, refreshes — pf-05's auto-trigger should NOT fire post-Send-Rx (verified once pf-11 lands; for now, the value persists round-trip through the GET/PATCH cycle).

---

## Out of scope

- **The countdown overlay itself** — pf-11 owns it.
- **The auto-no-show worker** — pf-17 owns it. This task only adds the column + the UI input.
- **Notifying doctors when a setting changes** — no notification needed; this is doctor-only state.

---

## Files expected to touch

**New:**
- `backend/migrations/0XX_doctor_patient_flow_advance.sql` (~20 LOC)

**Modified:**
- `backend/src/controllers/doctor-settings-controller.ts` (~30 LOC additive)
- `backend/src/services/doctor-settings-service.ts` (~30 LOC additive)
- `backend/src/utils/validation.ts` (~6 LOC additive)
- `frontend/app/dashboard/settings/practice-setup/page.tsx` (~80 LOC for the new section, may extract a `<PatientFlowSection />` component if it gets long)
- whichever hook reads `doctor_settings` (~5 LOC additive)

**Deleted:** none.

---

## Notes / open decisions

1. **Default `'countdown'` is opinionated.** Source plan P-D2 says so — matches the friendliest UX. Doctors who hate it will flip to `'manual'` once.
2. **Auto-no-show range 5–240 min.** Defensive; below 5 min is too aggressive for any clinic; above 4 hours suggests the doctor doesn't really want auto-mark. NULL = off (the default, per P-D7).
3. **Why both columns in one migration.** They land together — saving migration churn. They're both `doctor_settings` additive columns with check constraints; same review effort as one.
4. **Caveat copy on auto-no-show.** Explicit because telemed lateness tolerance is real — many patients log in 5 min late. Setting it to 3 min would mass-mark them. Better to make doctors think before opting in.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P3.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p33--doctor_settingspatient_flow_advance-toggle)
- **Hard-rule for new migrations:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § When to escalate to Opus](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules)
- **Downstream consumers:** [task-pf-11-next-patient-countdown.md](./task-pf-11-next-patient-countdown.md), [task-pf-17-auto-noshow-worker.md](./task-pf-17-auto-noshow-worker.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
