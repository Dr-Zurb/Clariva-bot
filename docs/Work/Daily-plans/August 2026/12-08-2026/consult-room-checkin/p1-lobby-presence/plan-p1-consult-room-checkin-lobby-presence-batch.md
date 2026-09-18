# Plan p1 — Lobby + presence (poll)

## 12 Aug 2026 — Batch `consult-room-checkin` / `p1-lobby-presence` (crc-01..06) — **L, ~2–3 dev-days**

> **Status:** Implemented (code) 2026-08-12 — apply migration **193** on deploy; schedule `POST /cron/consultation-checkin` every minute.  
> **Charter:** [`../plan-consult-room-checkin-charter.md`](../plan-consult-room-checkin-charter.md) (CRC-D1…D13)  
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-consult-room-checkin-lobby-presence.md`](./Tasks/EXECUTION-ORDER-p1-consult-room-checkin-lobby-presence.md)

---

## Why this phase

Ship the 90% product win without Realtime:

1. Patient gets a check-in link **before** the doctor starts.  
2. Patient sits in a **lobby** (video matches voice/text holding UX).  
3. Doctor board shows **Waiting** / **Stepped away** tags.  
4. On Start, patient **auto-connects**.

Twilio rooms stay lazy (CRC-D1). Polling only (CRC-D10).

---

## Decision lock (phase inherits charter)

| ID | Phase note |
|----|------------|
| CRC-D1…D13 | Inherited; do not re-litigate. |
| **CRC1-D1** | Next migration number after **192** is **193** (`patient_checked_in_at`, `patient_lobby_last_seen_at` on `appointments`). |
| **CRC1-D2** | Heartbeat endpoint: HMAC patient auth; upserts `patient_checked_in_at` (first hit) + `patient_lobby_last_seen_at` every poll. |
| **CRC1-D3** | Slot cron lead: new env `CONSULTATION_CHECKIN_LEAD_MINUTES` default **30**. Text keep existing `CONSULTATION_PRE_PING_LEAD_MINUTES` (session create); check-in cron **must not** create Twilio rooms. |
| **CRC1-D4** | Queue check-in: cron or lightweight job that finds next-up appointments with `aheadCount <= 3`, sends once (dedupe column or reuse pattern like `last_ready_notification_at` — prefer `appointments.patient_checkin_notified_at`). |
| **CRC1-D5** | Video token exchange when session not started: return structured `{ status: 'lobby' }` (or equivalent) instead of throwing; FE renders holding + heartbeat. |
| **CRC1-D6** | Auto-connect: when lobby poll sees session `live` (or doctor started), exchange for Twilio/Supabase token and enter room without a second CTA. |
| **CRC1-D7** | Board: extend `deriveTags` with `patient_waiting` / `patient_stepped_away`; surface chip on slot + queue dense rows (match OSM tag rendering). |

---

## Waves

| Wave | Task | Model | Scope |
|------|------|-------|-------|
| 1 | [`crc-01`](./Tasks/task-crc-01-migration-lobby-presence.md) | **Opus** | Migration 193 + types + content-sanity test |
| 2 | [`crc-02`](./Tasks/task-crc-02-heartbeat-api-and-tags.md) | Opus / Auto after 01 | Heartbeat API + tag derivation + snapshot fields |
| 3 | [`crc-03`](./Tasks/task-crc-03-checkin-cron-and-copy.md) | Auto | Slot T−30 + queue ahead≤3 check-in DM + env + copy |
| 4 | [`crc-04`](./Tasks/task-crc-04-video-lobby-and-autoconnect.md) | Auto | Video lobby + poll + auto-connect; align voice/text heartbeat |
| 5 | [`crc-05`](./Tasks/task-crc-05-board-waiting-tag-ui.md) | Auto | OPD board Waiting / Stepped away chips + tooltips |
| 6 | [`crc-06`](./Tasks/task-crc-06-close-gate-p1.md) | Composer / Founder | Verification gate + founder smoke |

---

## Scope guard — DO NOT TOUCH

- Twilio room create/end, recording, consent, modality transitions.
- `sendConsultationReadyToPatient` semantics (may be called from check-in copy helpers for URL minting only — do not change Start fan-out).
- Facebook Messenger join fan-out (CRC-D12).
- Supabase Realtime on OPD board (p2).
- Device pre-check UI (p3).
- Auto-no-show flips based on missing check-in.
- OPD section ordering / filter chips from 2026-08-11–12 OSM UI work (only add tag chips).
- Any RLS policy change. If a step appears to require one, **STOP** and surface it.

---

## Acceptance gate (phase)

- [ ] Slot patient receives check-in DM ~30 min before start (config default).
- [ ] Queue patient receives check-in DM when ≤3 ahead (once).
- [ ] Opening video join link **before** doctor Start shows a lobby, not an error.
- [ ] Lobby heartbeat stamps columns; board shows **Waiting** within one doctor poll (~30s).
- [ ] Closing/backgrounding until stale shows **Stepped away** (or tag clears per CRC-D8 — document chosen UX in crc-05).
- [ ] Doctor Start while patient in lobby → patient enters call **without tapping Join again**.
- [ ] No Twilio room created at check-in time (verify via logs / absence of `consultation_sessions` for video until Start).
- [ ] Typecheck + lint + tests green both workspaces; no PHI in logs; no RLS shape change.

---

**Created:** 2026-08-12.
