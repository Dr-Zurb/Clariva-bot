# Clinic link — product plan

> **Source:** Planning chat 2026-09-23. The booking link the bot sends and the link a clinic puts in its bio are the same page. Meta approval does not change the page. It only changes whether confirmation can also go back into the DM.
>
> **Status:** Phase 1 gate walked 2026-09-24. Phase 2 gate walked 2026-09-27. A live SMS is still unsent because Twilio is not configured. Phase 3 gate walked 2026-09-27 → [`p3-photos`](../Daily-plans/September%202026/23-09-2026/clinic-link/p3-photos/). Phase 4 gate walked 2026-09-27 → [`p4-show-up`](../Daily-plans/September%202026/23-09-2026/clinic-link/p4-show-up/). The follow-up order list stays dark.
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Prefix:** `clk`. Number continuously across phases.
>
> **Phase 1 batch:** [`Daily-plans/September 2026/23-09-2026/clinic-link/p1-public-book/`](../Daily-plans/September%202026/23-09-2026/clinic-link/p1-public-book/). Later phases are sibling `p{N}-` folders in that same `clinic-link/` folder, not under a later day's date.

---

## North star

> A person with no Instagram account opens a clinic's link, books a visit, and the doctor sees name, age, sex, phone, and why today. After the slot is held, the same person can optionally leave medicines, allergies, conditions, the story of this illness, and photos of old papers. The doctor accepts the words. The desk's own history and uploads stay as they are.

After this plan ships:

1. Each practice has one stable URL, `/d/:slug`. The bio uses it plain. The bot sends the same page with an optional conversation token.
2. Booking is a form: clinic card, slot, name, age, sex, phone, one-line reason, consent, then pay or join the queue.
3. Prep starts only after the appointment exists. Every prep step skips.
4. Patient medicines, allergies, and conditions go into the existing sidecar with `source = 'patient'`. They reach the chart when the doctor accepts them.
5. Photos go into the existing `visit_documents` with `source = 'patient'`.
6. Reminders stay the messages that already exist. They point at this page. No new Instagram stage.

---

## Why this is worth doing now

1. **The bio link has to work if Meta never approves.** The current booking URL is `buildBookingPageUrl` — a short-lived token bound to a DM conversation (`slot-selection-service.ts`). A clinic cannot paste that into a bio.
2. **Intake already left the chat.** The bot is FAQ plus a link. Name, phone, reason, and consent are collected on `/book` (`public-booking-intake.ts`). This program extends that page so it can open with no conversation.
3. **The chart prep already has a home.** Desk visit prep writes `patient_history_submissions` and `visit_documents`, both of which already allow `source = 'patient'`. The patient is the second writer. A second table would be a mistake.
4. **`patients.age` and `patients.gender` already exist** (`015`, `001`). `appointments.conversation_id` is nullable (`017`), which is how a desk booking has no DM thread. Public booking uses that shape.

---

## What exists today (do not re-derive)

| Surface | State |
|---|---|
| `/book?token=` | Slot grid, queue or slot, catalog modality, name, phone, reason, consent, pay. Requires a conversation token. No age, no sex. |
| Bot handoff | `buildBookingPageUrl(conversationId, doctorId)`. Bot must not collect name, age, phone, reason, or consent in the thread. |
| Desk book | Creates an appointment with `conversation_id` null. |
| Patient columns | `patients.age` integer 1–120. `patients.gender` text. `patients.date_of_birth` optional. Do not invent a birthday from an age. |
| History sidecar | `patient_history_submissions` (`234`, `assistant` added in `235`). One row per appointment. Sources `front_desk` \| `patient` \| `assistant`. Desk upsert also writes the chart tables. Patient submit must not call that upsert. |
| Visit documents | `visit_documents` (`233`). Sources `front_desk` \| `patient`. Types: lab, imaging, discharge summary, old prescription, referral, other. Private bucket `prescription-attachments`. 10 MB cap. No patient upload route. |
| Previsit ladder | T−24h, T−30 check-in, T−15, T−5, T=0, plus join URL. Reminder, not intake. T−24h has no link. |
| Visit hub | `/my-visit?token=` — lobby, queue, join. |
| SMS | Twilio send exists and is already used for some confirmations. |
| Public history token | Specified in [`plan-history-link.md`](./plan-history-link.md) (`kind: 'history-form'`). Not built. |
| Web chat / `platform = 'web'` | Specified as integrations P3. Not this program. |

