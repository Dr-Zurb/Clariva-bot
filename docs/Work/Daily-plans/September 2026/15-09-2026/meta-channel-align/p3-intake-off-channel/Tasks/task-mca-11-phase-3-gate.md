# Task mca-11: Sitting 4 — Phase 3 gate

Walk a dummy-patient booking: FAQ in chat, no name / phone / reason collected in-thread, form on the owned page, emergency copy still fires.

**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Depends on:** [`mca-15`](./task-mca-15-dm-link-first.md)  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-16

**Change Type:**
- [x] **Update existing** — verification; one hole closed (awaiting-slot “book for myself/other” restarted chat intake)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (dummy patient only)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## Dummy walk (2026-09-16)

No live Instagram thread. Walked the same path with focused tests:

| Step | Evidence |
|---|---|
| New booking DM hands `/book` link; no name / phone / reason / consent | `booking-entry.test.ts` mca-15 new-patient + returning/revoked cases |
| In-flight collecting / consent hands the link | `booking-funnel.test.ts` mca-15 collecting_all |
| `/book` collects details + consent; checkout blocked without consent | `page.intake.test.tsx` + `public-booking-intake.test.ts` |
| Checkout can write a placeholder patient | `slot-selection-checkout-intake.test.ts` |
| Emergency 112/108 still outranks booking | `handle-turn.test.ts` emergency head gate |
| Hole: awaiting-slot “book for myself” restarted intake | closed in `booking-funnel.ts`; covered by mca-11 test |

---

## ✅ Acceptance

- [x] Dummy patient: chat stays FAQ + link; `/book` collects details + consent
- [x] Emergency copy still fires in-thread
- [x] No name, phone, or reason collected inside the Instagram thread (new-booking path)
- [x] Residuals recorded (P2 opt-out still escalate; L10 still a later counsel send)

**Residuals**
- P2 patient opt-out is still escalate (new column).
- L10 attorney packet is still a send when counsel exists — not a P3 blocker.
- No live Instagram dummy-patient walk in this sitting (tests + `/book` RTL only).
- `/book` always shows the full form (returning patients re-enter name/phone; checkout ignores a new identity).
- Book-for-someone-else is no longer a separate in-chat identity; `/book` writes the conversation patient.
- In-flight `awaiting_match_confirmation`: “yes” still attaches an existing patient + link; “no” now hands `/book` (no in-thread intake).
- Reason-first / medical FAQ no longer interviews in-thread (2026-09-16 follow-up): `medical_query` is safety + `/book`; in-flight ask_more/confirm hands `/book` unless the turn is a fee FAQ. Golden preview/corpus aligned the same day.
- Implicit funnel intake (last-bot-asked-for-details / confirm / consent without a collecting step) now hands `/book` (2026-09-16 follow-up). Dead in-thread extract/persist path removed from `booking-funnel.ts`.
- AI reply prompt no longer describes in-thread intake. Extraction prompt is unused on the booking path; left as-is.

**Created:** 2026-09-15. **Last Updated:** 2026-09-16
