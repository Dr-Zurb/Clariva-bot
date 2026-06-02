# Plan F04 — Text consult foundation (Plan 04) — status

## Single-pane status of the text-consult foundation, re-homed under the text-consult roadmap

> **Original plan (canonical for delivery history):** [Daily-plans/April 2026/19-04-2026/Plans/plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md). The original is preserved at its delivery-time location (cross-referenced by Plans 06 / 07 / 09 and by the master-plan index). **This file is the text-consult roadmap's view of that plan** — what shipped, what's outstanding, where the code lives. If you need the full historical context (decision log, RLS appendix, etc.), open the original.

---

## Headline status

✅ **FULLY SHIPPED.** Plan 04 delivered the entire text-consult v1 surface:

- DB schema + RLS + Storage bucket (Task 17) — 8 migrations on disk.
- `text-session-supabase.ts` adapter (Task 18) — wired into the Plan-01 facade.
- `<TextConsultRoom>` UI (Task 19) — 1,759 lines, three layouts, mode='readonly', attachments, presence, typing, optimistic send, reconnect.
- DM copy builders (Task 21) — `buildConsultationReadyDm` + `buildPrescriptionReadyDm` live in `dm-copy.ts`.

There is **no outstanding work in Plan 04 itself**. Everything in the tier plans (T1–T6) layers polish, clinical workflow, post-chat, reliability and mobile-native capabilities **on top of** this foundation.

---

## What shipped (with code references so it's verifiable)

### Schema (Task 17)

| Migration | Purpose |
|-----------|---------|
| `backend/migrations/051_consultation_messages.sql` | Base `consultation_messages` table + initial RLS policies + Storage bucket `consultation-attachments`. |
| `backend/migrations/052_consultation_messages_patient_jwt_rls.sql` | Patient-JWT branch on RLS for both SELECT and INSERT. |
| `backend/migrations/078_consultation_messages_rls_short_circuit_patient.sql` | First attempt at fixing the patient-JWT 22P02 issue (CASE-based; insufficient on its own — see plan-04 Appendix A in the original). |
| `backend/migrations/079_consultation_rls_safe_uuid_sub.sql` | Introduced `public.safe_uuid_sub()` and rewrote consultation_messages + Storage policies. **The fix that actually works.** |
| `backend/migrations/080_consultation_sessions_safe_uuid_sub.sql` | Rewrote `consultation_sessions_select` to use `safe_uuid_sub()`. |
| `backend/migrations/081_consultation_sessions_patient_claim_branch.sql` | Patient-JWT claim-attested SELECT branch on `consultation_sessions`. |

> **DO NOT regress:** any future RLS policy on a table reachable by a patient JWT MUST use `public.safe_uuid_sub()` instead of `auth.uid()`. See the original plan's Appendix A — it captures why this matters and how to verify (`backend/scripts/diagnose-text-consult-jwt.ts`).

### Backend adapter (Task 18)

- `backend/src/services/text-session-supabase.ts` — implements the Plan-01 `ConsultationSessionAdapter` contract for `modality='text'`. Owns `createSession`, `endSession`, `getJoinToken`, plus Plan-06 extensions `provisionCompanionChannel` and `getTextJoinToken` (used by voice/video companion-chat).
- `backend/src/controllers/consultation-controller.ts` — `exchangeTextConsultTokenHandler` is the patient-side entry point that exchanges the URL HMAC `?t=` token for a Supabase JWT. **Caveat:** has the modality-guard bug captured as Sub-batch 0 in the 2026-04-28 voice-consult batch (see `plan-f06`).
- `backend/src/services/consultation-session-service.ts` — facade that dispatches by modality; the text adapter is registered here.

### Frontend (Task 19)

- `frontend/components/consultation/TextConsultRoom.tsx` (1,759 lines) — the chat UI. Three layouts (`standalone`, `panel`, `canvas`), live + readonly modes, optimistic send + retry, reconnect with exponential backoff (1s → 30s), presence, typing (1s throttle / 3s idle), attachments (camera + gallery + PDF, MIME-allowlisted, 10 MiB cap), system-message rendering, signed-URL minting via backend service-role.
- `frontend/app/c/text/[sessionId]/page.tsx` — patient route; exchanges HMAC token, mounts `<TextConsultRoom>`.
- `frontend/components/consultation/LiveConsultPanel.tsx` — doctor-side host that mounts `<TextConsultRoom>` for `appointment.consultation_type === 'text'`.

