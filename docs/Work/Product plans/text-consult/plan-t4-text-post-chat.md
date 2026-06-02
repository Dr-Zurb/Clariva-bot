# Text T4 — Post-chat (4 items, ~6 days)

## Make the post-consult surface as polished as the live one — summary, rating, PDF transcript, archive search

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T4 lands after Plan 07 ships the post-consult chat-history surface.
>
> **Foundation:** [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — `<TextConsultRoom mode='readonly'>` is the surface T4 wraps. T4 does NOT change the readonly bones; it adds a header summary, a rating, an export, and a search index.

---

## Goal

Ship four items that close the loop after a text consult ends: a summary screen the patient sees on session-end, an optional rating, a one-tap PDF transcript export, and a searchable archive across all the patient's consults.

These items make the post-consult surface feel as cared-for as the live one, and they generate clinical artifacts (PDF transcript) that doctors can attach to records.

---

## Status

`Drafted`. Soft-blocks on Plan 07 for items 25 + 27 (need the readonly surface).

---

## What's in scope (4 items)

| # | Item | Effort | Dep | Touch points |
|---|------|--------|-----|--------------|
| T4.25 | **Post-chat summary screen.** When session transitions to `'ended'`, patient redirected from `<TextConsultRoom>` to a summary screen: total duration, message count, attachments shared, prescription status, "View transcript" CTA, "Book follow-up" CTA. Doctor sees a similar surface in dashboard. | M (~6h) | Plan 07 | New `<TextPostChatSummary>` component; route `/c/text/[sessionId]/summary`; backend `getTextChatSummary` endpoint. |
| T4.26 | **Patient rating + review.** After summary screen, optional 5-star rating + free-text review. Writes to existing `service_reviews` table. Skippable. Doctor side has read-access in dashboard. | S (~3h) | None | Inline rating widget on summary screen; reuses existing `service-reviews-service.ts`. |
| T4.27 | **PDF transcript export.** "Download transcript" button on summary screen + on the dashboard chat-history surface. Server-side renders the chat (with attachments inline as images, system rows as banners) into a branded PDF. Same PDF emailed/IG-DM'd to patient on consult end (opt-in). | L (~3 days) | Plan 07 | New `text-chat-pdf-service.ts` (Puppeteer or PDFKit); endpoint `GET /api/v1/consultation/:sessionId/transcript.pdf`; new `<ChatTranscriptPdfButton>`. |
| T4.28 | **Searchable chat archive.** Patient app: `/c/history` — list of all past text consults with full-text search across message bodies. Doctor app: `/dashboard/patients/[id]/chats` — same for one patient's history. Postgres trigram + GIN index. | L (~3 days) | None | New migration adding GIN index on `consultation_messages.body`; new `chat-search-service.ts`; new patient + doctor list pages. |

---

## Non-goals (explicitly NOT in T4 — owned by other tiers / plans)

- **Live chat polish** — T1 / T2.
- **AI summary inside the live chat** — T3.20 (different surface; live, not post).
- **Multi-tab kick / push** — T5.
- **Mobile-native gestures** — T6.
- **Voice/video post-call summary** — owned by Voice T4 / a future Video T4 plan; T4.25's summary screen is text-only.
- **Doctor billing dashboard / per-consult revenue summary** — out of scope; that's a separate product surface.
- **Patient-facing AI-generated post-consult summary** ("Here's what your doctor said") — DPDP-sensitive; explicit Decision needed before adding.

---

## Implementation contract per item

### T4.25 — Post-chat summary screen

```ts
// New route: frontend/app/c/text/[sessionId]/summary/page.tsx
//
// Triggered by:
//   - Patient page detects sessionStatus → 'ended' (Realtime UPDATE).
//   - Inline CTA on Plan-07 readonly view: "Show summary".
//
// Backend: GET /api/v1/consultation/:sessionId/summary
//   - Auth: same HMAC token used for Plan-07 readonly access.
//   - Returns:
//     {
//       sessionId, modality: 'text',
//       startedAt, endedAt, durationMinutes,
//       messageCount, attachmentCount,
//       prescription: { id, status: 'ready' | 'pending', downloadUrl } | null,
//       doctor: { name, registrationNumber, signaturePath },
//       followUpEligible: boolean,
//     }
//
// Renders:
//   - Header: doctor name + clinic logo.
//   - "Your consultation summary" + start/end timestamp.
//   - Stat row: 23 messages · 2 attachments shared · Duration 18 min.
//   - Prescription card (if status='ready'): inline preview + download.
//   - Rating widget (T4.26).
//   - CTAs:
//       [Download transcript PDF]   (T4.27)
//       [View full chat]            → Plan-07 readonly surface
//       [Book follow-up]            → existing booking flow with doctor pre-selected
//
// Doctor side: dashboard `/dashboard/appointments/[id]` already has a
// summary card. Extend it to mirror the patient summary above the
// existing surface (so doctor / patient see roughly the same numbers).
```

### T4.26 — Patient rating + review

```ts
// Inline on summary screen:
//   "Rate your consultation"
//   [☆☆☆☆☆]
//   <textarea optional placeholder="Anything else? (optional)"  />
//   [Submit rating]   [Skip]
//
// On submit: POST to existing /api/v1/service-reviews.
// On skip: log skip in analytics; never re-prompt.
//
// Once submitted: read-only display + "Thanks for the feedback" copy.
// One rating per consult; backend rejects duplicate.
```

### T4.27 — PDF transcript export

```ts
// backend/src/services/text-chat-pdf-service.ts (NEW)
//
// Approach: Puppeteer + headless Chromium that loads a server-rendered
// HTML template. Why not PDFKit: chat layout has bubbles + attachments
// + reactions (T2) + system banners — easier in HTML/CSS than imperative
// PDFKit. Puppeteer is already familiar from the prescription PDF render.
//
// Endpoint: GET /api/v1/consultation/:sessionId/transcript.pdf
//   - Auth: HMAC token (patient) OR doctor session JWT.
//   - Streams application/pdf.
//
// Layout:
//   - Cover: clinic logo, doctor name, consult start/end, patient name
//     (optional — based on bot-collected name; falls back to "Patient").
//   - Body: chat bubbles with timestamps, system banners as italic lines,
//     attachments inlined (images full-width, PDFs as thumbnails with
//     "see attachment N" caption).
//   - Footer: "Generated by Clariva on YYYY-MM-DD" + watermark.
//
// "Email PDF on consult end" feature (opt-in patient toggle in summary
// screen): server enqueues a send via existing email + IG-DM channels
// once the PDF is generated.
```

### T4.28 — Searchable chat archive

```sql
-- Migration: GIN trigram index on consultation_messages.body.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX consultation_messages_body_trgm_idx
  ON consultation_messages USING GIN (body gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

```ts
// backend/src/services/chat-search-service.ts (NEW)
//
// Two endpoints:
//   GET /api/v1/patient/me/chat-history?q=cough
//     - Auth: HMAC patient token (or future patient-app JWT).
//     - Returns paginated session+message hits across the patient's own
//       consults only (RLS already enforces scope).
//
//   GET /api/v1/doctors/me/patients/:patientId/chat-history?q=cough
//     - Auth: doctor dashboard JWT.
//     - Returns hits scoped to that doctor-patient pair.
//
// Query shape:
//   SELECT m.id, m.session_id, m.created_at,
//          ts_headline('english', m.body, plainto_tsquery($1)) AS snippet,
//          s.scheduled_at, s.modality
//   FROM consultation_messages m
//   JOIN consultation_sessions s ON s.id = m.session_id
//   WHERE m.body % $1                     -- trigram similarity
//     AND m.deleted_at IS NULL
//     AND <RLS scope>
//   ORDER BY similarity(m.body, $1) DESC, m.created_at DESC
//   LIMIT 50;
//
// Frontend:
//   - /c/history (patient): vertical list of sessions; tap → opens
//     /c/history/[sessionId] (Plan-07 readonly view) with the matched
//     message scrolled into view.
//   - /dashboard/patients/[id]/chats (doctor): same pattern.
```

---

## Acceptance criteria

- [ ] **T4.25** — patient redirected to summary on `ended` event within 2 s; all stats accurate; CTAs route correctly; survives a hard reload (route is independently visitable).
- [ ] **T4.26** — rating + review submits to `service_reviews`; skip never re-prompts; duplicate submit rejected by backend with a graceful inline error.
- [ ] **T4.27** — PDF generates within 5 s for a 50-message chat; renders all kinds (text, attachment, system, reactions, edits, deletes); branding matches prescription PDF; emailed copy delivers within 2 min of opt-in.
- [ ] **T4.28** — full-text search returns relevant hits within 500 ms on a 100k-row table; snippet headlining works; tap-on-hit scrolls to message in readonly view.
- [ ] All items respect Plan-07 / Plan-04 RLS (no cross-patient or cross-doctor leakage).
- [ ] PDF generation does NOT log message bodies (PHI hygiene).
- [ ] Search queries do NOT log raw query text in production logs (PHI hygiene — log query length + result count instead).
- [ ] Frontend type-check + lint clean. Backend type-check + lint clean. Migrations reversible.
- [ ] Manual smoke: complete a chat, end it, verify summary → rating → PDF → search → readonly view round-trips for both patient and doctor.

---

## Files expected to touch

**Frontend:**

- `frontend/app/c/text/[sessionId]/summary/page.tsx` (**new**, T4.25).
- `frontend/components/consultation/TextPostChatSummary.tsx` (**new**, T4.25).
- `frontend/components/consultation/RatingWidget.tsx` (**new**, T4.26 — reusable across modalities).
- `frontend/components/consultation/ChatTranscriptPdfButton.tsx` (**new**, T4.27).
- `frontend/app/c/history/page.tsx` (**new**, T4.28 — patient chat archive).
- `frontend/app/c/history/[sessionId]/page.tsx` (**new**, T4.28 — wraps Plan-07 readonly with hit-anchoring).
- `frontend/app/dashboard/patients/[id]/chats/page.tsx` (**new**, T4.28 — doctor chat archive per patient).
- `frontend/app/dashboard/appointments/[id]/page.tsx` (**extend**, T4.25) — mirror patient summary card.

**Backend:**

- `backend/src/services/text-chat-summary-service.ts` (**new**, T4.25) — assembles the summary payload.
- `backend/src/services/text-chat-pdf-service.ts` (**new**, T4.27) — Puppeteer-based PDF render.
- `backend/src/services/chat-search-service.ts` (**new**, T4.28) — trigram-backed search.
- `backend/src/controllers/consultation-controller.ts` (**extend**, T4.25 + T4.27) — summary + transcript endpoints.
- `backend/src/utils/dm-copy.ts` (**extend**, T4.27) — opt-in PDF-emailed copy variant for IG-DM.
- `backend/migrations/0XX_consultation_messages_search_index.sql` (**new**, T4.28) — pg_trgm + GIN index.

---

## Open questions / decisions for during implementation

1. **Summary auto-show vs CTA-driven** (T4.25) — should the patient be auto-redirected on `ended`, or shown an inline "Consult ended — see summary" CTA? Recommendation: auto-redirect (5s grace period with a "stay" link for inertia), matches WhatsApp video-call's post-call surface.
2. **Rating mandatory vs optional** (T4.26) — current spec is optional. Confirm. Recommendation: keep optional; mandatory ratings inflate the average.
3. **PDF watermark** (T4.27) — "Generated by Clariva" footer required for clinical-record compliance? Recommendation: yes — provenance + non-tampering hint.
4. **Search scope** (T4.28) — search across ALL message kinds, or text-only (exclude system + attachment)? Recommendation: text-only by default; allow a "include system events" filter chip for advanced use.
5. **Patient chat archive auth** (T4.28) — patient currently has no persistent app login; the HMAC token is per-consult. Need a different auth shape for `/c/history`. Options: (a) per-patient long-lived magic-link, (b) patient-app login (out of scope here), (c) per-doctor archive only (patient-facing T4.28 deferred). Recommendation: (c) for v1 — patient archive is in-scope only when patient-app login lands.
6. **Doctor PDF auto-attach to record** (T4.27) — should the PDF be automatically attached to `appointment.notes_attachments` on consult end? Recommendation: yes — clinical record completeness; opt-out in clinic settings.
7. **Soft-deleted messages in PDF** (T4.27) — render `(deleted)` placeholders or omit entirely? Recommendation: render placeholders — audit-trail integrity.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md)
- [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — `mode='readonly'` surface T4.25 + T4.28 link to.
- [Voice T4 — Post-call](../voice-consult/plan-t4-voice-post-call.md) — symmetric tier on the voice side.
- Existing `service_reviews` schema — reused by T4.26.
- Existing prescription-PDF render (Puppeteer) — pattern reused by T4.27.
- Postgres `pg_trgm` + GIN index — T4.28 search backbone.

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; soft-blocks on Plan 07 for items 25 + 27.
