# Text T3 — Clinical workflow (7 items, ~12 days; most items hard-depend on Plan 10)

## Doctor-side AI assist + structured intake + safety nets — turn the chat into a clinical workspace

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T3 is the third slice; defer until Plan 10 (AI clinical assist) is wired and at least T1 has shipped.
>
> **Foundation:** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md), [plan-10-ai-clinical-assist.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-10-ai-clinical-assist.md) (gate). T3 is where the AI rails meet the chat surface.

---

## Goal

Ship seven items that turn the doctor side of the chat from "a manual reply box" into "a clinical workspace": suggested replies, quick-insert templates, AI summary pane, structured intake forms, mid-chat translation, and PHI redaction warnings. The patient side gains structured intake forms and translation; everything AI-driven stays gated behind a doctor send (Principle 7 LOCKED — AI is opt-in, never default).

Five of seven items hard-depend on Plan 10 being in place. The two that don't (T3.21 structured intake + T3.24 PHI redaction warning) can ship in isolation but are best batched with the rest for a coherent surface.

---

## Status

`Drafted`. Hard-blocks on Plan 10 for items 18, 20, 22, 23.

---

## What's in scope (7 items)

| # | Item | Effort | Plan-10 dep? | Touch points |
|---|------|--------|--------------|--------------|
| T3.18 | **Suggested replies** (doctor-side). 3-chip row above composer when patient sends a question. AI-generated from Plan 10. Tap chip → fills composer (NOT auto-send). "✨ AI" tag visible. | L (~2 days) | **Yes** | New `<SuggestedRepliesRow>`; backend `ai-chat-reply-service.ts` (Plan 10 dep); composer integration. |
| T3.19 | **Quick-insert templates** (doctor-side). Slash-command `/` opens template picker (greeting / Rx / follow-up / discharge / referral / common-questions). Insert at cursor. Templates are doctor-scoped + editable in dashboard. | M (~5h) | No | New `doctor_quick_insert_templates` table; `<QuickInsertTemplatesMenu>`; dashboard CRUD page. |
| T3.20 | **AI chat summary pane** (doctor-side, panel layout). Side panel inside `<LiveConsultPanel>`: live-updating TL;DR of "what the patient has said so far". Refreshes every N messages (rate-limited). | L (~2 days) | **Yes** | New `<AiChatSummaryPane>`; backend `ai-chat-summary-service.ts` (Plan 10 dep); only renders when `layout='standalone'` doctor view inside `<LiveConsultPanel>`. |
| T3.21 | **Structured intake form mid-chat.** Doctor inserts a "complete this form" message. Patient gets an inline form (symptoms checklist, duration, severity 1–10) and submits → renders as a structured `kind='form_response'` row. Doctor view sees the answers as a table. | L (~3 days) | No | New `kind='form_request' \| 'form_response'` system kinds; new `<IntakeFormRequest>` + `<IntakeFormResponse>` bubbles; backend `chat-intake-form-service.ts` for template definitions. |
| T3.22 | **Auto-extract vitals/symptoms into draft SOAP note.** Background AI run on every patient message: parses symptoms / durations / severities into the draft SOAP note that Plan 10 already maintains. Doctor can ignore — the SOAP note is a separate surface. | L (~3 days) | **Yes** | Hook into Plan 10's existing SOAP-draft service; new `chat-soap-extractor.ts` worker; no chat UI surface. |
| T3.23 | **In-chat translation toggle.** Doctor sees a "Translate from Hindi" badge on patient messages they detect-classify as non-English. Tap → message renders translated inline (original on long-press). Patient side sees the same in reverse. | L (~2 days) | **Yes** | New backend `chat-translate-service.ts` (Plan 10 dep — uses same provider routing); inline `<TranslatedBubble>` render. |
| T3.24 | **PHI / sensitive-data redaction warning.** When patient pastes / types content that matches Aadhaar / PAN / debit-card / phone patterns, show a soft inline warning before send: "This looks like an Aadhaar number — your doctor doesn't need it." Patient can ignore (still send) or remove. | M (~6h) | No | New `frontend/lib/text/sensitive-pattern-detector.ts`; composer pre-send hook. |

---

## Non-goals (explicitly NOT in T3 — owned by later tiers)

