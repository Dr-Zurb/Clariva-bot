# Task crc-07: `/my-visit` snapshot auto-refresh

## 13 Aug 2026 — Batch [p2-presence-correctness](../plan-p2-consult-room-checkin-presence-correctness-batch.md) — Wave 1 — **S, ~2h**

---

## Task overview

`PatientVisitSession` fetches the OPD snapshot **once on mount** and never again, while its footer promises "Updates every ~20s. Keep this tab open." A queue patient sees a frozen token number, `aheadCount`, and ETA. Make the promise true (CRC2-D1, CRC2-D2).

**Estimated time:** ~2h
**Status:** 🔧 Code shipped 2026-08-22. Founder walk still open (crc-09).
**Hard deps:** none (p1 shipped).
**Source:** CRC-D10, CRC2-D1, CRC2-D2, CRC2-D3.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/components/opd/PatientVisitSession.tsx` — the whole file (~300 lines); the mount fetch is L63–87, the heartbeat interval L90–98, the footer claim L297–299.
- `frontend/lib/api.ts` — `getOpdSessionSnapshot(consultationToken)` L1746, `postLobbyHeartbeat(patientToken)` L1979.
- `frontend/lib/query/polling.ts` — `POLL_INTERVAL` + `pollingOptions`; the `refetchIntervalInBackground: false` precedent.
- `frontend/types/opd-session.ts` — `PatientOpdSnapshot`, specifically `suggestedPollSeconds`.
- `frontend/app/consult/join/page.tsx` — the video lobby's existing 5s poll + heartbeat pair (L448–486), for interval-management style.

**Estimated turns:** 2–3.

---

## Acceptance criteria

### 1. Snapshot poll

- [x] The existing `refetch` callback runs on an interval, not just on mount.
- [x] Interval comes from `snapshot.suggestedPollSeconds` (backend returns 20), falling back to 20s when absent. **No second hardcoded constant** (CRC2-D1).
- [x] The interval re-arms if `suggestedPollSeconds` changes between snapshots.
- [x] Poll stops on unmount — no setState after unmount (the existing `mountedRef` guard pattern stays).
- [x] A failed poll **keeps the last good snapshot on screen** (stale-while-revalidate). The existing full-page error state must only appear when there is no snapshot at all — do not regress a live patient into an error page because one poll blipped.

### 2. Visibility pause

- [x] Poll pauses while `document.hidden` (CRC2-D2).
- [x] On re-show, fire an **immediate** refetch, then resume the interval. Do not make a returning patient wait a full tick for a fresh ETA.

### 3. Footer honesty

- [x] The "Updates every ~Ns" copy reflects the interval actually running.
- [x] If the tab is hidden the copy does not need to change — this is a patient-facing page, keep it calm.

### 4. Heartbeat untouched

- [x] The 5s heartbeat interval (L90–98) is **unchanged** and remains independent of the snapshot poll (CRC2-D3). **Note:** p4's `useLobbyReconnect` now owns the 5s timer; `lobbyTick` is heartbeat-only so snapshot no longer rides that cadence.

### Out of scope

- Voice/text heartbeat (crc-08).
- Any backend change, including `suggestedPollSeconds` value tuning (CRC2-D6).
- Realtime (p4).
- Redesigning the card, banners, or CTA.

---

## Scope Guard

- Expected files touched: **1–2** (`PatientVisitSession.tsx`, optionally a small shared interval hook if one already exists — do not create a new abstraction for a single caller).
- **DO NOT** touch `frontend/app/consult/join/page.tsx` in this task.
- **DO NOT** change the heartbeat cadence.

---

## Done when

- Token number / `aheadCount` / ETA / delay banner update on their own with the tab focused; polling pauses hidden and refetches immediately on re-show; a transient fetch failure does not blank the page; heartbeat cadence unchanged; frontend typecheck + lint green.
