# Plan F06 — Companion text channel for voice/video (Plan 06) — status

## Single-pane status of the companion-chat foundation, re-homed under the text-consult roadmap

> **Original plan (canonical for delivery history):** [Daily-plans/April 2026/19-04-2026/Plans/plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md). The original is preserved at its delivery-time location (cross-referenced by Plans 07 / 08 / 09 and by both the text-consult and voice-consult tier roadmaps). **This file is the text-consult roadmap's view of that plan** — what shipped, what's outstanding, where the code lives.

---

## Headline status

🟡 **MOSTLY SHIPPED, ONE PATIENT-SIDE GAP.** Plan 06 delivered the companion-chat schema, lifecycle hook, system-message emitter, and all three host mounts. The one outstanding item is **the patient-side `exchangeTextConsultTokenHandler` modality-guard bug** that prevents the patient's voice page from getting the Supabase JWT it needs to render the companion chat.

That bug is **already captured as Sub-batch 0 (P0 hotfix)** in the [2026-04-28 voice-consult batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md) — see the four items P0.A / P0.B / P0.C / P0.T. It is **not** re-tracked here; this file just acknowledges it for visibility.

---

## What shipped (with code references)

### Schema (Task 39)

| Migration | Purpose |
|-----------|---------|
| `backend/migrations/062_consultation_messages_attachments_and_system.sql` | Added `'attachment'` and `'system'` ENUM values to `consultation_message_kind`; added `attachment_url`, `attachment_mime_type`, `attachment_byte_size`, `system_event` columns; added the `consultation_messages_insert_system` RLS policy keyed on `service_role`. |
| `backend/migrations/082_consultation_messages_attachment_mime_size_guards.sql` | Server-side MIME allowlist + 10 MiB byte-size CHECK; the frontend mirrors this list. **Audio MIMEs explicitly excluded** (no voice notes in v1). |

### Backend lifecycle + emitter (Tasks 36 + 37)

- `backend/src/services/text-session-supabase.ts#provisionCompanionChannel(...)` — auto-provisions a companion channel + JWT scope for any voice/video session. Called from the facade.
- `backend/src/services/consultation-session-service.ts` — `createSession()` calls `provisionCompanionChannel` for `voice` / `video` modalities (text already has its own chat).
- `backend/src/services/consultation-message-service.ts` — `emitSystemMessage` + helpers (`emitConsultStarted`, `emitConsultEnded`, `emitPartyJoined`). The `SystemEvent` enum is the contract Plans 07 / 08 / 09 extend.

### Frontend mounts (Tasks 38 + 24c)