### DM copy (Task 21)

- `backend/src/utils/dm-copy.ts` — `buildConsultationReadyDm` (text/voice/video variants) + `buildPrescriptionReadyDm`.
- `backend/src/services/notification-service.ts` — `sendConsultationReadyToPatient` fan-out (SMS + email + IG DM).
- `backend/src/services/consultation-pre-ping-job.ts` — cron-driven send at consult start.

---

## Outstanding from Plan 04

**None.** All four tasks (17 / 18 / 19 / 21) are merged and live.

The patient-side voice gap (where the companion chat doesn't appear on the patient's voice call) is **NOT** a Plan-04 outstanding item — it's a Plan-06 controller bug, captured in `plan-f06` and in [Sub-batch 0 of the 2026-04-28 voice batch](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md).

---

## Decisions / invariants Plan 04 LOCKED that the tiers must respect

1. **Decision 1 sub-decision LOCKED** — text on Supabase Realtime + Postgres, NOT Twilio Conversations / WhatsApp / Sendbird. T1–T6 must not introduce a competing chat backbone.
2. **Decision 5 LOCKED** — live-only writes for v1; `consultation_messages_insert_live_participants` RLS policy rejects writes to `'ended'` / `'cancelled'` sessions. T2's edit / delete actions explicitly inherit this — they're 60s-windowed AND session-must-be-live.
3. **`safe_uuid_sub()` invariant LOCKED** — see migration 079. Any new RLS policy on a table a patient JWT can reach MUST use `safe_uuid_sub()`. T2 (reactions table), T3 (templates / form templates), T5 (rate-limit + quality tables) all need this.
4. **Storage bucket retention** — `consultation-attachments` is governed by Plan 02's retention doctrine. T2.12 soft-delete must respect: bodies nullable in the view, but storage objects live until retention archival fires.
5. **PHI hygiene in logs** — message bodies never reach console / Sentry / analytics. T3 AI surfaces and T5 telemetry both inherit this (no body in `text_chat_quality`, no body in push-notif payload beyond what T3.24 redactor permits).

---

## How tiers relate to Plan 04

| Tier | What it adds on top |
|------|----------------------|
| [T1 — Quick wins](./plan-t1-text-quick-wins.md) | Pure UX polish inside `TextConsultRoom.tsx`; no Plan-04 schema or backend touch. |
| [T2 — Real polish](./plan-t2-text-real-polish.md) | Adds reactions table + 4 additive nullable columns on `consultation_messages` + edit/delete RLS. Plan 04's table is the parent. |
| [T3 — Clinical workflow](./plan-t3-text-clinical-workflow.md) | Adds AI-driven surfaces; consumes `consultation_messages` SELECT. Hard-depends on Plan 10 (see [plan-f10](./plan-f10-ai-clinical-assist-status.md)). |
| [T4 — Post-chat](./plan-t4-text-post-chat.md) | Wraps the chat with a summary screen + PDF transcript + searchable archive. Uses `mode='readonly'` from Plan 07. |
| [T5 — Reliability / safety](./plan-t5-text-reliability-safety.md) | Adds 3 telemetry / rate-limit columns + tables; preserves Plan 04 invariants. |
| [T6 — Mobile-native](./plan-t6-text-mobile-native.md) | Adds gesture / dictation / share-target on top of the existing composer. |

---

## References

- **Original plan (canonical for history):** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) — full plan including the 80-line Appendix A on the patient-JWT RLS hardening migration sequence.
- **Master plan:** [plan-multi-modality-consultations.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-multi-modality-consultations.md) — Decision 1 + Decision 5 LOCKED.
- **Tier roadmap:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md) — what comes next.
- **Verification script:** `backend/scripts/diagnose-text-consult-jwt.ts` — patient-JWT smoke test.

---

**Status:** ✅ Fully shipped 2026-04-19 → 2026-04-26 (with RLS hardening migrations 078–082).  
**Last verified shipped:** 2026-04-28.  
**Re-homed under text-consult roadmap:** 2026-04-28.
