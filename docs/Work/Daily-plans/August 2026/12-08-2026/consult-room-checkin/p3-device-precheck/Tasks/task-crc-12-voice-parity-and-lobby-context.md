# Task crc-12: Voice lobby parity + lobby context

## 13 Aug 2026 — Batch [p3-device-precheck](../plan-p3-consult-room-checkin-device-precheck-batch.md) — Wave 3 — **M, ~3–4h**

---

## Task overview

Two loose ends. Voice patients get no device check before Start even though `VoiceConsultPreCall` already exists. And every lobby — video and voice — tells the patient to wait without telling them **why** or **how long**, which reads as broken (CRC3-D6, CRC3-D8).

**Estimated time:** ~3–4h
**Status:** ⏳ Pending
**Hard deps:** crc-10 merged (video lobby shape is the template).
**Source:** CRC-D6, CRC3-D5, CRC3-D6, CRC3-D8.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/app/c/voice/[sessionId]/page.tsx` — holding state; token at `searchParams.get("t")` L91.
- `frontend/components/consultation/VoiceConsultPreCall.tsx`.
- `frontend/app/consult/join/page.tsx` — the lobby as restructured by crc-10.
- `frontend/components/opd/PatientVisitSession.tsx` L190–207 — the existing `doctorBusyWith` copy. **Reuse the wording**; a patient should not read two different sentences for the same situation on two of our pages.
- `frontend/lib/api.ts` — `getOpdSessionSnapshot(consultationToken)` L1746.
- `frontend/types/opd-session.ts` — `PatientOpdSnapshot`; note `doctorBusyWith`, `etaMinutes`, `delayMinutes`.

**Estimated turns:** 3–4.

---

## Acceptance criteria

### 1. Voice lobby parity

- [ ] The voice holding state renders `VoiceConsultPreCall` before the doctor starts, mirroring crc-10's video treatment.
- [ ] Verified mic choice is cached and reused on auto-connect — no second tap (CRC3-D2 applied to voice).
- [ ] No Twilio room or voice session is created by the check (CRC-D1).
- [ ] The p2 heartbeat keeps firing throughout.
- [ ] Text is **untouched** — it has no device surface (CRC3-D8).

### 2. Lobby context

- [ ] Both lobbies can show why the patient is waiting, sourced from the OPD snapshot the page can already fetch with its existing token (`getOpdSessionSnapshot`).
- [ ] Surface, when available: `doctorBusyWith === 'other_patient'` ("The doctor is with another patient"), `delayMinutes`, and queue-mode ETA.
- [ ] Copy is **identical** to `PatientVisitSession`'s existing strings. If you find yourself writing a new sentence for a situation that page already describes, extract the shared string instead.
- [ ] When the snapshot is unavailable or the fields are absent, fall back to today's generic waiting copy. Context is an enhancement, never a dependency.
- [ ] The snapshot call must not add a second polling loop on top of crc-10's lobby poll — piggyback on the existing cadence or share one interval.

### 3. What stays out

- [ ] **No doctor display name.** The backend does not surface it to patients (see `consult/join/page.tsx` L581–588). Do not invent a lookup, do not add a backend field here (CRC3-D6). File it as a follow-up instead.
- [ ] No device readiness sent to the doctor board (CRC3-D5).

### 4. Tests

- [ ] Coverage for voice: check renders pre-Start, cached mic reused on live, no session created.
- [ ] Coverage for context: renders when snapshot present, falls back cleanly when absent.

### Out of scope

- Text consult UI.
- Doctor board changes.
- Backend payload changes of any kind.
- Realtime (p4).

---

## Scope Guard

- Expected files touched: **≤ 6** (voice page, shared lobby context component, shared copy module, join page mount, tests).
- **DO NOT** add a backend field for the doctor's name.
- **DO NOT** duplicate patient-facing copy that already exists in `PatientVisitSession` — share it.

---

## Done when

- Voice lobby shows its mic check before Start and reuses it on auto-connect; both lobbies explain the wait using the same words `/my-visit` already uses; missing snapshot degrades to generic copy; no backend diff; tests + typecheck + lint green.