---

## Decision lock (CLK-DL-1 … CLK-DL-12)

Locked in chat 2026-09-23. Later phases inherit these. Do not re-litigate in a task file.

- **CLK-DL-1 — One page, two ways in.** Public URL is `/d/:slug`. Bio link has no token. The bot sends `/d/:slug?c=<booking token>`. Same page component as today's `/book` slot grid. `/book?token=` keeps working for links already sent.
- **CLK-DL-2 — A form, not a bot.** No web chat, no symptom checker, no model on this page. Integrations P3 (owned web chat) stays deferred and is not the bio link.
- **CLK-DL-3 — Book first.** Required: name, age, sex, phone, reason for visit, slot or queue, consent. Prep is after the appointment exists and is skippable.
- **CLK-DL-4 — Age and sex use the columns that exist.** Write `patients.age` (1–120) and `patients.gender`. Leave `date_of_birth` null. Do not add `age_years`. The form label is Sex; the column is `gender`.
- **CLK-DL-5 — No web conversation in v1.** A bio visitor creates a patient and an appointment with `conversation_id` null, the way a desk booking does. Do not add `platform = 'web'`. When `?c=` is present, attach that existing DM conversation and keep today's thread confirmation.
- **CLK-DL-6 — Slug is generated.** `doctor_settings.public_slug`, unique, editable in settings. If missing, derive one from the practice name so the bot can send the link without a setup chore. Slug is not PHI.
- **CLK-DL-7 — Patient history is sidecar plus accept.** Medicines, allergies, and conditions insert `patient_history_submissions` with `source = 'patient'`. They do not call the desk upsert and do not write `patient_allergies`, `patient_medications`, `patient_chronic_conditions`, or `prescriptions`. The doctor accepts, one item at a time, through the path that already exists. Desk write-through stays staff-only.
- **CLK-DL-8 — One sidecar row, desk wins if it got there first.** The table is `UNIQUE (appointment_id)`. Patient POST inserts only when no row exists. A second patient POST is 409. A `front_desk` or `assistant` row is not overwritten; the page hides medicines, allergies, and conditions. Illness chips still save (CLK-DL-9).
- **CLK-DL-9 — Illness chips are visit context, not the sidecar.** Four optional fields: since when, better / same / worse, what they already tried, what they want today (`new_problem` \| `follow_up` \| `reports` \| `refill`). Store them in nullable `appointments.previsit_context` JSONB. `appointments.reason_for_visit` stays the one-line reason from booking and is not copied over. On doctor accept of why-today, the chip text may seed HOPI. It does not seed the chart lists.
- **CLK-DL-10 — `actor_id` for a patient write is `patients.id`.** The column is `NOT NULL` and has no FK. Staff rows keep storing `auth.users` id. Update the column comment on both tables. Logs carry appointment id and counts only.
- **CLK-DL-11 — Photos reuse `visit_documents`.** `source = 'patient'`, same types, same 10 MB cap, client-side downscale before upload. A medicine-strip photo is type `other`. Storage prefix `{doctor_id}/patient/{appointment_id}/…` in the existing `prescription-attachments` bucket. No new bucket. No auto extract. Ordered-by for a patient upload is `outside`.
- **CLK-DL-12 — One token for prep.** Phase 2 mints `kind: 'history-form'` as specified in history-link (HL-DL-4, HL-DL-5). The SMS and the post-book page use it. Phase 3 uploads use the same token. Wrong kind, expired, and cancelled fail closed. The URL contains no name, phone, age, or clinical text. No new Instagram ladder stage. T−24h stays link-free until a later, explicit change.

