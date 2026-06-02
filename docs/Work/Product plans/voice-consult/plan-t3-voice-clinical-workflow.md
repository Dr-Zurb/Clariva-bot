# Voice T3 — Clinical workflow (7 items, weeks of effort)

## Live captions, noise suppression, in-call quick actions, three-way call, vitals input

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T3 is the third tier; **Deferred** — needs deliberate scoping; some items soft-block on Plan 10 (AI clinical assist) being in place.
>
> **Foundation:** T1 + T2 must ship first. Plan 02 (recording governance), Plan 06 (companion text + attachments), and Plan 10 (AI clinical assist) are companion plans; some T3 items hard-depend on them.

---

## Goal

Move from "polished telemed call" to "clinically purpose-built voice consult". This tier is where the product starts to do things a generic Google-Meet-clone cannot:

- **Live captions / live transcript** in companion chat — accessibility win + auto-prefill for SOAP notes.
- **Background noise suppression** — both ends sound dramatically better in a clinic / household environment.
- **In-call quick actions** — Send prescription, Order labs, Schedule follow-up, Share consent — without leaving the call.
- **Clinical templates** — one-click "Allergies?", "Current medications?", "When did symptoms start?" prompts (for junior doctors).
- **Patient-side document share** — camera capture during voice call (skin photo, prescription bottle, lab report).
- **Three-way call** — interpreter, family member, junior consult.
- **Vitals input** — BP / HR / temp typed by doctor mid-call → saved to appointment.

These are real features. Each item below has the rough surface; full task files are written when the tier is committed.

---

## Status

`Deferred` overall. **2026-04-28 partial selection:** **T3.19 (background-noise suppression) SELECTED** for the implementation batch tracked in [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). All other T3 items remain `Deferred`. Trigger to revisit the deferred items: T1 + T2 shipped, AND (Plan 10 in active design OR doctor feedback explicitly asks for one of these features twice in a quarter).

---

## What's in scope (7 items, individually optional)

> Selection markers reflect the 2026-04-28 batch. Items marked **`[NOT SELECTED 2026-04-28]`** stay `Deferred` until their independent triggers fire.

| # | Item | Effort | Hard dependencies | Notes |
|---|------|--------|-------------------|-------|
| **T3.18** | **`[NOT SELECTED 2026-04-28]`** **Live captions / live transcript** — Web Speech API on each side, sent to companion chat as `system_subtype='caption_chunk'` system messages. | L (~2 weeks) | Plan 06 system-message enum extension. | Soft-blocks Plan 10 — captions are the ideal training/seed data for SOAP-draft AI. |
| **T3.19** | **`[SELECTED 2026-04-28]`** **Background-noise suppression** — Twilio Krisp Noise Cancellation plugin (paid) or open-source RNNoise WASM. | M (~3 days) | None (vendor decision). | Krisp is a Twilio paid add-on; budget approval needed. RNNoise is free but lower quality + heavier CPU. **Sub-batch C — vendor decision needed before commit-start.** |
| **T3.20** | **`[NOT SELECTED 2026-04-28]`** **Quick-action buttons during call** — Send Rx / Order lab / Schedule follow-up / Share consent — each opens a side-panel without leaving the call. | L (~1.5 weeks) | Existing prescription / labs / scheduling backends. | The prescription path largely exists; the other three need backend hooks. |
| **T3.21** | **`[NOT SELECTED 2026-04-28]`** **Clinical templates** — pre-canned prompts ("Allergies?", "Current medications?", "When did symptoms start?", "Pain scale?") sent to companion chat OR shown as doctor-side scaffolding tooltips. | S (~2 days) | None. | Junior-doctor accelerator; configurable per specialty. |
| **T3.22** | **`[NOT SELECTED 2026-04-28]`** **Patient-side document share during call** — camera capture or file pick → uploads via the companion chat (Plan 06 attachments) → appears inline. | M (~3 days) | Plan 06 attachments shipped. | Backend pipeline already exists in Plan 06; this is a UX surface promotion (button visible during voice call, not buried in chat). |
| **T3.23** | **`[NOT SELECTED 2026-04-28]`** **Three-way call** — interpreter, family member, junior consult. Twilio supports up to N participants per room; needs RLS adjustments for multiple "patient" / multiple "observer" roles. | L (~2 weeks) | Schema extension to `consultation_session_participants`. | Big lift; very high value for India (interpreter / elder family) and global telemedicine. |
| **T3.24** | **`[NOT SELECTED 2026-04-28]`** **Vitals input** mid-call — doctor-side panel for BP / HR / temp / SpO₂ → saves to appointment vitals. | S (~2 days) | New `appointment_vitals` table OR JSONB column on appointments. | Tiny form, big workflow win for clinical follow-through. |

