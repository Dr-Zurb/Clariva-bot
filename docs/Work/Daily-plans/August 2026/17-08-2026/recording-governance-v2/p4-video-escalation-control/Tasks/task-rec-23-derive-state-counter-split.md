# Task rec-23: `deriveState` counter split — a consensual stop costs nothing

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 2 — **M, ~4h**

---

## Task overview

Split the escalation counters so that **allow-then-stop stops behaving like a decline** (REC-D9). Decline and timeout keep the arithmetic they have today, to the letter. A consensual stop consumes no attempt, starts no 5-minute cooldown, and is replaced by a 30-second debounce anchored to the stop, not to the original request.

The current rule was written under Plan 08 Task 42's assumption that a revoke signals discomfort. Migration 073's header states the intent plainly: *"Keeps `attemptsUsed` honest (the doctor used one attempt even though the recording ultimately rolled back)"* and *"Starts a cooldown window from the original `requested_at` so the doctor can't immediately re-escalate"*. Under REC-D7 that reasoning inverts — stopping is a **normal, expected control**, and with `MAX_ATTEMPTS = 2` one stop can lock a consult out of video entirely. A patient who shows a rash, stops, then two minutes later wants to show a wound leaves the doctor with nothing.

**Estimated time:** ~4h
**Status:** ✅ Done 2026-08-20 (derive + rate-limit + client parity; founder smoke is rec-27)
**Hard deps:** rec-21 (the initiator column — patient offers must be excluded from the doctor's attempt count).
**Source:** REC-D7, REC-D9, REC-D12, REC4-D4, REC4-D5, REC4-D10. Charter §Reversals reverses Plan 08 Task 42's arithmetic explicitly.

**Current state — the rule lives in three places and is documented in three more**

| Where | What it does today |
|---|---|
| `recording-escalation-service.ts:766-832` — `deriveState` | `attemptsUsed = rows.length` (`:774`); `isRevokedAllow` maps to `lastOutcome: 'decline'` (`:804-808`); cooldown end is `requested_at + 5 min` (`:803`); two rows within cooldown → `locked: max_attempts` (`:811-815`). |
| `recording-escalation-service.ts:432-480` — request-time rate limit | `recent.length >= MAX_ATTEMPTS` → `MaxAttemptsReachedError`; `isTerminalRevokedAllow` (`:462-463`) shares the decline/timeout cooldown branch. |
| `frontend/hooks/useVideoEscalationState.ts:149-202` — `deriveStateFromRow` | A client-side mirror of the same rules, with its own `COOLDOWN_MS` (`:133`) and its own revoked-allow → `'decline'` mapping (`:182-185`). |
| `recording-escalation-service.ts:724-749` | Prose derivation table in the JSDoc. |
| `recording-escalation-service.ts:793-802` | Prose rationale for the retired rule. |
| `migrations/073_….sql:13-28` | Prose rationale for the retired rule. |

- ⚠️ **Nothing here is type-enforced.** The server and the client derive independently from the same row; a divergence produces no compile error, just a doctor whose button disagrees with the server. That is the reason this task is Opus.
- ⚠️ `fetchRecentRowsForSession` is called with `MAX_ATTEMPTS` as the limit at **all three** call sites (`:433`, `:756`, `:955`). That was safe only because attempts and rows were the same thing. After this change they are not. The revoke path's comment at `:952-954` already flags that it "scan[s] up to `MAX_ATTEMPTS`" defensively against a future flow — this is that future flow.

---

## Model & execution guidance

**Recommended model:** **Opus.** Justification, since the batch is capped at two: this rewrites a **locked** state-machine derivation that is duplicated across three files and described in prose in three more; the failure mode is silent in both directions (a doctor locked out mid-consult, or a doctor with unlimited attempts) and neither shows up as a type error; and it changes a documented rate-limit contract that a patient-facing consent flow sits on top of.

**New chat?** **Yes.** Pre-load:

- This task file — **the matrix below is the specification. Implement to the matrix, not to the prose.**
- [Charter](../../plan-recording-governance-v2-charter.md) §Reversals + REC-D9, and the [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) decision lock (REC4-D4, REC4-D5, REC4-D10).
- `backend/src/services/recording-escalation-service.ts` — **whole file** (1160 lines). Non-negotiable: the header L1-64, the derived-state union L174-196, constants L258-266, row snapshot + pinned select L272-301, the rate limit L432-480, the allow branch L649-718, the derivation JSDoc L724-749, `deriveState` L766-832, and `patientRevokeVideoMidCall` L864-1113.
- `frontend/hooks/useVideoEscalationState.ts` — L100-202 (row shape, constants, `deriveStateFromRow`) and L204-440 (the Realtime + tick machinery, including `refresh`).
- `frontend/lib/api/recording-escalation.ts:77-113` — the wire type `VideoEscalationStateData` and its prose derivation comment, which also goes stale.
- `frontend/components/consultation/VideoEscalationButton.tsx:363-367,623-643,682-694` — every place that renders "requests left" or a cooldown label from `attemptsUsed`.
- `backend/migrations/073_video_escalation_audit_revoked_and_dashboard_event_widen.sql:13-28` — the rationale being retired.
- Existing tests for the escalation service, so you know which assertions encode the old rule.

**Estimated turns:** 5–8.

**Global safety gate**

- Data touched? **Read paths only** — no writes change in this task. RLS: no change.
- PHI in logs? **No.** Do not add `reason` to any log line while you are in this file.
- External API or AI call? **No.**
- Retention / deletion impact? **No.**

---

## The derived-state matrix — before and after

Rows are `video_escalation_audit` rows for one session, newest first. "Head" is the newest. "Stop" means an `allow` row with `revoked_at` set by the patient's stop; "expired" means an `allow` row auto-reverted by rec-22. `used` is `attemptsUsed`.

| # | Head row | Older rows | Window | BEFORE (today) | AFTER (REC-D9) |
|---|---|---|---|---|---|
| 1 | none | — | — | `idle`, used 0 | **unchanged** |
| 2 | pending | none | < 60 s | `requesting`, used 1 | **unchanged** |
| 3 | pending | none | ≥ 60 s | `requesting` (worker hasn't ticked) | **unchanged** |
| 4 | decline | none | < 5 min of `requested_at` | `cooldown`, used 1, last `decline` | **unchanged** |
| 5 | decline | none | ≥ 5 min | `idle`, used 1 | **unchanged** |
| 6 | timeout | none | < 5 min of `requested_at` | `cooldown`, used 1, last `timeout` | **unchanged** |
| 7 | timeout | none | ≥ 5 min | `idle`, used 1 | **unchanged** |
| 8 | allow, active | none | — | `locked: already_recording_video` | same, **plus** grant expiry + extension-spent on the state (rec-22) |
| 9 | allow, active, **paused** | none | — | n/a — pause doesn't exist | `locked: already_recording_video`, paused; grant retained; countdown still running (rec-24) |
| 10 | **stop** | none | < 30 s of `revoked_at` | `cooldown`, used 1, last `decline`, available at `requested_at + 5 min` | `cooldown`, used **0**, last **`stopped`**, available at **`revoked_at + 30 s`** |
| 11 | **stop** | none | ≥ 30 s but < 5 min of `requested_at` | `cooldown` — doctor still locked out | **`idle`, used 0** |
| 12 | **stop** | none | ≥ 5 min | `idle`, used 1 | `idle`, used **0** |
| 13 | **expired** | none | < 30 s of revert | n/a | `cooldown`, used 0, last `stopped`, available at revert `+ 30 s` |
| 14 | **expired** | none | ≥ 30 s | n/a | `idle`, used 0 |
| 15 | decline | 1 × decline/timeout | any | `locked: max_attempts` | **unchanged** |
| 16 | decline | 1 × **stop** | < 5 min | `locked: max_attempts` (`rows.length` = 2) | `cooldown`, used **1**, last `decline` — one attempt still available |
| 17 | **stop** | 1 × decline | < 30 s of `revoked_at` | `locked: max_attempts` | `cooldown`, used 1, last `stopped`; after 30 s → `idle`, used 1 |
| 18 | **stop** | 1 × **stop** | ≥ 30 s | `locked: max_attempts` | `idle`, used **0** |
| 19 | pending | 1 × **stop** | < 60 s | `requesting`, used 2 | `requesting`, used **1** |
| 20 | patient offer, active | anything | — | n/a — offers don't exist | `locked: already_recording_video`; the offer row is **never** chargeable (rec-25) |
| 21 | patient offer, ended | 1 × doctor decline within 5 min | — | n/a | `cooldown`, used 1, last `decline` — the offer neither spent nor refunded the doctor's attempt; the doctor's own cooldown is untouched |
| 22 | ≥ 3 rows for one session | — | — | Unreachable — the read was capped at 2 | Reachable and legal. `attemptsUsed` counts **chargeable** rows only, and the read is no longer capped at `MAX_ATTEMPTS` |

**Chargeable row** — the definition the matrix implies, stated once so all three sites share it:

> A row consumes one of the doctor's two attempts when it is **doctor-initiated** and it is pending, currently-active, or terminal-by-decline-or-timeout. A row is **not** chargeable when it is patient-initiated, or when it is an `allow` that ended by a patient stop or by grant expiry.

Note the deliberate asymmetry in rows 10-12 and 17: an active allow **does** count while it is running (the doctor has spent a request), and the attempt is **refunded** the moment the patient stops it. That is exactly REC-D9 — the refund is the point.

---

## Acceptance criteria

### 1. One definition, three call sites

- [x] 1.1 The chargeable-row rule exists **once**, as a named helper in the service, and both server sites use it. No copy-pasted predicate.
- [x] 1.2 `deriveState` uses it for `attemptsUsed` — `rows.length` is gone. `rg "rows.length as 1 \| 2" backend/src` returns nothing.
- [x] 1.3 The request-time rate limit (`:432-480`) uses the same helper for its max-attempts check, and its pending-request guard (`:441-455`) is **unchanged** in behaviour.
- [x] 1.4 The frontend hook no longer derives a *contradicting* result. Recommended shape: on any terminal Realtime UPDATE the hook calls its existing `refresh()` so the server stays the single source of truth for counts, and the local derivation covers only `kind`. Whatever you choose, criteria 1.5 and 1.6 are absolute.
- [x] 1.5 A stop row can **never** increase `attemptsUsed` on the client.
- [x] 1.6 A stop row can **never** produce "No requests left this consult" or a `max_attempts` label on the client.

### 2. Windows

- [x] 2.1 Decline and timeout keep a 5-minute cooldown measured from `requested_at`. Unchanged, and the existing tests for it pass **without edits** — if you had to edit one, you changed something you shouldn't have.
- [x] 2.2 A stop yields a 30-second debounce measured from `revoked_at` (not `requested_at`). The debounce length is a named constant beside the existing ones.
- [x] 2.3 A grant expiry (rec-22's auto-revert) falls in the same class as a stop.
- [x] 2.4 Surfaced through the existing `cooldown` state with an additive `lastOutcome: 'stopped'`. **No new state `kind`** (REC4-D5).

### 3. Type changes (small, load-bearing)

- [x] 3.1 `attemptsUsed` on the `cooldown` and `idle` variants must admit **0** — a refunded stop makes `cooldown` with `used: 0` a real state. Widen the union on both the server type and the frontend wire type; do not cast.
- [x] 3.2 `lastOutcome` widens to include `'stopped'` on both sides.
- [x] 3.3 Every consumer of `lastOutcome` handles the new value: the button's terminal-stage copy (`VideoEscalationButton.tsx:526-547`) and its `state → modalStage` effect (`:174-187`) currently map anything non-`timeout` to "Patient declined video recording", which would be a **lie** for a stop.
- [x] 3.4 Every consumer of `attemptsUsed` handles 0 (`:363-367`, `:623-643`, `:682-694`).

### 4. Read widening

- [x] 4.1 The audit read is no longer capped at `MAX_ATTEMPTS` rows. Pick a bounded, honest limit and state it in Notes; `idx_video_escalation_audit_session_time` covers the read.
- [x] 4.2 All three call sites (`:433`, `:756`, `:955`) are reviewed together. `patientRevokeVideoMidCall`'s "find the latest active allow" scan must still find it when more rows exist — its comment at `:950-954` already anticipated this.
- [x] 4.3 `AUDIT_ROW_SELECT` still governs both reads; the initiator column is in it (rec-21).

### 5. No ceiling, but a signal (REC4-D10)

- [x] 5.1 Consensual re-requests are **not** capped in v1 — that is the intended consequence of a refund.
- [x] 5.2 When a session exceeds a threshold of grants (start at 4), log an operational signal at info with the session id and the count. No block, no banner. This mirrors REC-D18's posture for pause: let the data drive enforcement later.

### 6. Documentation that must move with the code

- [x] 6.1 The derivation JSDoc table (`:724-749`) is rewritten to match the matrix above, including the new rows.
- [x] 6.2 The retired rationale (`:793-802`) is **deleted**, not commented out, and replaced with the REC-D9 reasoning and a pointer to this task.
- [x] 6.3 The service file header (`:1-64`) reflects the new rate-limit summary — it currently says "5-min cooldown on decline/timeout, no stacking pending", which becomes correct-but-incomplete.
- [x] 6.4 The client hook's comment block (`:175-181`) is rewritten the same way.
- [x] 6.5 The wire-type prose in `frontend/lib/api/recording-escalation.ts:77-90` is updated.
- [x] 6.6 Migration 073's header rationale is **superseded, not edited** — a shipped migration is not rewritten. Add a note in the new migration (rec-21) or in the service header stating which decision now governs, and say in Notes which you chose.

### 7. Verification

- [x] 7.1 A unit test per matrix row, including the two-row combinations (16-19) and the ≥3-row case (22). This matrix is the test plan.
- [x] 7.2 The same fixtures assert client/server parity for `kind` on every row.
- [x] 7.3 Backend + frontend typecheck, lint and tests green.

### Out of scope

- Writing the grant expiry or reverting anything (rec-22).
- Pause state (rec-24) — but the matrix's row 9 is the contract rec-24 builds against.
- Creating patient-initiated rows (rec-25) — row 20/21 is the contract it builds against.
- Copy beyond the strings named in §3.3 / §3.4 (rec-26 owns the surfaces).
- Changing `MAX_ATTEMPTS`, `EXPIRY_SECONDS`, or `COOLDOWN_MINUTES` values.
- Any migration.

---

## Scope Guard

- Expected files touched: **≤ 7** — `recording-escalation-service.ts`, `frontend/hooks/useVideoEscalationState.ts`, `frontend/lib/api/recording-escalation.ts`, `frontend/components/consultation/VideoEscalationButton.tsx` (only the `lastOutcome` / `attemptsUsed` consumers), backend tests, frontend tests.
- **DO NOT** change the values of `MAX_ATTEMPTS`, `EXPIRY_SECONDS` or `COOLDOWN_MINUTES`.
- **DO NOT** change `patientResponseToEscalation`'s atomic UPDATE, its expiry guard, or the Twilio retry.
- **DO NOT** change the timeout worker.
- **DO NOT** touch `recording-track-service.ts`, `recording-pause-service.ts`, or the replay player.
- **DO NOT** edit a shipped migration file.
- **DO NOT** add a new state `kind` to the derived-state union.
- Any expansion requires explicit approval.

---

## Done when

Every row of the matrix is implemented and unit-tested; decline and timeout arithmetic is provably untouched; a stop refunds the attempt and yields a 30-second debounce from `revoked_at`; a consult can go allow → stop → request again without hitting a lockout; the client cannot contradict the server on counts; `rows.length` is no longer an attempt count anywhere; all six prose locations describe the rule that now exists; backend and frontend typecheck, lint and tests green.

---

## Notes

- **Read limit:** `AUDIT_READ_LIMIT = 32` on all three `fetchRecentRowsForSession` sites (request rate-limit, `getVideoEscalationStateForSession`, `patientRevokeVideoMidCall`). Bounded indexed read on `idx_video_escalation_audit_session_time`. High enough for uncapped stop → re-request plus the REC4-D10 grant signal; not `MAX_ATTEMPTS`.
- **073 supersession:** service file header only (not 197, not a rewrite of 073). REC-D9 / this task now govern attempt arithmetic for a consensual stop.
- **Grant-volume signal:** `GRANT_VOLUME_SIGNAL_THRESHOLD = 4`. `logger.info` with `{ sessionId, grantCount }` when `patient_response === 'allow'` count is ≥ 4, after each of the three reads. No block, no banner, no reason string.
- **Client:** terminal Realtime UPDATE calls `refresh()`; `deriveStateFromRows` mirrors the server matrix for `kind` (and honest local counts so a lone stop cannot show `max_attempts`). 429 on request also `refresh()`es instead of stamping `attemptsUsed: 2`.
- **Gate 2026-08-20:** backend `tsc --noEmit` + eslint on the service + jest derive-state (24) and existing audit-query (unedited) green. Frontend eslint on touched files + vitest `deriveVideoEscalationState.test.ts` (25) green. Full-repo frontend `tsc` was already red on unrelated cockpit/rx files — not touched.

---

## Related tasks

- [`task-rec-21-migration-video-grant-bounds.md`](./task-rec-21-migration-video-grant-bounds.md) — the initiator column this task filters on
- [`task-rec-22-grant-expiry-auto-revert.md`](./task-rec-22-grant-expiry-auto-revert.md) — auto-revert joins the stop class
- [`task-rec-25-patient-video-offer.md`](./task-rec-25-patient-video-offer.md) — first writer of non-chargeable rows
- [Charter](../../plan-recording-governance-v2-charter.md) §Reversals · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
