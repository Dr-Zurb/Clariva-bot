# History link — product plan

> **Source:** `Business/tracks.md` P1 (30 Aug product order #1) and W36 Tue/Wed. After book — and later at desk check-in — the patient gets an external form; answers are on the chart **before the doctor opens it**. The form does not exist today. The bot only books and reminds.
>
> **Status:** Phase 1 **Drafted** 2026-08-31 → [`Daily-plans/August 2026/31-08-2026/history-link/`](../Daily-plans/August%202026/31-08-2026/history-link/). Spec only. **Not promoted. Do not implement from Auto** — first build wave is a new PHI store + public write path (Opus).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Out of this sitting:** desk payments, vitals capture, new bot intents, teleconsult polish, ambient walk-in (VN-DL-9 / Phase 3).

---

## North star

> A booked or walk-in patient fills a short form on their own phone. When the doctor opens the visit, allergies, current medicines, known conditions, and why-today are already sitting on the chart as **patient-reported evidence**, ready to accept — not as a blank Subjective tab.

After this plan ships:

1. The booking-confirmation DM (and, later, a desk action at check-in) carries one public link. No app install, no login.
2. The patient answers four things: why today, allergies, current medicines, known conditions. Nothing else in v1.
3. Submitting writes a **sidecar** row. It does **not** insert into `patient_allergies` / `patient_chronic_conditions` / `patient_medications` / `prescriptions`. Those tables are doctor-scoped (`auth.uid() = doctor_id`) and doctor-asserted.
4. Opening the visit shows a review strip. Per-item accept copies an item onto the matching chart table (or seeds `cc` / `hopi` on the Rx form). No bulk accept. No silent write.

---

## Why this is worth doing now

1. **The desk and bot already create the appointment.** Walk-in intake, booking confirmation, and the previsit notify ladder all exist. The missing piece is one link and one form.
2. **The chart tables already exist.** Allergies (`087`), chronic conditions (`087`), medications (`128`) render on Subjective via `AllergiesSection` / `ChronicConditionsSection` and the medications section. FH / SH / PSH live on the *prescription* (`116` / `126` / `127`) and have no row until the doctor starts a note — so they are the wrong first target.
3. **The token pattern is already house style.** Consultation join and Rx share are both `base64url(payload).hmac`, bound to an id, `kind`-discriminated, PHI-free URL. Copy that; do not invent a session table for a link.
4. **The trust model is already locked** on visit-narrative (VN-DL-12): the patient's words are evidence; the doctor asserts. This program inherits that instead of writing "patient-authored" rows that look like the doctor typed them.

---

## What exists today (do not re-derive)

| Surface | State |
|---|---|
| Bot book + remind | Shipped. Confirmation DM fires for in-clinic too (`PaymentConfirmationModality` includes `in_clinic`). Desk phone confirmation **skips walk-ins**. |
| Previsit notify ladder | T−24h / T−30 / T−15 / T−5. Reminder, not intake. |
| Patient public routes | `/c/text|voice|…?t=`, `/c/history/[sessionId]?t=` (**chat** history, not medical), `/my-visit?token=`, `/r/[id]?t=`, `/book`. **No intake form.** |
| HMAC tokens | `consultation-token.ts` — `{ appointmentId, exp, role: 'patient' }`, 24h default. `prescription-token-service.ts` — `{ rxId, exp, kind: 'rx-share' }`, own secret, `wrong_kind` rejection. |
| Chart | `patient_allergies`, `patient_chronic_conditions`, `patient_vitals` (`087`); `patient_medications` (`128`). All doctor-scoped, soft-delete `archived_at`, RLS on `auth.uid() = doctor_id`. **Doctor-only. No patient writer.** |
| Visit narrative | `cc` / `hopi` on the Rx form; complaint cards. No row until the doctor opens the visit. |
| Patient-authored clinical text | **Does not exist.** |

---

## Decision lock (HL-DL-1 … HL-DL-10)

- **HL-DL-1 — Sidecar first, chart on accept.** Patient submit writes `patient_history_submissions` (name locked in the batch). It never INSERTs the four chart tables or `prescriptions`. Accept is a doctor action, one item at a time. **No "Add all".**
- **HL-DL-2 — Four fields in v1.** Why today · allergies · current medicines · known conditions. Deferred: family / social / surgical history, vitals, insurance, ROS, menstrual/obstetric, files/photos, "anything else" mega-box.
- **HL-DL-3 — Why-today is visit-scoped; the other three are patient-scoped.** Accept of why-today seeds `prescriptions.cc` / `hopi` (or the complaint-card list) on this visit only. Accept of an allergy / medicine / condition creates a row on the existing patient-level table, doctor-scoped to the acting doctor.
- **HL-DL-4 — House HMAC, own kind.** Token = `base64url(payload).hmac`, payload `{ appointmentId, exp, kind: 'history-form' }`. Verify rejects wrong `kind` (join, Rx-share, **and booking** tokens cannot submit history). Bound to `appointmentId` in the URL — do **not** reuse `booking-token.ts` (that one binds `conversationId` + `doctorId`, TTL 1h, and is the slot-picker). PHI never in the URL. Re-presentable until expiry; after submit the same link is read-only ("already sent").
- **HL-DL-5 — Expiry is the visit, not a calendar day.** Booked: valid from mint until the appointment's scheduled end + 2 hours. Walk-in / desk-minted: 2 hours from mint. Cancelled or no-show: verify fails. Expired → 410, same as `/r/[id]`.
- **HL-DL-6 — One submission per appointment.** Second POST is rejected. A correction is a later visit, or the doctor edits the chart. The row is append-only.
- **HL-DL-7 — Send on the payment-confirmation DM; desk is the walk-in path.** The bot already sends several messages: slot/payment link (`formatBookingLinkDm`), then `buildPaymentConfirmationMessage` after pay, then a T−24h reminder that **explicitly has no link**, then join URLs from T−30. **This link rides the payment-confirmation (and the desk phone confirmation, which uses the same body minus the payment line).** Do not put it on the slot-picker DM (patient has not booked yet) and do not add a fifth previsit stage. Desk: same URL at check-in for walk-ins and for booked no-submits. Walk-ins get no DM (desk confirmation already skips them).
- **HL-DL-8 — Do not pre-fill the public page with existing chart PHI.** A leaked link must not dump the allergy list. Returning-patient dedup happens on **accept**, case-insensitive name match against non-archived rows.
- **HL-DL-9 — No AI on the patient form.** Structured short answers only. The doctor already has the describe box for messy prose.
- **HL-DL-10 — Collection notice is counsel's words.** The form is a point-of-collection for health data (`tracks.md` L9). Engineering ships a slot for a versioned notice and a `notice_version` snapshot on the submission row. Wording is `⟨fill — counsel⟩`. Do not reuse retired recording-consent `v1.0`. Do not ship a `DRAFT-*` notice to production.

---

## Open questions — recommended defaults

| ID | Question | Recommendation | Status |
|---|---|---|---|
| **HL-Q1** | Write-through to chart tables vs sidecar? | Sidecar (HL-DL-1). Chart RLS is doctor-only; write-through would mint doctor-asserted rows from an unauthenticated POST. | **Locked** |
| **HL-Q2** | Own secret vs shared `CONSULTATION_TOKEN_SECRET`? | Own `HISTORY_FORM_TOKEN_SECRET`, same 16-char minimum as the other two. `kind` is the discriminator; a separate secret is defence in depth if a join token is ever minted without `kind`. | Recommended — confirm at promote |
| **HL-Q3** | Seed `hopi` with the raw why-today, or only `cc`? | `cc` gets the first line / 120 chars; `hopi` gets the rest if longer. Doctor can edit before sign. | Recommended |
| **HL-Q4** | Returning patient who already has chart rows? | Form still asks (HL-DL-8). Accept dedupes. Medicine/condition "none" creates no row; allergy "none" sets NKDA (`222`). | **Locked** |
| **HL-Q5** | Who may mint the desk link — doctor or staff? | Either, scoped to the appointment's doctor. Staff already create walk-ins. | Recommended |
| **HL-Q6** | Teleconsult too, or in-clinic only? | **All booked modalities.** The doctor still opens a chart. Voice/video already get a join link; this is a second link on the same confirmation, not a replacement. | Recommended |

---

## Phase table

| Phase | Theme | Tasks | Gate (one sentence) | Status | Folder |
|---|---|---|---|---|---|
| 1 | Form → reviewable evidence | `hl-01..06` | A booked patient can open a link, submit four fields, and the doctor sees them on the visit as accept-cards that write the real chart tables | **Drafted** | [`p1-form-to-chart/`](../Daily-plans/August%202026/31-08-2026/history-link/p1-form-to-chart/) |
| 2 | Desk send | `hl-07..` | Walk-in at check-in gets the same link; booked no-submit is one tap to re-send | Deferred until Phase 1 gate | — |

**Prefix:** `hl`. Number continuously across phases.

**Plan rules:** When Phase 1 R-items / locks are accepted, promote to `Committed` in the dated folder above. Later phases are sibling `p{N}-` subfolders in the same `history-link/` folder, not under a later day's date.

---

## Field → column map (v1)

| Form field | Patient sees | Stored on submit | On accept |
|---|---|---|---|
| Why today | Short text, required | `why_today` TEXT on the submission | Seeds this visit's `prescriptions.cc` (+ `hopi` if long — HL-Q3). **Not** `appointments.reason_for_visit` — that is booking intake and stays where it is. |
| Allergies | Repeatable name + optional reaction; or "none" | JSON list on the submission | Named items → `patient_allergies` (`allergen`, `reaction`, `severity='unknown'`). **"None" → `patient_allergies_section_notes.no_known_allergies`** (`222`), not a dummy allergen row. |
| Current medicines | Repeatable name + optional dose; or "none" | JSON list | `patient_medications` (`drug_name`, `dose`, `status='active'`, **`source='self'`** — the enum already exists on `128`/`134`). "None" creates no row. |
| Known conditions | Repeatable name; or "none" | JSON list | `patient_chronic_conditions` (`condition` only in v1; ignore the later acuity/code columns). "None" creates no row. |
| — | — | `appointment_id`, `patient_id`, `doctor_id`, `notice_version`, `submitted_at` | Provenance: accepted_by + accepted_at on the submission item or a small accept log — **no clinical text copied into a second store** |

**Explicitly not written:** `patient_vitals`, `prescriptions.family_history` / `social_history` / `past_surgical_history`, insurance (no table), `hopi` except the HL-Q3 remainder.

---

## Send matrix

| Origin | When | Channel | Mint |
|---|---|---|---|
| Bot book (paid) | On `buildPaymentConfirmationMessage` — after pay, before any previsit stage | Same DM thread | Server, when that confirmation is sent |
| Desk phone pre-book | Same helper body minus the payment line (`sendDeskBookingConfirmationToPatient`) | Same | Same mint |
| Slot / payment link DM | **Never** — patient has not booked yet | — | — |
| T−24h / T−30 / T−15 / T−5 / T=0 | **Not in v1** — T−24h is written to have no link; later stages already carry the join URL | — | — |
| Desk walk-in | Check-in | Show URL / QR; optional SMS if a phone exists | Desk action |
| Desk booked, not submitted | Check-in | Same | Desk action |
| Cancelled / no-show | Never | — | Existing tokens fail verify |

Phase 1 ships the bot row. Desk mint is stubbed as a service function; the desk button is Phase 2 so this sitting does not grow a second UI.

---

## Acceptance gate (program)

- [ ] Unauthenticated GET of `/h/:appointmentId` with a valid `kind: 'history-form'` token renders the form. Wrong kind, expired, cancelled → no form.
- [ ] POST writes one sidecar row; a second POST is 409. Chart tables unchanged until accept.
- [ ] Opening the visit shows the submission. Per-item accept writes the mapped table. Allergy **"none" sets NKDA** (`222`); medicine/condition "none" creates no row. Duplicate name (case-insensitive, non-archived) is refused or merged — never a second identical row.
- [ ] Public page never receives existing chart PHI (HL-DL-8).
- [ ] Token URL contains no name, phone, DOB, or clinical string.
- [ ] Logs: appointment id + counts only. No answers.
- [ ] Type-check + lint + new suites green. Booking-confirmation copy snapshot updated, not rewritten by accident.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Unauthenticated POST writes doctor-asserted chart rows | **H** | HL-DL-1 — sidecar only |
| History token used as a consult join token | **H** | `kind` check on both verifiers |
| Public page leaks existing allergies | **H** | HL-DL-8 — empty form, always |
| Collection without a notice | **H** | HL-DL-10 — slot + version snapshot; counsel wording |
| Two "none" / typo rows pollute the chart | **M** | Accept-time dedup; "none" creates nothing |
| Confirmation DM becomes a wall of links | **M** | One extra line on the existing message, not a new DM |
| Patient edits after the doctor accepted | **M** | HL-DL-6 — one submit; doctor owns the chart after |
| Scope into a full intake EMR | **M** | HL-DL-2 — four fields. Desk payments stay out. |

---

## Residuals (not this program)

- L9 collection-notice wording (`⟨fill — counsel⟩`).
- Desk payments / walk-in fee (P1 #2 — after this spec exists, not in the same sitting).
- Previsit-ladder "please fill this" nudge. Do not collide with T−24h's "we'll send the link later" copy.
- T3.21 in-chat intake (`form_request` / `form_response` on `consultation_messages`) — parked, mid-consult, doctor-initiated. **Not this form.**
- Patient login / portal (`/my-visit` is a consult hub, not a shell for this).
- Ambient walk-in audio (visit-narrative Phase 3).

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (drafted; recon folded — payment-confirmation send point, NKDA, `source='self'`)