---

## Why each item is in T3 (not earlier)

- **T3.18 captions** — the technology is mature (Web Speech API + Whisper for the transcript persistence), but the right product surface depends on whether captions go inline in the companion chat or as a separate transcript pane. That decision benefits from Plan 10's SOAP-draft surface being designed first, otherwise we'll build the caption surface twice.
- **T3.19 noise suppression** — gating on a Twilio cost decision (~$0.005/min Krisp). At 1000 consults × 30 min = 30,000 min/mo = ~$150/mo. Worth it but needs an explicit go-ahead, not a default.
- **T3.20 quick actions** — needs a clean side-panel architecture that doesn't fight the existing companion chat layout. Better to design once after T2 caller-card lands so the spatial budget is clear.
- **T3.21 templates** — small, but the value depends on having a specialty-aware default set. Specialty taxonomy is a separate domain; gating on at least 5 doctors using the platform live so we have real specialty signal.
- **T3.22 patient-side document share** — Plan 06 attachments must ship first (the backend pipe). T3.22 is a UX surface promotion only.
- **T3.23 three-way** — biggest item in T3 by effort. Needs schema work on `consultation_session_participants`, RLS rewrites, and a participant-management UI. High value but real.
- **T3.24 vitals** — small but valuable. Could honestly be hoisted into T2 if there's a doctor pulling for it; staying in T3 because nobody has asked yet.

---

## Implementation contract per item (sketch)

### T3.18 — Live captions / live transcript

```
Architecture:
  1. Each participant runs Web Speech API in their browser
     (continuous = true, interimResults = true).
  2. Final transcripts are debounced into ~5–10s chunks.
  3. Chunk POSTs to backend → inserted into consultation_messages
     with kind='system', system_subtype='caption_chunk',
     payload={ text, lang, speaker_role, started_at_ms }.
  4. Companion chat renders these inline with a small CC icon.
  5. End-of-call merges all chunks into a single `consultation_captions`
     artifact, joined with the audio Composition's timestamp track.

Privacy: captions are subject to the same recording-consent gate as
audio. If consent === false, captions are NOT persisted; they remain
client-only (real-time accessibility but no transcript artifact).

UX: caption display is opt-in per participant (toggle in header).
Defaults to ON for hearing-impaired patients (profile setting),
OFF otherwise.

Quality fallback: if Web Speech API isn't available (Safari < 15.4,
Firefox), client uploads small audio chunks to backend and we run
Whisper streaming. Higher cost; only fires for unsupported browsers.
```

### T3.19 — Background-noise suppression

```
Decision matrix:

| Option | Cost | Quality | CPU |
|--------|------|---------|-----|
| Twilio Krisp plugin     | ~$0.005/min | Excellent | Low (cloud) |
| RNNoise WASM (in-browser)| Free        | Good      | Medium       |
| None (status quo)       | Free        | Baseline  | None         |

Recommendation: Krisp for v1 of T3.19, behind a per-doctor opt-in
toggle. Doctors with quiet clinics can leave it off; doctors in
shared spaces / from-home benefit immediately.

Implementation: Twilio Video SDK supports the Krisp plugin natively —
~10 lines of init code. Subscribe to plugin status events to expose
"noise suppression: on / off / failed" in the header.
```

### T3.20 — Quick-action buttons