Inherited, not re-derived: HL-DL-1 (sidecar, then accept), HL-DL-8 (public page never receives existing chart PHI), HL-DL-10 (versioned collection notice; wording is `⟨fill — counsel⟩`; do not ship `DRAFT-*`), DVP-DL-8 (no face photo, Aadhaar, or insurance card).

---

## Phase table

| Phase | Theme | Gate (one sentence) | Status |
|---|---|---|---|
| 1 | Public link books | A dummy patient with no chat opens `/d/:slug`, books, and the doctor sees name, age, sex, phone, and reason | **Committed** — [`p1-public-book`](../Daily-plans/September%202026/23-09-2026/clinic-link/p1-public-book/) |
| 2 | Prep on that visit | The same patient submits medicines plus “since 3 days, worse,” and the doctor accepts the medicine onto the chart; the desk screen is unchanged | **Gate walked** 2026-09-27 — [`p2-visit-prep`](../Daily-plans/September%202026/23-09-2026/clinic-link/p2-visit-prep/) |
| 3 | Photos | A photo of a dummy report is on that visit, grouped as from the patient, before the doctor starts the note | **Gate walked** 2026-09-27 — [`p3-photos`](../Daily-plans/September%202026/23-09-2026/clinic-link/p3-photos/) |
| 4 | Show up ready | A video patient can test the mic and read what to keep in front of them | **Gate walked** 2026-09-27 — [`p4-show-up`](../Daily-plans/September%202026/23-09-2026/clinic-link/p4-show-up/). Order list stays dark |

Phase 1 is the product a clinic can put in a bio. Phases 2, 3, and 4 have their gates walked. The follow-up order list stays dark until the desk pending list is a patient-safe read.

---

## Phase 1 — The link books

**Outcome.** Someone who has never messaged the clinic can book. Someone who tapped the link inside a DM still books, and that thread still hears it.

**Reuse.** `/book` slot grid, catalog modality, queue vs slot, consent checkbox, payment checkout, `patients.age`, `patients.gender`, nullable `appointments.conversation_id`, Twilio SMS.

**Build.**

- `doctor_settings.public_slug`, unique, shown in settings with a copyable URL. Generate when missing.
- `/d/:slug` renders the clinic name and the next opening, then the current slot grid and intake.
- Intake adds age (1–120) and sex beside name, phone, reason, and consent. Extend the consent sentence to name age and sex. Same privacy notice link.
- Checkout creates the patient and the appointment with no conversation. `date_of_birth` stays null.
- If `?c=` verifies as a booking token for this doctor, set `conversation_id` and send the confirmation the DM path already sends.
- SMS the phone they typed: practice, when, and nothing clinical beyond the time. This SMS fires for a bio booking. It also fires for a token booking if that path does not already SMS.

**Gate.**

- [x] Dummy patient, no token: books a slot or joins the queue. Doctor sees the appointment with name, age, sex, phone, reason. — 2026-09-24
- [x] Same page with a valid `?c=` for that doctor: appointment is tied to the conversation, and the thread confirmation still sends. — 2026-09-24
- [x] A token for another doctor, or an expired token, does not attach a conversation and does not leak the other practice. — 2026-09-24
- [x] Slug is editable, unique, and not derived from a patient name. — 2026-09-24
- [x] `/book?token=` for an already-sent link still books. — 2026-09-24
- [x] Logs: ids and counts only. No name, phone, age, or reason. — 2026-09-24

**Not this phase.** History, photos, illness chips, camera check, share sheet, `platform = 'web'`.

---

## Phase 2 — Prep on that visit

**Outcome.** After the slot is held, the patient can leave the repetitive history. Skipping still leaves a valid appointment.

**Reuse.** `patient_history_submissions` shape (why today, allergies, medicines, conditions, `none`). Doctor accept path. History-link token rules. Do not call the desk upsert.

**Build.**