- **Post-chat AI summary** — that's T4.25 (a different surface; T3.20 is a live, in-chat pane).
- **Patient rating** — T4.26.
- **Auto-export PDF transcript** — T4.27.
- **Chat search across consults** — T4.28.
- **Push notifications / multi-tab kick** — T5.
- **Mobile-native gestures / dictation** — T6.

---

## Why T3 sits behind Plan 10

Plan 10 (AI clinical assist) ships the rails:

- LLM provider routing (OpenAI / Azure OpenAI / Bedrock fallback).
- PHI redaction layer at the wire boundary.
- Cost guards + rate limits per doctor + per session.
- Clinical-prompt library (the prompt for "suggest 3 reply options" is a Plan 10 deliverable, not a T3 deliverable).
- Audit log for AI calls (who triggered, which model, cost, latency, outcome).

T3 is the **first chat-surface consumer** of those rails. Trying to ship T3.18 / T3.20 / T3.22 / T3.23 before Plan 10 means re-implementing all five rails ad-hoc — that's strictly worse than waiting.

T3.19, T3.21, T3.24 do NOT use AI and can ship without Plan 10. They're batched here for surface coherence — doctors learn the "/ → templates" gesture once and use it for both static templates (T3.19) and AI-suggested replies (T3.18).

---

## Implementation contract per item (key items)

### T3.18 — Suggested replies

```ts
// Trigger: every time a patient INSERT lands AND the doctor is viewing
// the chat AND it's been ≥3 messages since the last suggestion request.
//
// Backend: POST /api/v1/consultation/:sessionId/ai-chat-replies
//   - Reads last N messages from consultation_messages.
//   - PHI redaction at wire boundary (Plan 10).
//   - LLM prompt: "Suggest 3 short medical-professional reply chips...".
//   - Returns 3 strings (max 80 chars each).
//   - Audit row in ai_calls.
//
// Frontend:
//   - <SuggestedRepliesRow chips={chips} onPick={text => setComposer(text)} />
//   - Renders directly above composer when chips.length > 0.
//   - "✨ AI" tag in row header + dismiss "✕" (clears chips for this turn).
//   - Tapping a chip ALWAYS fills composer; NEVER auto-sends. Doctor must
//     review + press Send. (Principle 7.)
//   - Cleared automatically when doctor types > 0 chars (manual override).
```

### T3.19 — Quick-insert templates

```sql
CREATE TABLE doctor_quick_insert_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL,
  shortcut    TEXT NOT NULL,                          -- e.g. "rx-amox"
  body        TEXT NOT NULL,                          -- markdown-lite OK (T2.13)
  category    TEXT NOT NULL CHECK (category IN
              ('greeting','rx','follow_up','discharge','referral','common_qs','custom')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, shortcut)
);

-- RLS: doctor reads/writes own rows only.

-- Seed defaults on first doctor login (idempotent insert).
```

```ts
// Composer: when first char is "/" + composer is otherwise empty,
// open <QuickInsertTemplatesMenu> as a popover above the composer.
// Filter by typed shortcut substring. Enter / tap → insert body, replace
// the slash + shortcut typed so far.
//
// Dashboard: /dashboard/templates page for doctor CRUD.
// Doctors can also "save current composer text as a template" via a
// composer overflow (•••) → "Save as template" → asks for shortcut.
```

### T3.20 — AI chat summary pane

```ts
// Side panel that mounts in the doctor view of <LiveConsultPanel> only,
// when layout='standalone'. NOT mounted in patient view, NOT in panel/canvas
// host layouts (no room).
//
// Refresh policy:
//   - On doctor open: always fetch.
//   - On Nth (default 5) new patient message: re-fetch.
//   - Manual "Refresh" button.
//   - Hard cap: 1 fetch per 30 s per session (Plan 10 cost guard).
//
// Display:
//   - "Patient summary" heading + ✨ AI tag + last-updated timestamp.
//   - Bullets:
//       Chief complaint: <one-liner>
//       Symptom timeline: <bullets>
//       Severity / red flags: <bullets>
//       Patient-stated history: <bullets>
//   - "Mark as inaccurate" feedback link → audit row.
```

