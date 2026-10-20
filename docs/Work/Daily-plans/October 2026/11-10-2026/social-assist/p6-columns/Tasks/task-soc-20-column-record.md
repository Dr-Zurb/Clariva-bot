# Task soc-20: A column the doctor owns

## 📋 Task Overview

The doctor can have columns of their own, stored with their other cards. The four opening columns stay. A card that is already on the board stays in the same one. A posted card stays off the board.

**Program / Phase:** social-assist · Phase 6 (columns)
**Batch:** [`plan-p6-social-assist-columns-batch.md`](../plan-p6-social-assist-columns-batch.md)
**Execution order:** [`EXECUTION-ORDER-p6-social-assist-columns.md`](./EXECUTION-ORDER-p6-social-assist-columns.md)
**Estimated Time:** 6 hours
**Status:** ✅ **COMPLETED** — 2026-10-12.

**Change Type:**
- [x] **New feature** — columns the doctor names
- [x] **Update existing** — a card’s place on the board

**Current State:**
- ✅ **What exists:** One card row per doctor, placed in thoughts, chosen, making, ready, or posted. Ready requires a file. A time requires Ready and a file. Leaving Ready clears the file and the time. Posted requires the Instagram URL and is not a column. Account deletion deletes the cards.
- ❌ **What's missing:** A place to store a named column for one doctor, and a way for a card on the board to sit in it.
- ⚠️ **Notes:** Read migrations in numeric order through `251`. Ignore duplicate `* N.sql` files. Do not put the column on `visit_page_links`.

**Scope Guard:**
- Expected files touched: ≤ 8, the card record, its API, and the docs that describe the card
- The board control that adds the column is `soc-21`
- Do not change the visit count or the public booking page
- Do not log a column name or a card title

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-3, DL-7

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a doctor-owned list of columns, and which column a card is in. A column name is not a patient field. It still must not be logged.
- [x] **RLS verified?** Y — owner select and owner modify, and the service also filters by the signed-in doctor
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — deleting the account deletes the columns with the cards. Deleting a named column is `soc-21`’s action; the record must be able to put those cards back in Thoughts and ideas

---

## ✅ Task Breakdown

### 1. Record
- [x] 1.1 Read migrations through `251` before adding the next one
- [x] 1.2 Each doctor has the four opening columns, in order, and may have named columns that sit before Ready
- [x] 1.3 A card already in Thoughts and ideas, Chosen, Making, or Ready is still in that column. A posted card is still off the board, with its URL and visit count
- [x] 1.4 A named column does not hold a file or a time. Moving a Ready card into one clears the file and the time, the same as leaving Ready today
- [x] 1.5 Another doctor cannot list or change the columns. Logs are ids only

### 2. Verification
- [x] 2.1 Tests: existing cards stay put; a second doctor gets nothing; Ready without a file is still rejected; a posted card is not placed in a column
- [x] 2.2 Update `CONTRACTS.md` and `DB_SCHEMA.md` for the column the doctor owns
- [x] 2.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ The card record and its API — a card on the board can sit in a named column
- ❌ A doctor-owned column record — MISSING
- ⚠️ `CONTRACTS.md` and `DB_SCHEMA.md`

**When creating a migration:**
- [x] Read previous migrations in numeric order

**When updating existing code:**
- [x] Audit callers that treat the four places as the only places a card can sit
- [x] Keep posted, the file rule, and the time rule

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The four opening columns are not optional and are not deleted.
- A named column is a stage. It is not a topic tag.
- No patient id on the column.
- No Instagram call.

---

**Last Updated:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
