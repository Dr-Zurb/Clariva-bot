# Plan p2 — Presence correctness

## 13 Aug 2026 — Batch `consult-room-checkin` / `p2-presence-correctness` (crc-07..09) — **S, ~1 dev-day**

> **Status:** 🔧 Coding shipped 2026-08-22 (crc-07 + crc-08). **Not Closed** — founder smoke is crc-09.
> **Charter:** [`../plan-consult-room-checkin-charter.md`](../plan-consult-room-checkin-charter.md) (CRC-D1…D13)
> **Predecessor:** [`../p1-lobby-presence/`](../p1-lobby-presence/) (crc-01..06)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-consult-room-checkin-presence-correctness.md`](./Tasks/EXECUTION-ORDER-p2-consult-room-checkin-presence-correctness.md)

---

## Why this phase

p1 shipped the lobby, the heartbeat columns, and the board tags. Two holes remain in the **poll** paths, and both are cheap:

1. **`/my-visit` lies about refreshing.** `PatientVisitSession.tsx` fetches the OPD snapshot once on mount and never again, while the footer renders "Updates every ~20s. Keep this tab open." A queue patient watches a frozen token/ETA under a promise that it is live. Only the heartbeat is on an interval.
2. **Voice and text patients are invisible to the doctor.** `postLobbyHeartbeat` is mounted on `/consult/join` (video) and `/my-visit` only. A patient sitting on `/c/voice/[sessionId]` or `/c/text/[sessionId]` produces **no** `patient_waiting` tag, so CRC-D9 ("doctor may Start anytime a patient is waiting") silently only works for video.

Fixing the poll paths **before** p4 replaces them with Realtime is deliberate: Realtime is the fallback-having layer, and the fallback has to be correct first.

---

## Decision lock (phase inherits charter)

| ID | Phase note |
|----|------------|
| CRC-D1…D13 | Inherited; do not re-litigate. |
| **CRC2-D1** | Snapshot poll interval is **server-driven** — use `snapshot.suggestedPollSeconds` (backend currently returns 20), fall back to 20s only if absent. Do **not** hardcode a second constant in the component. |
| **CRC2-D2** | Poll pauses while the tab is hidden (`visibilitychange`), matching the doctor board's `refetchIntervalInBackground: false` precedent in `frontend/lib/query/polling.ts`. Resume triggers an immediate refetch, not a wait for the next tick. |
| **CRC2-D3** | The **heartbeat stays at 5s** and stays independent of the snapshot poll. They answer different questions (presence freshness vs. queue state) and CRC-D8's 2-minute freshness window depends on the 5s cadence. Do not merge the two intervals. |
| **CRC2-D4** | Voice/text heartbeat reuses the **same** `postLobbyHeartbeat(token)` client + `POST /api/v1/bookings/session/lobby-heartbeat` endpoint. No new endpoint, no modality branch server-side — the HMAC already resolves to an `appointmentId`. |
| **CRC2-D5** | Heartbeat failures are **silent** on all pages (`.catch(() => undefined)`, p1 precedent). A presence stamp is not worth an error toast in front of a patient about to see a doctor. |
| **CRC2-D6** | No backend change in this phase. If a task appears to need one, **STOP** — it belongs in p3 or p4. |

---

## Waves

| Wave | Task | Model | Scope |
|------|------|-------|-------|
| 1 | [`crc-07`](./Tasks/task-crc-07-my-visit-snapshot-poll.md) | Auto | `/my-visit` snapshot auto-refresh + visibility pause |
| 2 | [`crc-08`](./Tasks/task-crc-08-voice-text-lobby-heartbeat.md) | Auto | Heartbeat on voice + text patient pages |
| 3 | [`crc-09`](./Tasks/task-crc-09-close-gate-p2.md) | Composer / Founder | Verification gate + founder smoke |

---

## Scope guard — DO NOT TOUCH

- Any backend file (CRC2-D6). This phase is frontend-only.
- Any migration. Presence columns 193/194/195 are already correct.
- The 5s heartbeat cadence (CRC2-D3).
- `PrimaryCta`, `EarlyInviteBanner`, `DelayBanner`, `TurnSoonBanner` behaviour — mounting stays as-is; only the data feeding them refreshes.
- Supabase Realtime (p4).
- Device pre-check UI (p3).
- Twilio room create/end, recording, consent, modality transitions.
- Any RLS policy change. If a step appears to require one, **STOP** and surface it.

---

## Acceptance gate (phase)

- [x] All p1 gates still green. **Not re-run; p3/p4 already shipped on this code.**
- [ ] `/my-visit` refetches the OPD snapshot on an interval; token number, `aheadCount`, ETA, and delay banner update without a manual reload. **Code shipped (crc-07). Founder walk open.**
- [ ] Poll pauses when the tab is hidden and fires an immediate refetch on re-show. **Code shipped (crc-07).**
- [x] The "Updates every ~Ns" footer matches the interval actually running.
- [ ] A patient sitting on `/c/voice/[sessionId]?t=…` produces a **Waiting** tag on the doctor board within one board poll. **Code shipped (crc-08 / crc-17). Founder walk open.**
- [ ] Same for `/c/text/[sessionId]?t=…`. **Code shipped (crc-08).**
- [ ] Idle >2 min on either page flips the tag to **Stepped away** (CRC-D8). **Founder walk open.**
- [ ] Heartbeat failures never surface a visible error to the patient. **Text swallows. Voice uses crc-17 reconnect banner (not a toast).**
- [x] No backend diff in the phase. `git diff --stat backend/` is empty. **This phase: frontend only.**
- [ ] Frontend typecheck + lint + tests green. **Lint + lobby Vitest green. Repo `tsc` 98 pre-existing cockpit errors.**

---

**Created:** 2026-08-13. Updated 2026-08-22.