- Post-book screen on the same session, skip as visible as continue. The SMS from Phase 1 gains the prep URL.
- Mint `kind: 'history-form'` bound to `appointmentId`, expiry per HL-DL-5. Public route renders an empty form. Never pre-fill from the chart.
- Medicines, allergies, conditions, each a short list or “none.”
- Four chips into `appointments.previsit_context`: since when, course, already tried, aim.
- Insert the sidecar only when the appointment has no row. `source = 'patient'`, `actor_id = patient_id`, `why_today` = the booking reason (so accept still has a string). Second POST is 409.
- If a desk or assistant row exists, hide the three lists and still allow the chips.
- Collection notice slot + `notice_version` on the row. Wording stays `⟨fill — counsel⟩`.

**Gate.**

- [ ] Dummy patient submits “Telma 40” and “since 3 days, worse.” Chart tables are unchanged until the doctor accepts. Accept writes `patient_medications` with `source = 'self'`.
- [ ] Second submit is 409. A desk row is byte-identical after a patient opens the link.
- [ ] Public GET does not return existing allergies, medicines, or conditions.
- [ ] Join tokens and booking tokens cannot submit prep.
- [ ] Desk history UI is unchanged.

**Not this phase.** File upload, camera check, follow-up order list, phone OTP, “same as last time.”

---

## Phase 3 — Photos

**Outcome.** Old papers and medicine strips are on the visit before the consult, labelled as the patient's.

**Reuse.** `visit_documents` types, 10 MB server cap, signed-URL read the desk already uses, Reports grouping. Client downscale (DVP-Q4).

**Build.**

- Upload on the prep page, same history-form token. Camera or file.
- `source = 'patient'`, `actor_id = patient_id`, `ordered_by = 'outside'`, path prefix `{doctor_id}/patient/{appointment_id}/`.
- Types already on the table. A strip is `other`.
- Cap count (five files per appointment for this source). Patient cannot delete after the visit is opened. Before that, the patient may remove their own upload.
- Doctor sees them beside desk documents, grouped “from the patient.” No extract button on these files in this phase.

**Gate.**

- [x] A dummy report photo appears on the visit before `ensurePrescription()`.
- [x] Desk documents and their path prefix are unchanged.
- [x] A booking token or join token cannot upload.
- [x] File bytes and filenames are absent from logs.

**Not this phase.** Lab value extraction, medicine identification from the photo, a new document type.

---

## Phase 4 — Show up ready

**Outcome.** The patient arrives able to do the visit, and a follow-up knows which paper is still missing.

**Reuse.** `/my-visit` lobby, video room, pending-order list from desk visit prep once that list is trustworthy.

**Build.**

- Three fixed lines on the prep page and the visit hub, chosen by modality: video (quiet room, strips in front of the camera), voice (somewhere they can talk), in clinic (bring the old papers).
- Share control that sends the prep URL, so the person who booked can hand it to the person who will attend.
- Camera and mic check on the video waiting room. Failure stays on that page. It does not cancel the appointment.
- Follow-up only: if the pending-order list for this patient has open tests, show the labels and let an upload attach to them. A new patient sees nothing here. If that list is not reliable yet, ship the three lines, the share control, and the mic check, and leave the order list dark.

**Gate.**

- [x] A video dummy patient can test the mic and read the video line. (2026-09-27)
- [x] Voice, in-clinic, and text each show only their own line. Text shows none. (2026-09-27)
- [x] Share sends the prep URL. The join URL is not what gets shared. (2026-09-27)
- [x] A follow-up with an open desk test sees no label in this batch. The order list stays dark until that desk list is a patient-safe read. (2026-09-27)
- [x] No new previsit DM stage. Reminder copy is unchanged. (2026-09-27)

**Not this phase.** Per-service fasting instructions, home blood pressure as signed vitals, pregnancy, a second language question if the visit already has one.

---

## Send matrix

| Origin | URL | Channel |
|---|---|---|
| Instagram / Facebook bio | `/d/:slug` | None until they submit a phone |
| Bot “book” | `/d/:slug?c=<booking token>` | DM, as today, plus SMS |
| After a bio booking | Prep URL with `kind: 'history-form'` | SMS |
| Reschedule | Existing reschedule token on `/book` | Unchanged in v1 |
| T−24h / T−30 / T−15 / T−5 / T=0 | Unchanged | No new stage |
| Desk walk-in | Desk prep, not this URL | Unchanged |

