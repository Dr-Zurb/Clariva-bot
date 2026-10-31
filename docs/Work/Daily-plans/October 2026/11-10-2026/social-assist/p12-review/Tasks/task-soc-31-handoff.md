# Task soc-31: Hand a Making card to a named editor

## 📋 Task Overview

A Making card can be handed to a person the doctor names. That is a state on the card. It does not send anything, and it does not copy the note.

**Program / Phase:** social-assist · Phase 12 (review)
**Batch:** [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-social-assist-review.md`](./EXECUTION-ORDER-p12-social-assist-review.md)
**Estimated Time:** 4 hours
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **New feature** — the card has no handoff today

**Current State:**
- ✅ **What exists:** `social_cards` for the signed-in doctor. Making, the note, and Resources. Latest social migration inspected: `267_social_card_make_at.sql`.
- ❌ **What's missing:** a name and a handed state that exist only while the card is in Making.
- ⚠️ **Notes:** The name is a label, not a login. Do not add a `clinic_staff` row. Two migration files share `266`. Read the folder and take the next free number.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration, service, controller, route, contract, tests)
- No message yet (`soc-32`). No Review screen (`soc-33`).
- Do not copy the note. Do not copy Resources. Do not email anyone.

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y — a name and a state on the doctor’s card. Not a patient row.
- [ ] **RLS verified?** Y — required. Same owner rule as `social_cards`. Another doctor cannot read the row.
- [ ] **Any PHI in logs?** No — do not log the name
- [ ] **External API or AI call?** N
- [ ] **Retention / deletion impact?** Y — leaving Making clears the handoff. Deleting the card deletes it. Follow the neighbouring `doctor_id` delete.

---

## ✅ Task Breakdown

### 1. Record
- [ ] 1.1 Read social-card migrations in numeric order before adding the next one
- [ ] 1.2 A Making card can store a display name and the state “with the editor”. No patient columns. No login id.
- [ ] 1.3 The note is not written onto the handoff
- [ ] 1.4 Doctor-only access. Another doctor cannot select it

### 2. Rules
- [ ] 2.1 Handing over is refused unless the card is in Making
- [ ] 2.2 Moving the card off Making clears the name and the state
- [ ] 2.3 The name and the state are not logged

### 3. Verification
- [ ] 3.1 A test hands a Making card over and reads the name back for that doctor only
- [ ] 3.2 A test shows the note is unchanged and is not a field of the handoff
- [ ] 3.3 A test moves the card to Ready and shows the handoff is gone

---

## 📁 Files to Create/Update

- ⚠️ Next social-card migration after the highest number on disk
- ⚠️ `backend/src/services/social-card-service.ts`
- ⚠️ `backend/src/controllers/social-card-controller.ts`
- ⚠️ `backend/src/routes/api/v1/social-cards.ts`
- ⚠️ [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- ⚠️ [DB_SCHEMA.md](../../../../../../../Reference/engineering/architecture/DB_SCHEMA.md)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- ED-1, ED-7, ED-9, ED-10.
- “With the editor” is the only state this task writes. A later “back” state is not created here.
- Resources stay where they are.

---

**Last Updated:** 2026-10-31
**Status:** ⏳ PENDING