```
UI: doctor-side toolbar additions to the VoiceConsultRoom controls bar:
  [🎙 Mute] [🔊 Speaker] [+ Send Rx] [🧪 Order labs]
  [📅 Schedule follow-up] [📄 Share consent] [📞 End]

Each opens a side panel that slides over the right ~33% of the canvas
(companion chat compresses) — NOT a modal that blocks the call.

Send Rx:
  Reuses existing prescription draft → render + send via Plan 06's
  inline attachment + IG-DM fan-out. Already exists; quick-action is
  just a shortcut into the existing flow.

Order labs:
  New: list of lab tests (pre-curated catalog), select tests, generate
  PDF order, send to patient inline + via DM. Backend service:
  lab-order-service.ts (NEW).

Schedule follow-up:
  Reuses existing slot-selection booking flow, prefilled with the
  current doctor + patient + reason="follow-up of {original reason}".
  Pre-payment? — flat-fee follow-ups are free (configurable per doctor).
  In-call → no payment screen, just "follow-up scheduled for {slot}".

Share consent:
  Pre-uploaded consent PDFs (from doctor's documents library) → patient
  inline + DM + signature capture (e-sign integration deferred to v2).

These are independent features; can ship in any order. Recommend Rx
first (already exists), labs second (highest doctor pull), follow-up
third, consent last (depends on e-sign).
```

### T3.21 — Clinical templates

```
Doctor-side panel (collapsed by default, expand from header):

  Specialty: Cardiology
  ┌──────────────────────────────────────────────┐
  │ Quick prompts                                │
  │ [Chest pain history?]                        │
  │ [Current medications?]                       │
  │ [Allergies?]                                 │
  │ [Family heart history?]                      │
  │ [Smoking / alcohol?]                         │
  │ + Custom prompt                              │
  └──────────────────────────────────────────────┘

Click → inserts the prompt as a doctor message into companion chat.
Patient sees it as a normal chat message; doctor doesn't have to type.

Templates table:
  CREATE TABLE clinical_prompt_templates (
    id uuid PK,
    specialty text,           -- NULL = generic
    prompt_text text,
    sort_order int
  );

Seed: 10–15 generic prompts + 5–10 per specialty (cardiology, ENT,
peds, derm, OB). Doctors can add custom prompts (saved per-doctor).

This is the smallest T3 item by effort — just a table + a panel.
```

### T3.22 — Patient-side document share

```
UX: a prominent "📷 Share photo / document" button in patient
VoiceConsultRoom controls (mobile: full-width sticky button).

Flow:
  1. Patient taps button.
  2. iOS / Android native picker opens (camera or library).
  3. File uploads via Plan 06 attachment pipeline → consultation_messages
     with kind='attachment'.
  4. Doctor sees the attachment inline in companion chat with a
     toast notification ("Patient shared a photo").

Doctor-side: nothing extra to build — the attachment surfaces in
companion chat the same way any other attachment does (Plan 06).

Hard dependency: Plan 06 attachments shipped (in progress as of
2026-04-27).
```

### T3.23 — Three-way call

```
Schema:
  ALTER TABLE consultation_session_participants
    ADD COLUMN role text CHECK (role IN ('doctor','patient','interpreter','observer')),
    ADD COLUMN added_by uuid REFERENCES users(id),
    ADD COLUMN added_at timestamptz DEFAULT now();

RLS rewrite: companion chat + audio room visibility now scoped to
"any participant on this session", not "doctor or original patient".
Recording artifact still readable by original doctor + patient only;
interpreters/observers don't get post-consult access.

UI:
  Doctor-side header: [+ Add participant ▾]
    → Email / phone form
    → Sends a one-tap join link via SMS/email/IG
    → New participant joins same Twilio room, audio-only
    → Companion chat shows them as a third lane

Patient-side: notified ("Dr. X added an interpreter to the call")
inline as system message; patient can /decline if they want privacy.

Twilio: same room SID, just a third connection. Recording captures
all participants' audio in the existing Composition.
```

### T3.24 — Vitals input

```
Schema:
  CREATE TABLE appointment_vitals (
    id uuid PK,
    appointment_id uuid FK,
    bp_systolic int,
    bp_diastolic int,
    heart_rate int,
    temperature_c numeric(4,1),
    spo2 int,
    weight_kg numeric(5,2),
    height_cm numeric(5,1),
    notes text,
    captured_at timestamptz,
    captured_by uuid FK users
  );

Doctor-side panel (slide-in side panel like T3.20):
  ┌──────────────────────┐
  │ Vitals               │
  │ BP    [120] / [80]   │
  │ HR    [78]           │
  │ Temp  [98.6]    °F/°C │
  │ SpO₂  [98] %         │
  │ Weight[72] kg        │
  │ Height[170] cm       │
  │ Notes [           ]  │
  │                      │
  │ [Save]               │
  └──────────────────────┘

Auto-saves every 5s OR on explicit Save. Vitals attach to the
appointment record and surface in the doctor's note view + the
post-consult summary (T4).
```