### T3.21 — Structured intake form

```ts
// New system kinds (extend Plan 06 enum):
//   form_request   — doctor-sent; payload = { form_id, prompt }
//   form_response  — patient-sent; payload = { form_id, answers: {...} }
//
// Doctor-side: composer overflow → "Send intake form" → picker:
//   Symptom intake / Pain assessment / Mood (PHQ-2) / Custom...
//
// Renders as a <IntakeFormRequest> bubble on patient side with inline
// form (no modal). Submit → sends a `kind='form_response'` message
// with the structured payload. Doctor side sees a tabular bubble:
//   Pain location: lower back
//   Onset: 2 days ago
//   Severity: 6 / 10
//   Triggers: bending, sitting >30 min
//
// Form templates live in `chat_intake_form_templates` (seed-shipped
// for v1; doctor-customisable in v2).
```

### T3.22 — Auto-extract into SOAP draft

```ts
// Background-only — no chat UI surface.
//
// On every patient message INSERT (Realtime listener in a new
// backend worker), enqueue a Plan 10 extraction job:
//   - Input: last N messages
//   - Output: structured deltas to apply to consultation_sessions.draft_soap
//     (Plan 10 already owns this column / shape).
//
// Cost guard: at most 1 extraction per 60 s per session.
// Doctor view: the draft SOAP surface (Plan 10) updates live; chat
// surface is unchanged.
```

### T3.23 — In-chat translation

```ts
// On message render (one side at a time):
//   1. Detect language (cheap heuristic / fastText) — local, no LLM.
//   2. If detected ≠ viewer's preferred language (doctor.locale or
//      patient.locale), show a "Translate from <Lang>" small CTA below
//      the bubble.
//   3. Tap → POST /api/v1/consultation/:sessionId/translate
//      { message_id, target_lang }
//   4. Cache translation client-side keyed by message_id + target_lang.
//   5. Long-press translated bubble → show original.
//
// Plan 10 owns the translation provider routing.
//
// "Auto-translate everything" toggle in settings; default OFF.
```

### T3.24 — PHI / sensitive-data redaction warning

```ts
// frontend/lib/text/sensitive-pattern-detector.ts (NEW)
//
// Pure-client regex bank — NO data leaves the device:
//   - Aadhaar: \b\d{4}\s?\d{4}\s?\d{4}\b (with Verhoeff checksum check)
//   - PAN: \b[A-Z]{5}\d{4}[A-Z]\b
//   - Phone: well-known Indian formats
//   - Debit/credit card: Luhn-validated 13–19 digit run
//   - Bank IFSC / account-number heuristic
//
// Composer pre-send hook:
//   - Run detector on composer body.
//   - If match: render an inline soft warning above composer:
//       ⚠️ This looks like an Aadhaar number. Your doctor doesn't need it.
//       [Remove number] [Send anyway]
//
// "Send anyway" sends as-is + logs an analytic event (no PHI in payload —
// just `{ pattern: 'aadhaar', dismissed: true }`).
//
// "Remove number" replaces the matched substring with "[redacted]" in
// the composer + re-renders.
```

---

## Acceptance criteria

