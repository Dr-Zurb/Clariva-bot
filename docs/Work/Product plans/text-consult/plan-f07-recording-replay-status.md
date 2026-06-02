# Plan F07 — Recording replay + post-consult chat history (Plan 07) — status (text-consult slice)

## Single-pane status of the Plan-07 surfaces that the text-consult roadmap depends on

> **Original plan (canonical for delivery history):** [Daily-plans/April 2026/19-04-2026/Plans/plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md). Plan 07 spans **all three modalities** (text + voice + video); this file extracts only the text-relevant portions. For the voice/video pieces (replay player audio baseline, recording pause-resume mid-call, mutual replay notifications), see the original.

---

## Headline status

🟢 **MOSTLY SHIPPED** for the text-consult-relevant surfaces.

| Plan-07 task | Text-relevant? | Status |
|--------------|----------------|--------|
| Task 28 — Recording pause/resume mid-consult | No (voice/video only) | ✅ Shipped |
| Task 29 — Patient self-serve replay player (audio baseline) | No (voice/video) | ✅ Shipped |
| Task 30 — Mutual replay notifications | No (voice/video) | ✅ Shipped |
| **Task 31 — Post-consult chat-history surface (`mode='readonly'`)** | **YES** | ✅ Shipped |
| **Task 32 — Transcript PDF export** | **YES** (chat transcript variant) | ✅ Shipped (chat-only PDF; voice/video adds audio-transcript merge) |

The two text-relevant tasks (31 + 32) are both fully merged. The text-consult roadmap can rely on `<TextConsultRoom mode='readonly'>` and the existing transcript-PDF service as **stable foundations**.

---

## What shipped (text slice — with code references)

### Task 31 — `<TextConsultRoom mode='readonly'>`

- `frontend/components/consultation/TextConsultRoom.tsx` — `mode: 'live' | 'readonly'` prop already in the component signature. When readonly:
  - **No Realtime subscription.** Catch-up SELECT only.
  - **No presence channel.** No online dot, no typing affordance.
  - **No composer in the DOM.** Decision 1 sub-decision LOCKED — composer is removed, not just disabled.
  - **No 📎 attachment affordance.** Same reasoning.
  - **Watermark banner** — "Read-only — view of your consultation on {date}" using `consultEndedAt` prop sourced from `consultation_sessions.actual_ended_at`.
- Patient route: `/c/history/[sessionId]/page.tsx` (HMAC-token-gated).
- Doctor route: `/dashboard/appointments/[id]/chat-history/page.tsx`.

### Task 32 — Transcript PDF (chat variant)

- `backend/src/services/transcript-pdf-service.ts` — orchestrator. Loads session + messages + signed-URL minting; pipes to composer.
- `backend/src/services/transcript-pdf-composer.ts` — Puppeteer / PDF render layout for chat bubbles, system banners, attachments inlined as images / thumbnails.
- Endpoint: `GET /api/v1/consultation/:sessionId/transcript.pdf` (HMAC patient OR doctor JWT).
- DM copy: `buildReplayNotificationDm` and the post-consult "your transcript is ready" copy live in `dm-copy.ts`.

---

## Outstanding from Plan 07 (text slice)

**None.** Both Task 31 and Task 32 are merged.

The voice/video-specific portions of Task 32 (audio-transcript merge with chat for voice/video PDF) are out of scope for the text roadmap and tracked under the voice-consult roadmap and the original Plan 07 doc.

---

## Decisions / invariants Plan 07 LOCKED that the tiers must respect

1. **Decision 1 sub-decision LOCKED** — post-consult chat history is **both parties, indefinite read access**, via `<TextConsultRoom mode='readonly'>`. T1–T6 must NOT introduce a parallel readonly chat surface.
2. **Composer removed in readonly, not disabled.** Tiers that add composer affordances (T1.2 hints, T1.6 char counter, T2.13 markdown toolbar, T3.18 suggested-replies, T3.19 templates, T6.40 dictation, T6.41 camera-direct) MUST verify they're absent in readonly. The tier acceptance criteria call this out item-by-item.
3. **Mutation actions absent in readonly.** Reactions (T2.9), reply-to (T2.10), edit (T2.11), delete (T2.12), pin (T2.14) are all live-only by RLS — but the UI MUST also hide their affordances in readonly to avoid affordance-without-action confusion.
4. **Decision 4 LOCKED** — patient self-serve replay TTL is 90 days for voice/video; the chat-history surface is indefinite (different read surface, different decision). T4.28 (cross-consult chat search) inherits the indefinite contract.
5. **PHI hygiene in PDF generation** — the PDF service does NOT log message bodies. T4.27's "auto-attach PDF to clinical record" feature inherits this constraint.

---

## How tiers relate to Plan 07

| Tier | What it adds on top of Plan 07's surface |
|------|-------------------------------------------|
| [T1 — Quick wins](./plan-t1-text-quick-wins.md) | None of the 8 items render mutation affordances in readonly; T1.4 day-separators / T1.5 delivered indicators / T1.7 typing all gracefully degrade. |
| [T2 — Real polish](./plan-t2-text-real-polish.md) | All 8 items hide their per-bubble menus in readonly. The 60s edit/delete window is moot in readonly because the session is `'ended'` (RLS rejects). |
| [T3 — Clinical workflow](./plan-t3-text-clinical-workflow.md) | T3.20 AI summary pane is **doctor live-only** by design — already not present in readonly. T3.21 form-request bubble renders the past response read-only (the patient-side form is gone). |
| [T4 — Post-chat](./plan-t4-text-post-chat.md) | **Hard depends on Plan 07** for the readonly host of the summary screen + transcript surface + cross-consult archive. T4.27 PDF generation extends Plan 07's existing service. |
| [T5 — Reliability / safety](./plan-t5-text-reliability-safety.md) | T5.30 composer-draft hook is moot in readonly (no composer); T5.31 / T5.32 push notifications gated on session `'live'` status (no push for ended-session messages — there are none). |
| [T6 — Mobile-native](./plan-t6-text-mobile-native.md) | T6.36 swipe-to-reply / T6.37 long-press-react / T6.40 dictation all gated off in readonly via the same affordance-hiding pattern as T2. T6.39 image lightbox WORKS in readonly (it's read-only inherently). |

---

## References

- **Original plan (canonical for history):** [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — full plan including the voice/video replay player + mutual notifications + recording pause-resume.
- **Master plan:** [plan-multi-modality-consultations.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-multi-modality-consultations.md) — Decision 1 sub + Decision 4 LOCKED.
- **Tier roadmap:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md).
- **T4 (heaviest consumer):** [plan-t4-text-post-chat.md](./plan-t4-text-post-chat.md) — extends Plan-07's `mode='readonly'` and PDF service.

---

**Status:** 🟢 Text-relevant surfaces fully shipped (Tasks 31 + 32). Voice/video pieces tracked under the voice-consult roadmap and the original.  
**Re-homed under text-consult roadmap:** 2026-04-28.