---

## Acceptance criteria (per item — committed individually)

Each T3 item can ship independently. Acceptance criteria are spelled out in the per-item task files when committed. The shared bar is:

- [ ] Backend + frontend type-check + lint clean.
- [ ] No regression on T1 / T2 items.
- [ ] Companion chat layout still works on mobile + desktop.
- [ ] Recording continuity (consent rules + Composition) preserved.
- [ ] Mobile parity: every item works on iOS Safari + Android Chrome OR has an explicit fallback documented.

---

## Files expected to touch (cross-tier; per-item subsets at commit)

**Backend:**

- `backend/src/services/voice-caption-service.ts` (**new**, T3.18) — caption chunk persistence + Whisper-fallback streaming.
- `backend/src/services/lab-order-service.ts` (**new**, T3.20).
- `backend/src/services/clinical-prompt-template-service.ts` (**new**, T3.21).
- `backend/src/services/appointment-vitals-service.ts` (**new**, T3.24).
- Plan 06 system-message subtype additions: `'caption_chunk'`, `'participant_added'`, `'vitals_captured'`.

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — quick-action toolbar, vitals + templates panels, three-way participant lane.
- `frontend/components/consultation/CaptionsPane.tsx` (**new**, T3.18).
- `frontend/components/consultation/QuickActionsToolbar.tsx` (**new**, T3.20).
- `frontend/components/consultation/ClinicalTemplatesPanel.tsx` (**new**, T3.21).
- `frontend/components/consultation/VitalsPanel.tsx` (**new**, T3.24).
- `frontend/components/consultation/AddParticipantDialog.tsx` (**new**, T3.23).

**Schema (multiple migrations, additive):**

- `clinical_prompt_templates`, `appointment_vitals`, `consultation_captions` tables.
- `consultation_session_participants` extension (T3.23).
- `consultation_messages.system_subtype` enum extensions.

---

## Open questions (deliberate; decide at commit time)

1. **Krisp budget approval** (T3.19) — finance sign-off on ~$150/mo at 1000 consults.
2. **Caption privacy doctrine** (T3.18) — when consent === false, do captions remain client-only? Locked recommendation: yes. Need to document in Plan 02.
3. **Three-way recording semantics** (T3.23) — interpreter audio is in the Composition, but should it be redacted from the post-consult artifact for privacy? Clinical legal review needed.
4. **Specialty taxonomy** (T3.21) — owned by which domain? Recommendation: introduce a small `medical_specialties` table in Plan 03 (doctor-modality launcher) before T3.21 ships, so templates have a reliable foreign key.
5. **Vitals as full table vs JSONB** (T3.24) — full table wins for reporting / search; JSONB wins for schema agility. Recommendation: full table.

---

## Trigger-to-commit (when does T3 get committed?)

T3 commits when **all three** are true:

1. T1 + T2 (curated subset) shipped and stable for ≥2 weeks.
2. Plan 06 attachments shipped (T3.22 unblocks).
3. EITHER Plan 10 in active design OR ≥3 explicit doctor requests for live captions / quick actions / vitals in a quarter.

If only condition 1 is true, individual T3 items can be cherry-picked (vitals, templates, noise suppression are all fully decoupled).

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md)
- [plan-t2-voice-real-polish.md](./plan-t2-voice-real-polish.md)
- [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md)
- [plan-10-ai-clinical-assist-deferred.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-10-ai-clinical-assist-deferred.md) — soft-blocker for T3.18 caption surface design.
- Web Speech API — `SpeechRecognition`.
- Twilio Krisp plugin — pricing + integration docs (verify at PR time).

---

**Owner:** TBD (per-item; assigned at commit).  
**Created:** 2026-04-27.  
**Status:** Drafted. **2026-04-28 partial selection: T3.19 SELECTED**, sequenced into sub-batch C of [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Other items remain `Deferred`.