- `frontend/components/consultation/VideoRoom.tsx` — accepts a `companion` prop; renders `<TextConsultRoom layout='panel'>` as a side panel on desktop / tab switcher on mobile. Mobile unread-count badge driven by `onIncomingMessage` callback (filters `kind='system'` per Note #4 in task-38).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — mounts `<TextConsultRoom layout='canvas'>` in the main canvas when `companion` prop supplied (Task 24c LOCKED 2026-04-26).
- `frontend/components/consultation/ConsultationLauncher.tsx` — doctor-side; correctly passes the `companion` prop to both `<VideoRoom>` and `<VoiceConsultRoom>`.

### `<TextConsultRoom>` extension (Task 38 cont.)

- `frontend/components/consultation/TextConsultRoom.tsx` — `layout: 'standalone' | 'panel' | 'canvas'` prop; `kind: 'text' | 'attachment' | 'system'` rendering branches; signed-URL minting via `signAttachmentUrls` backend route; system-message banner render (italic, clock icon).

---

## Outstanding from Plan 06

### One patient-side gap (booked as Sub-batch 0)

**Symptom:** doctor opens a voice consult on laptop → companion chat appears in the side area. Patient opens the same voice consult on phone → audio works, but **no chat surface**. Tested + reproduced 2026-04-28.

**Root cause** (located in `backend/src/controllers/consultation-controller.ts`, `exchangeTextConsultTokenHandler`):

```ts
// lines ~361–365 — the modality guard rejects non-text sessions:
if (session.modality !== 'text') {
  throw new ValidationError(
    `Cannot exchange text-token for ${session.modality} session`,
  );
}

// lines ~375–378 — even if you relaxed the guard, this dispatches by modality
// and returns a Twilio token (for voice/video) instead of the Supabase JWT
// the companion chat needs:
const joinToken = await facadeGetJoinToken(sessionId, 'patient', correlationId);
```

**Effect:** patient voice page calls `requestTextSessionToken` for the companion chat → backend rejects → frontend silently swallows the error → no chat. Doctor side works because doctors use their dashboard Supabase session JWT directly (different code path).

**Fix scope (already in plan-voice-consult-selected-features.md Sub-batch 0):**

- **P0.A** — Relax the modality guard to accept `text | voice | video`; bypass `facadeGetJoinToken` and call `textSessionSupabaseAdapter.getJoinToken(...)` directly so a Supabase JWT is always minted, regardless of session primary modality.
- **P0.B** — Wire `requestTextSessionToken` + companion mount in `frontend/app/consult/join/page.tsx` (the patient video page is missing the same wiring).
- **P0.C** — Stop swallowing companion-exchange errors silently in `frontend/app/c/voice/[sessionId]/page.tsx` — surface them so failures are visible.
- **P0.T** — Backend integration test covering text-token exchange for all three modalities.

**Effort:** ~1 day. **Owner:** TBD. **Status:** Drafted; sequenced as the first sub-batch in the 28-04-2026 voice-consult implementation batch (hard gate for everything else).

### Anything else

**No.** Tasks 24c / 36 / 37 / 38 / 39 are all merged. The only Plan-06 work remaining is Sub-batch 0 above.

---

## Decisions / invariants Plan 06 LOCKED that the tiers must respect

1. **Decision 9 LOCKED** — companion text channel is **always-on, always-free** for voice and video. Every voice/video session auto-provisions a chat channel; chat is not a billable affordance. T2.9 reactions / T2.10 reply / T2.11 edit etc. are all free affordances by extension.
2. **Three-host parity** — `<TextConsultRoom>` ships in `standalone` / `panel` / `canvas` layouts simultaneously. **Tiers must ship every item across all three layouts** unless explicitly degraded — this is Principle 2 in the text-consult roadmap.
3. **No duplication** — the chat panel inside `<VideoRoom>` and the chat canvas inside `<VoiceConsultRoom>` are the same `<TextConsultRoom>` instance, just with a different `layout` prop. T1–T6 must not introduce a parallel chat component.
4. **System messages are inline banners, not bubbles** — italic, gray, clock icon. Not avatars, not CTAs. T1.7 typing indicator and T1.8 failed-send styling were chosen to NOT compete with this surface.
5. **`SystemEvent` enum is the contract** — Plans 07 / 08 / 09 add their own values (recording_paused, video_recording_started, modality_switched). T1.8 (`mute_changed`), T2.9 (`reaction_added` if surfaced as audit), T2.11 (`message_edited`), T2.12 (`message_deleted`), T2.14 (`message_pinned`), T3.21 (`form_request` / `form_response`) all extend this enum rather than inventing new system surfaces.
6. **AI-pipeline-friendly SQL** — a single `SELECT * FROM consultation_messages WHERE session_id = $1 ORDER BY created_at` returns one coherent narrative across text + attachment + system rows for any modality. T3 (AI assist) and T4.27 (PDF transcript) both rely on this contract.

---

## How tiers relate to Plan 06

| Tier | What it adds on top of Plan 06's surface |
|------|-------------------------------------------|
| [T1 — Quick wins](./plan-t1-text-quick-wins.md) | All 8 items inherit three-host parity. T1.4 day-separators / T1.7 typing-polish render correctly inside `panel` and `canvas` layouts. |
| [T2 — Real polish](./plan-t2-text-real-polish.md) | Reactions / reply-to / edit / delete / pinned all extend Plan 06's schema additively. The view + RLS work explicitly preserves the patient-JWT path. |
| [T3 — Clinical workflow](./plan-t3-text-clinical-workflow.md) | Adds new `SystemEvent` values (`form_request`, `form_response`); AI summary pane reads via Plan 06's coherent-narrative contract. |
| [T4 — Post-chat](./plan-t4-text-post-chat.md) | PDF transcript reads attachments + system rows via the same SELECT; archive search index lives on `consultation_messages.body`. |
| [T5 — Reliability / safety](./plan-t5-text-reliability-safety.md) | Push payload uses Plan 06's body field (truncated + redacted); rate-limit RLS extends Plan 06's INSERT path. |
| [T6 — Mobile-native](./plan-t6-text-mobile-native.md) | Lightbox + camera-direct + share-target all act on Plan 06's attachment rows; no new attachment shape. |

---

## References

- **Original plan (canonical for history):** [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md).
- **Master plan:** [plan-multi-modality-consultations.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Sub-batch 0 (the one outstanding item):** [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md).
- **Tier roadmap:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md).
- **Foundation peer:** [plan-f04-text-foundation-status.md](./plan-f04-text-foundation-status.md).

---

**Status:** 🟡 Mostly shipped 2026-04-19 → 2026-04-26. One patient-side companion-chat gap booked as Sub-batch 0 (P0 hotfix) in the 28-04 batch.  
**Re-homed under text-consult roadmap:** 2026-04-28.
