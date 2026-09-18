# Task rec-30: Symmetric, non-suppressible replay notification

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 2 — **M, ~3.5h**

---

## Task overview

REC-D24: **replay notification is symmetric and non-suppressible.** Both parties are told when the other replays. This is the clause that earns patient trust for the audio mandate, and attestation clause 4 ("your replays are logged and the patient is notified") is the doctor-facing half of the same promise.

**Read the next paragraph before you write anything.**

The charter's REC-D24 row says *"`notifyPatientOfDoctorReplay` exists; the reverse and the non-suppressibility do not."* **The first half of that is wrong.** `notifyDoctorOfPatientReplay` exists at `notification-service.ts:2612`, is wired at `recording-access-service.ts:593` for both `patient` and `support_staff` callers, is wired again in `transcript-pdf-service.ts:906`, has its own storage table (migration `066_doctor_dashboard_events.sql`, widened by `074`), and has unit coverage in `tests/unit/services/notification-service-mutual-replay.test.ts`. **Both directions fire today.** Do not spend an afternoon rebuilding a function that already ships.

What is actually wrong is narrower and more useful:

1. **Support-staff replays never reach the patient.** `recording-access-service.ts:538-543` routes support-staff replays to the **doctor** and deliberately not to the patient, on the reasoning that support escalations are internal tooling and would "dilute the trust model" in the patient inbox. Under REC-D24 and clause 4, a **third party** opening a patient's recording is precisely the case the patient most needs to hear about. **This is the substantive gap in the task.**
2. **Channel reach is asymmetric by decision.** The patient is reached out-of-band (IG-DM + SMS). The doctor gets a `doctor_dashboard_events` row on next dashboard load. The header at `:2596-2598` records this as a deliberate Decision 4 carve-out. Whether REC-D24's "symmetric" overturns it is a **product decision this task must state and get confirmed** — not a wiring detail. Dashboard-only may well be right for someone who lives in the dashboard.
3. **"Non-suppressible" has no opt-out to remove.** There is no notification preference on this path. What exists is **silent failure**: six `skipped(...)` exits on the patient side and a fire-and-forget `void Promise.resolve().then(...)` wrapper at `recording-access-service.ts:931` that makes total failure invisible to the caller. `no_channels` means a patient with neither a phone nor an IG thread is never told, and nothing records that they weren't.

So this task is: **close the support-staff hole, make silent skips observable, and resolve the channel carve-out in writing.**

**p2 owns the attestation text.** This task wires the behaviour that text promises and does not author or edit a clause.

**Estimated time:** ~3.5h
**Status:** 🔧 Code shipped 2026-08-20 — dashboard-only carve-out **upheld** in writing (no founder SMS overturn). Charter REC-D24 row still needs the rec-34 correction.
**Hard deps:** none within p5. Wave 1's gates green.
**Source:** REC-D24, REC5-D9. Batch plan §*Surfaced during planning*.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Sonnet.**

Both directions already exist with tests to extend, the fan-out pattern is established, and the routing change is a handful of lines in one function. The one genuine judgement — the channel carve-out — is explicitly escalated rather than resolved by the agent, which is what keeps this off the Opus list.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) **§Surfaced during planning** (non-negotiable — it is the correction to the charter) and REC5-D9.
- `backend/src/services/recording-access-service.ts` — **L517-625** (`notifyReplayWatcher`: the routing doc-comment at **L531-551**, the doctor branch at **L572-590**, the patient/support-staff branch at **L592-613**, the swallow-all catch at **L614-620**) and **L920-960** (the fire-and-forget dispatch at **L931**).
- `backend/src/services/notification-service.ts` — **L2180-2200** (the section header describing both helpers), **L2364-2588** (`notifyPatientOfDoctorReplay`: the `skipped` helper at **L2390-2396**, the `audit_logs` idempotency pre-check at **L2410-2427**, the context and channel guards at **L2429-2451**, the IG+SMS fan-out at **L2475-2538**, the fan-out audit at **L2544-2573**), **L2590-2710** (`notifyDoctorOfPatientReplay` — read the **L2594-2611** header carefully; the dashboard-only carve-out is stated there).
- `backend/src/services/dashboard-events-service.ts` — `insertDashboardEvent` and its dedupe on `recordingAccessAuditId`.
- `backend/src/services/transcript-pdf-service.ts` — **L875-925.** The **second** call site of both helpers. Any routing change must hold here too, or transcript downloads and audio replays will disagree about who gets told.
- `backend/tests/unit/services/notification-service-mutual-replay.test.ts` — **the whole file.** Extend it; do not start a parallel suite.
- `backend/src/utils/dm-copy.ts` — the replay-notification DM builders and their language resolution. Copy changes go through builders, not inline strings.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 0. Establish and record the current state (do this first)