- [ ] **T3.18** — chips appear within 3 s of a patient message (≥3-msg gap rule); tap fills composer; never auto-sends; "✨ AI" tag visible; dismiss clears.
- [ ] **T3.19** — `/` in empty composer opens picker; substring filter works; Enter inserts; overflow → "Save as template" round-trips; dashboard CRUD works.
- [ ] **T3.20** — pane renders in doctor standalone view only; refresh respects 30s rate limit; "mark inaccurate" writes an audit row.
- [ ] **T3.21** — form_request / form_response round-trips; tabular response bubble renders correctly on doctor side; form types from the seeded template list available.
- [ ] **T3.22** — patient INSERT triggers extraction job; SOAP draft updates within 60 s; respects per-session 1-per-minute cost guard.
- [ ] **T3.23** — language detection works for at least Hindi / Marathi / Tamil / Bengali ↔ English; translation renders within 2 s; long-press shows original; cache prevents re-fetch.
- [ ] **T3.24** — Aadhaar / PAN / phone / card patterns detected with no false positives on ordinary numbers; soft warning is dismissible; "Remove number" redacts + leaves the rest of the message intact.
- [ ] All AI-surfaced content carries the "✨ AI" tag (Principle 7).
- [ ] All Plan 10 rails are honoured (PHI redaction at wire, cost guards, audit log).
- [ ] No AI item ships without an "Mark as inaccurate" or equivalent feedback link.
- [ ] Frontend type-check + lint clean. Backend type-check + lint clean. New migrations reversible.
- [ ] Manual smoke: doctor + patient on different devices for a 15-min chat exercises every T3 item without hitting a console error.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend**) — chip row, slash-menu, translation badges.
- `frontend/components/consultation/SuggestedRepliesRow.tsx` (**new**, T3.18).
- `frontend/components/consultation/QuickInsertTemplatesMenu.tsx` (**new**, T3.19).
- `frontend/components/consultation/AiChatSummaryPane.tsx` (**new**, T3.20).
- `frontend/components/consultation/IntakeFormRequest.tsx` + `IntakeFormResponse.tsx` (**new**, T3.21).
- `frontend/components/consultation/TranslatedBubble.tsx` (**new**, T3.23).
- `frontend/lib/text/sensitive-pattern-detector.ts` (**new**, T3.24).
- `frontend/app/dashboard/templates/page.tsx` (**new**, T3.19) — doctor template CRUD.

**Backend:**

- `backend/src/services/ai-chat-reply-service.ts` (**new**, T3.18, Plan 10 dep).
- `backend/src/services/ai-chat-summary-service.ts` (**new**, T3.20, Plan 10 dep).
- `backend/src/services/chat-translate-service.ts` (**new**, T3.23, Plan 10 dep).
- `backend/src/workers/chat-soap-extractor.ts` (**new**, T3.22, Plan 10 dep).
- `backend/src/services/chat-intake-form-service.ts` (**new**, T3.21).
- `backend/src/controllers/template-controller.ts` (**new**, T3.19) — doctor template CRUD endpoints.
- `backend/migrations/0XX_doctor_quick_insert_templates.sql` (**new**, T3.19).
- `backend/migrations/0XX_chat_intake_form_templates.sql` (**new**, T3.21) — seeded with the v1 form list.
- Companion message kinds (**extend Plan 06's enum**): `'form_request'`, `'form_response'`.

---

## Open questions / decisions for during implementation

1. **Suggested-reply trigger cadence** (T3.18) — every patient message vs every Nth (3) message. Recommendation: every 3rd to avoid chip whiplash.
2. **AI summary refresh cadence** (T3.20) — every 5 messages or every 30s? Recommendation: BOTH ("whichever first") with a hard 30s minimum cooldown for cost control.
3. **Form templates source-of-truth** (T3.21) — seeded SQL vs editable in dashboard? Recommendation: seeded for v1 (fixed list of ~6 forms); dashboard editing is a v2 follow-up.
4. **Translation default** (T3.23) — opt-in per-message vs auto-translate by default when language mismatch detected? Recommendation: opt-in per-message — auto-translate breaks audit trail (which side actually said what?).
5. **Sensitive-pattern false-positive rate** (T3.24) — Aadhaar pattern can match ordinary 12-digit sequences. Recommendation: require Verhoeff checksum to pass before warning; reduces FP rate to ~0.
6. **Doctor's preferred language source** (T3.23) — `auth.user.user_metadata.locale` or a new `doctors.preferred_chat_lang`? Recommendation: new dedicated column; locale and translation preference are different concerns.
7. **Plan-10 sequencing** — should T3 items wait for Plan 10 to be fully shipped, or can they ship behind a feature flag while Plan 10 is in flight? Recommendation: feature flag — lets T3 frontend land + dogfooded with mock LLM responses while Plan 10 finishes.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message kinds.
- [plan-10-ai-clinical-assist.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-10-ai-clinical-assist.md) — hard dependency for items 18 / 20 / 22 / 23.
- [Voice T3 — Clinical workflow](../voice-consult/plan-t3-voice-clinical-workflow.md) — symmetric tier on the voice side.
- DPDP — Plan 10 owns the cross-border data-flow rules; T3 inherits them.

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; gated on Plan 10 for items 18 / 20 / 22 / 23.
