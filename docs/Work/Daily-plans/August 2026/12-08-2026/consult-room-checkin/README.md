# Program — Consult room check-in

> **Prefix:** `crc`  
> **Started:** 2026-08-12  
> **Status:** Code complete 2026-08-13 — **not Closed** until the charter metric is timed (crc-18 founder smoke).  
> **One-line intent:** Patients are already present in a consult lobby before the doctor starts — the doctor never waits on “we just emailed you a link.”

---

## Why

Today video/voice rooms are created lazily when the doctor clicks **Start**, and the join link is fan-out at that same moment. Sequence:

1. Doctor starts  
2. Patient gets SMS/email/IG DM  
3. Patient finds phone → opens link → device permission → joins  

The doctor absorbs that entire latency every visit. Text already has a T−5 min pre-ping cron that provisions a session ahead of time — that pattern must generalize without creating orphan Twilio rooms.

---

## Phase table

| Phase | Folder | Status | Ships |
|-------|--------|--------|-------|
| **p1** Lobby + presence (poll) | [`p1-lobby-presence/`](./p1-lobby-presence/) | ✅ Code done 2026-08-12 (apply mig 193 + cron) | Pre-visit check-in DM, video lobby, heartbeat columns, `patient_waiting` / `patient_stepped_away` tags on OPD board, auto-connect when doctor starts |
| **p2** Presence correctness | [`p2-presence-correctness/`](./p2-presence-correctness/) | ⏸ Coding shipped 2026-08-22 — founder smoke open | `/my-visit` snapshot auto-refresh; lobby heartbeat on voice + text; holding poll 5s near slot / 30s far |
| **p3** Device pre-check | [`p3-device-precheck/`](./p3-device-precheck/) | ✅ Code done 2026-08-13 (founder smoke in capture inbox) | Device check moves **into** the lobby (pre-Start); verified devices reused on auto-connect; connection probe; voice parity |
| **p4** Realtime + channel gaps | [`p4-realtime-and-channel-gaps/`](./p4-realtime-and-channel-gaps/) | ✅ Code done 2026-08-13; founder smoke + charter metric pending | Realtime lobby presence channel; instant board tag with poll fallback; Facebook Messenger fan-out; lobby reconnect |

Execute phases in order. Later phases inherit the [charter decision lock](./plan-consult-room-checkin-charter.md).

> **Phase renumbering (2026-08-13).** The original table listed p2 as Realtime and p3 as device pre-check. Realtime moved to p4 behind two cheaper phases: the poll paths had bugs (p2) and the device check turned out to already exist but be mounted **after** the doctor clicks Start (p3). CRC-D10's intent — poll ships first, Realtime layers on — is preserved; only the numbering changed.

**Migration-free.** p2, p3, and p4 are all specced to ship without a new migration. Columns 193/194/195 already carry everything presence needs. If a phase appears to need one, that is a signal to stop, not to write it.

---

## Related code (anchors)

| Concern | Path |
|---------|------|
| Session create (lazy) | `backend/src/services/consultation-session-service.ts` |
| Text pre-ping cron | `backend/src/services/consultation-pre-ping-job.ts` |
| Consult-ready fan-out | `backend/src/services/notification-service.ts` → `sendConsultationReadyToPatient` |
| Patient join policy | `backend/src/services/opd/opd-policy-service.ts` → `assertSlotJoinAllowedForPatient` |
| Slot tags (OSM) | `backend/src/services/opd/opd-slot-status.ts` → `deriveTags` |
| Patient visit hub | `frontend/app/my-visit/`, `frontend/components/opd/PatientVisitSession.tsx` |
| Voice/text holding UI | `frontend/app/c/voice/[sessionId]/page.tsx`, `c/text/...` |
| Video join (errors if not started) | `frontend/app/consult/join/page.tsx` |

---

## Lobby presence credential (crc-14)

**Chosen: (b) + (c).** Purpose-minted 2h JWT that grants Realtime identity only, issued by exchanging the HMAC consultation token the patient already holds.

| | |
|--|--|
| Claims | `purpose: 'lobby_presence'`, `appointment_id`, `sub: 'lobby:{appointmentId}'`. No `consult_role`, no `session_id`. |
| Delivery | `POST /api/v1/bookings/session/lobby-presence-token?token=` |
| Channel | Public broadcast `lobby-presence:{appointmentId}`, event `lobby-presence`, payload `{ appointmentId, ts }` only. |
| Banned | `postgres_changes` on `appointments`; adding `appointments` to `supabase_realtime`; extending `mintScopedConsultationJwt`. |

Heartbeat columns on `appointments` (migs 193–195) stay the source of truth. Realtime is additive.

Rejected **(a)** (widen the session-scoped consult JWT) because the lobby has no `consultation_sessions` row (CRC-D3) and mixing shapes would leak message access later. Full write-up: [`p4-realtime-and-channel-gaps/Tasks/task-crc-14-realtime-presence-channel.md`](./p4-realtime-and-channel-gaps/Tasks/task-crc-14-realtime-presence-channel.md).

---

## Charter metric (not yet measured)

Doctor clicks Start → hears/sees the patient within **~0–5 s** when the patient was already in lobby.

**Runs:** none recorded. Do not mark this program Closed until at least 3 video stopwatch runs are written here. Founder checklist: capture inbox `[crc-18 founder smoke]`.

---

## Next program

[`patient-health-hub`](../../13-08-2026/patient-health-hub/README.md) (`phh`) is the agreed next move after this program **Closes**. Do not start it while the metric is unmeasured.

---

**Created:** 2026-08-12.