- [x] Confirm by reading the code that **both** notification directions already exist and fire. **Write that confirmation into this file**, with the line references, so the next reader does not re-derive it and the charter's REC-D24 row can be corrected.
- [x] Enumerate every path by which a replay can happen without the other party being told, and list them here. At minimum: the support-staff branch, and each `skipped(...)` exit. This list is the task's real specification.

### 1. Close the support-staff coverage hole

- [x] A **support-staff** replay notifies the **patient**, in addition to the doctor it already notifies.
- [x] The patient-facing copy distinguishes a support-staff access from a doctor access. A patient told "your doctor reviewed your recording" when in fact a support agent did has been actively misinformed, which is worse than silence.
- [x] Copy goes through the existing `dm-copy.ts` builders with language resolution, matching how `buildRecordingReplayedNotificationDm` is used at `notification-service.ts:2468-2473`. No inline message strings.
- [x] The existing `escalationReason` that support staff supply is **not** forwarded verbatim into patient-facing copy or into any log. It is doctor-typed or staff-typed free text and this program keeps free text out of governance surfaces.
- [x] The change holds at **both** call sites — `recording-access-service.ts` and `transcript-pdf-service.ts:875-925`. A transcript download and an audio replay must agree about who gets notified.
- [x] The doctor still gets their dashboard event for support-staff access. This adds a recipient; it removes none.

### 2. Make silent skips observable

- [x] Every `skipped(...)` exit produces a **queryable** record, not only a log line. "We chose not to notify, and here is why" must be answerable from data.
- [x] `no_channels` specifically — a patient with neither phone nor IG thread — is recorded as an **unfulfilled notification obligation**, not as a successful no-op. This is the case where a patient silently never learns their recording was opened.
- [x] The fire-and-forget wrapper (`recording-access-service.ts:931`) keeps its property that a notification failure never undoes a granted mint. **Do not make notification failure block replay** — that would let an IG-DM outage deny a doctor access to a clinical record. Observability is the fix, not coupling.
- [x] Use the existing audit surface. The patient side already writes `action: 'patient_recording_replay_notification'` to `audit_logs` with `status: 'success' | 'failure'` (`:2544-2567`) — extend that pattern rather than inventing a table. **REC5-D1: no migration.**
- [x] The existing idempotency on `recordingAccessAuditId` survives on both sides. Re-firing for the same audit row still dedupes.
- [x] A query exists — written into this file — that answers "which replays in the last 30 days did not reach the other party, and why". Ops needs this to be one query, not an investigation.

### 3. Resolve the channel carve-out (decision, not code)

- [x] State in this file whether the **dashboard-only** doctor channel is upheld or overturned, and why. Both are defensible: the doctor is in the dashboard daily and an SMS per patient replay would be noise; but "symmetric" in REC-D24 arguably means equal reach, not merely equal existence.
- [x] If **upheld:** record the reason, and confirm the doctor's dashboard feed makes the event visible without the doctor going looking for it — an unread event nobody surfaces is suppression by another name.
- [ ] If **overturned:** it needs founder confirmation before shipping, because it changes doctor-facing notification volume on a surface doctors did not opt into. **Do not overturn it unilaterally.** *(N/A — upheld.)*
- [x] Either way, the decision is written down here. **Leaving it ambiguous fails this task** — the whole point of REC-D24 is that the patient can rely on it.

### 4. Confirm there is no opt-out to remove

- [x] Verify by search that no notification preference, opt-out flag, doctor setting or quiet-hours path can suppress either direction today. **Record the search and the result.**
- [x] If one is found, removing it is in scope and is the headline of the task. If none is found — the expected outcome — say so plainly so REC-D24's "non-suppressible" half is closed by evidence rather than assumption.
- [x] No new suppression mechanism is introduced. Not a preference, not a rate limit on notifications, not a daily digest.

