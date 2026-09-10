# Task crc-16: Facebook Messenger consult + pre-visit fan-out

## 13 Aug 2026 — Batch [p4-realtime-and-channel-gaps](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) — Wave 2 / Lane β — **M, ~4h**

---

## Task overview

CRC-D12 shipped p1 with a documented hole: patients reachable only on Facebook Messenger get **no** consult-ready link and **no** pre-visit check-in. The Facebook channel module exists (`backend/src/workers/channels/facebook/send.ts`) but is not wired into the notification fan-out. Close it (CRC4-D5).

Independent of crc-14/crc-15 — disjoint files, no shared state. Runs as Lane β.

**Estimated time:** ~4h
**Status:** ✅ Code done 2026-08-13 — WhatsApp remains unwired (follow-up).
**Hard deps:** none within p4.
**Source:** CRC-D12, CRC4-D5.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `backend/src/services/notification-service.ts` — `ResolvedPatientChannels` L1202–1211, the resolver from L1231, `dispatchFanOut` L1289–1363, `sendConsultationReadyToPatient` L1436+, `sendPrevisitNotifyToPatient` L1731+.
- `backend/src/workers/channels/facebook/send.ts` and `backend/src/workers/channels/facebook/index.ts`.
- `backend/src/workers/channels/index.ts`, `backend/src/workers/channels/types.ts` — the channel abstraction.
- `backend/src/services/facebook-connect-service.ts` — how the doctor's Facebook page token is stored and read.
- How `resolveInstagramRecipientForAppointment` finds the IG recipient — the Facebook resolver mirrors it.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. Channel resolution

- [x] `ResolvedPatientChannels` gains Facebook recipient + doctor page token fields, mirroring the `igRecipientId` / `igDoctorToken` pair.
- [x] The resolver finds the Facebook recipient for an appointment the same way the Instagram one does — via the patient's platform identity and the conversation, respecting per-doctor identity (`(doctor_id, platform, platform_external_id)`).
- [x] A patient with no Facebook identity resolves to `null` and is skipped cleanly.

### 2. Fan-out

- [x] `dispatchFanOut` gains a Facebook task alongside SMS / email / Instagram, running **in parallel** with them (existing shape — not a cascade).
- [x] Outcome shape matches the siblings exactly: `sent` / `skipped` with a reason / `failed` with an error. A Facebook failure **never** throws the fan-out or prevents the other channels from sending.
- [x] Both `sendConsultationReadyToPatient` and `sendPrevisitNotifyToPatient` pick the new channel up. Pre-visit stages (`reminder_24h`, `checkin_30`, `nudge_15`, `nudge_5`, `starting_now`) all fan out to Facebook.
- [x] Existing dedupe stamps (`patient_checkin_notified_at` and friends) are **per-appointment, not per-channel** — do not add a Facebook-specific dedupe column. If a stage was already sent, it stays sent.

### 3. Copy and language

- [x] Reuse the existing copy builders in `dm-copy.ts` unchanged (CRC4-D5). No Facebook-specific copy family.
- [x] Language resolution flows through the same `resolveLanguageForConversation` path as the other channels.

### 4. Compliance

- [x] Never log the recipient ID, page token, or message body.
- [x] Respect the same consent gating the Instagram path respects. If the Instagram path checks consent before DMing, Facebook does too — verify rather than assume.
- [x] Honour Meta's messaging window rules the same way the Instagram sender does. If the Instagram sender has a window guard, mirror it; if it does not, note the gap rather than inventing one here.

### 5. Tests

- [x] Unit coverage: Facebook-only patient receives the message; Facebook failure records an outcome without throwing; no-Facebook-identity patient is skipped; all four channels attempted in parallel.

### Out of scope

- Facebook comment-lead flows (already shipped separately).
- WhatsApp. The channel scaffold exists at `backend/src/workers/channels/whatsapp/` but wiring it is a separate decision — **note it as a follow-up, do not do it here.**
- Changing when or why the fan-out runs.
- Any frontend change.

---

## Scope Guard

- Expected files touched: **≤ 7** (notification-service, channel resolver, facebook send wiring, types, tests).
- **DO NOT** add a migration or a per-channel dedupe column.
- **DO NOT** create a new copy family.
- **DO NOT** wire WhatsApp in this task.

---

## Done when

- A Facebook-only patient receives consult-ready and every pre-visit stage; failures are recorded as outcomes and never throw; no new copy, no new dedupe column, no migration; no recipient IDs or tokens in logs; tests + typecheck + lint green.

## Implementation (2026-08-13)

- Fourth sibling on `dispatchFanOut`: `facebook_dm`. Resolver mirrors Instagram (`patients.platform` + doctor-scoped `conversations`). Page token from `getFacebookPageAccessTokenForDoctor`. Same Graph send helper as IG (`sendInstagramMessage` + Page token). Same `dm-copy` bodies and `resolveLanguageForConversation`.
- Consult-ready, pre-visit ladder, prescription-ready ping, and OPD mode-change all pick it up because they share `dispatchFanOut`. Dedupe stamps stay per-appointment.
- **Consent / messaging window:** the Instagram fan-out path has neither a consent check nor a 24h-window guard. Facebook matches that gap rather than inventing a new one.
- **Follow-up (not this task):** WhatsApp scaffold at `backend/src/workers/channels/whatsapp/` is still unwired.