---

## Acceptance gate (program)

- [ ] A clinic can copy one URL into a bio and a stranger can book a dummy visit.
- [ ] The bot sends that same page and a DM-origin booking still attaches to the thread.
- [ ] Age and sex land on `patients.age` and `patients.gender`. Date of birth stays empty.
- [ ] Patient history and photos are tagged `source = 'patient'` and do not write the chart until accept (history) or appear as desk documents (photos).
- [ ] A desk-written sidecar and a desk-uploaded file survive a patient opening the link.
- [ ] Tokens of the wrong kind fail. URLs and logs contain no PHI.
- [ ] Typecheck, lint, and the new suites are green. `/book?token=` still books.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Unauthenticated checkout creates a real appointment and a payment | **H** | Phase 1 is the escalate slice. Same validation as `/book`. Slug resolves one doctor. No conversation is created. |
| Public POST writes doctor-asserted chart rows | **H** | CLK-DL-7. Patient path never calls the desk upsert. |
| Patient submit overwrites desk history | **H** | CLK-DL-8. Insert-if-absent. Desk row hides the three lists. |
| `actor_id` is mistaken for a staff login | **M** | CLK-DL-10. Comment update. Audit reads `source` first. |
| Prep token used as a consult join | **H** | `kind` check on both verifiers (HL-DL-4). |
| Public page leaks the chart | **H** | HL-DL-8. Empty form. |
| Collection without a notice | **H** | HL-DL-10. Slot + version. Counsel wording before production. |
| Confirmation SMS and DM both fire and disagree | **M** | SMS is the bio channel. DM confirmation only when `?c=` verified. |
| Scope becomes a portal or a chatbot | **M** | CLK-DL-2, CLK-DL-5. P3 web chat stays in the integrations roadmap. |

---

## Explicitly out of scope

| Idea | Why |
|---|---|
| Chatbot or web widget on this page | CLK-DL-2. Integrations P3 remains the deferred chat. |
| Symptom checker or triage | The product does not interpret symptoms. |
| `platform = 'web'` conversation | CLK-DL-5. Appointment with a null conversation is enough. |
| Home BP or sugar saved as signed vitals | Desk owns in-clinic vitals. A device photo would be a later document, not a vital. |
| Pregnancy or breastfeeding column | No target column. Desk prep already deferred it. |
| Family, social, or surgical history | No row until the doctor opens the note. |
| Aadhaar, face photo, insurance card | DVP-DL-8. |
| Auto lab extract on a patient photo | Staff-triggered extract stays on desk files. |
| New Instagram reminder stage | CLK-DL-12. |
| Phone OTP and “same medicines as last time” | After Phase 2 is in use. Returning match by phone can wait. |
| Per-service fasting or “full bladder” instructions | A doctor-authored line later. Phase 4 ships three fixed lines. |

---

## Relationship

- [`plan-history-link.md`](./plan-history-link.md) — patient form, token, and accept rules. This program is where that public form gets built. Do not create a second sidecar.
- [`plan-desk-visit-prep.md`](./plan-desk-visit-prep.md) — desk is the first writer and writes the chart directly. Patient writes stay sidecar-plus-accept (CLK-DL-7).
- [`integrations/plan-00-integrations-roadmap.md`](./integrations/plan-00-integrations-roadmap.md) P3 — owned web chat stays deferred. The bio link is this plan.

---

## Residuals

- Collection-notice wording (`⟨fill — counsel⟩`), inherited from HL-DL-10.
- Whether the T−24h SMS, once SMS reminders exist for bio bookings, should include the prep URL. Not a new Instagram stage. Decide when Phase 2 ships.
- Returning-patient “same as last time” after a phone check.

---

**Created:** 2026-09-23.
**Last Updated:** 2026-09-27 (Phase 4 gate walked. Order list stays dark. Live SMS is still open because Twilio is not configured.)