### 5. Observability and compliance

- [x] **No PHI in any log line.** Session IDs, audit row IDs, roles, channels, artifact types and correlation IDs are fine.
- [x] `doctor_dashboard_events` payloads already carry `patient_display_name` (`:2677`). That is an existing stored payload on a doctor-scoped surface; **do not widen it and do not copy it into a log.**
- [x] Every log line carries the correlation ID.

### Out of scope

- **Attestation copy.** Clause 4 is [`p2`](../../p2-mandatory-audio/)'s. This task wires behaviour, not text.
- Rebuilding either notification helper. Both exist.
- The `doctor_dashboard_events` schema, the Alerts v2 feed UI, and `DASHBOARD_EVENTS_RETENTION_DAYS`.
- The consult timeline — [`rec-28`](./task-rec-28-doctor-consult-timeline.md). The player — [`rec-29`](./task-rec-29-multi-composition-replay-player.md).
- Deletion, erasure, retention — [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md), [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md), [`rec-33`](./task-rec-33-retention-activation-runbook.md).
- The 90-day patient window and the video OTP gate (REC-D25).
- Notifying on *denied* replay attempts. The audit trail records them; a denial is not an access.
- Batching or digesting notifications. Three replays is three notifications (see rec-29 criterion 2).
- Email as a replay channel. Deliberately omitted per `resolveReplayDmChannels`' rationale; do not add it as a "symmetry" fix.

---

## Scope Guard

- **Expected files touched: 4–6.** `recording-access-service.ts` (routing only), `notification-service.ts` (the two helpers), `dm-copy.ts` (one new builder for support-staff copy), `transcript-pdf-service.ts` (routing parity), and the existing mutual-replay test file.
- **DO NOT** modify `mintReplayUrl`'s authZ pipeline, its stage ordering, or the granted-audit-before-mint rule (`:892-918`).
- **DO NOT** make notification failure block or reverse a mint.
- **DO NOT** modify `dashboard-events-service.ts`'s insert or dedupe contract.
- **DO NOT** modify the OTP gate or either retention window.
- **DO NOT** touch attestation copy or `recording-consent-service.ts`. **p2.**
- **DO NOT** write a migration. The `audit_logs` + `doctor_dashboard_events` surfaces already exist. **STOP and surface** if you conclude otherwise.
- **DO NOT** add a notification preference, opt-out, digest or rate limit.

---

## Global safety gate

- **Data touched?** Yes — `audit_logs` rows for notification outcomes and `doctor_dashboard_events` rows via the existing service. No schema change, RLS unchanged.
- **Any PHI in logs?** **No.** IDs, roles, channels and correlation IDs only. `patient_display_name` stays inside the dashboard-event payload where it already lives.
- **External API call?** Yes — Instagram DM and SMS through existing wrappers, now reaching patients for one additional caller role. No new provider. No AI calls.
- **Retention / deletion impact?** None. Notification rows fall under `DASHBOARD_EVENTS_RETENTION_DAYS` and the `audit_logs` policy, both unchanged.

---

## Done when

- A support-staff replay notifies the patient with copy that says a support agent accessed the recording, at both call sites; doctor→patient and patient→doctor both still fire with idempotency intact; every skip is queryable and `no_channels` is recorded as an unfulfilled obligation with a documented ops query; the dashboard-only channel carve-out is upheld with a written reason or overturned with founder confirmation; the absence of any opt-out is confirmed by recorded search; notification failure still cannot block a mint; no free text reaches patient copy or logs; no migration; backend typecheck, lint and tests green.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — §Surfaced during planning
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D24, §Attestation clause 4
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Owns the attestation text this wires: [`p2 — mandatory audio`](../../p2-mandatory-audio/)
- Charter correction to record at close: [`rec-34`](./task-rec-34-program-close-gate.md)

---

**Last Updated:** 2026-08-20.

---

## Notes (2026-08-20)

### 0. Both directions already existed

Confirmed by reading the code **before** this task's routing change:

- `notifyPatientOfDoctorReplay` — `notification-service.ts:2403`. IG-DM + SMS. Wired from `notifyReplayWatcher` (`recording-access-service.ts` doctor branch) and `fireTranscriptNotification` (doctor branch).
- `notifyDoctorOfPatientReplay` — `notification-service.ts:2678`. Dashboard event only. Wired from the same two functions for `patient` (and, before this task, also `support_staff`).
- Storage: `audit_logs` (`action = 'patient_recording_replay_notification'`) and `doctor_dashboard_events` (migration `066`, widened by `074`).
- Tests: `tests/unit/services/notification-service-mutual-replay.test.ts`.

The charter REC-D24 row that says the reverse does not exist is **wrong**. rec-34 is the allowed charter correction.

### 0. Paths where a replay could happen without the other party being told

**Closed by this task**

1. **Support-staff replay / transcript download** — previously notified only the doctor. Now also notifies the patient with `buildSupportStaffRecordingAccessedNotificationDm`. `escalationReason` stays on the doctor dashboard payload only.

**Still possible (now queryable)**

Patient helper `skipped(...)` reasons, written to `audit_logs` as `patient_recording_replay_notification` / `status=failure` / `metadata.obligation='unfulfilled'` (except `already_notified`, which is a prior row):

2. `admin_client_unavailable` — no service-role client. `logAuditEvent` cannot persist either if admin is down; this is the one skip that may remain log-only.
3. `already_notified` — not a miss; a prior attempt already wrote a row (success or failure). No second write.
4. `session_not_found`
5. `no_patient_on_session`
6. `session_not_ended`
7. `no_channels` — patient has neither phone nor IG thread. This is the unfulfilled obligation the ops query is for.
8. Fan-out `anySent === false` — already wrote `status=failure` on the same action (pre-existing).

Doctor helper skips, written as `doctor_recording_replay_notification`:

9. `admin_client_unavailable`
10. `session_not_found`
11. `insert_failed`

**Out of scope / unchanged**

12. Denied mint attempts — audit trail only; a denial is not an access.
13. Fire-and-forget throw after helpers return — mint still succeeds (`void Promise.resolve().then` at `recording-access-service.ts:1102`). Helpers themselves no longer throw on skip.

### Channel carve-out — **upheld** (dashboard-only for doctors)

REC-D24's "symmetric" is coverage (both parties are told), not identical channels. Overturning Decision 4 would SMS doctors on every patient replay without them opting in. That needs founder confirmation; this task does not.

The doctor feed is not a hidden log: Alerts (`frontend/app/dashboard/alerts/page.tsx`) is the notification center over `doctor_dashboard_events`. `useDashboardCounts` polls unread events every 30s. Sidebar Alerts pill uses `dashboardEventsUnread` (`Sidebar.tsx` `badgeKey`). `DoctorDashboardEventFeed` defaults to `unreadOnly: true`. An unread replay event surfaces without the doctor hunting for it.

### Opt-out search (2026-08-20)

Repo grep over `*.{ts,tsx,sql}` for: `opt_out`, `optOut`, `notification_pref`, `quiet_hours`, `quietHours`, `do_not_disturb`, `dnd_`, `sms_opt`, `email_opt`, `mute_notif`, `suppress.*replay`. **No matches** on a replay-notification preference. The only `opt-out` hit is an unrelated comment in `auto-no-show-worker.ts`. REC-D24's "non-suppressible" half is closed by evidence: there is nothing to remove, and this task added none.

### Ops query — replays in the last 30 days that did not reach the other party

```sql
SELECT
  id,
  created_at,
  action,
  status,
  resource_id AS session_id,
  metadata->>'recording_access_audit_id' AS recording_access_audit_id,
  metadata->>'skip_reason' AS skip_reason,
  metadata->>'obligation' AS obligation,
  metadata->>'any_sent' AS any_sent,
  metadata->>'accessed_by_role' AS accessed_by_role,
  error_message
FROM audit_logs
WHERE action IN (
  'patient_recording_replay_notification',
  'doctor_recording_replay_notification'
)
AND created_at >= now() - interval '30 days'
AND (
  status = 'failure'
  OR metadata->>'any_sent' = 'false'
  OR metadata->>'skip_reason' IS NOT NULL
)
ORDER BY created_at DESC;
```

`skip_reason = 'no_channels'` with `obligation = 'unfulfilled'` is the patient who was never reachable.
