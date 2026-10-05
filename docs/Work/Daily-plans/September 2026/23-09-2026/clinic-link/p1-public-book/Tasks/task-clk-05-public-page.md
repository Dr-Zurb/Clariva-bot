# Task clk-05: Public booking page

## 📋 Task Overview

`/d/:slug` is the clinic card, the slot grid, and the intake. It collects age and sex as well as the fields `/book` already collects. A `?c=` on the URL is passed through to checkout. Success is the existing success page.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **Update existing** — reuse the `/book` slot grid and intake
- [x] **New feature** — the `/d/:slug` route

**Current State:**
- ✅ **What exists:** `frontend/app/book/page.tsx` (token, dates, slots, catalog, name, phone, reason, consent). `frontend/lib/public-booking-intake.ts` validates those four. `frontend/app/book/success/page.tsx` exists.
- ❌ **What's missing:** a route that loads by slug, age, sex, and a consent line that names age and sex.
- ⚠️ **Notes:** Waits on clk-04 so `?c=` is accepted by checkout. Do not fork a second slot grid. `/book?token=` stays.

**Scope Guard:**
- Expected files touched: ≤ 5 (the book page or a shared piece of it, `/d/:slug`, intake helper, API client, one frontend test)
- Do not add history, uploads, or a chat
- Do not send the visitor to Instagram after a slug booking
- No patient values in client logs

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — the form collects PHI and posts it to clk-03
- [x] **RLS verified?** N/A — no new table. The write is clk-03.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Open the clinic
- [x] 1.1 `/d/:slug` shows the practice name and the next opening, then the current slot or queue grid
- [x] 1.2 Unknown slug shows a not-found state, not another clinic
- [x] 1.3 Pass `?c=` through on checkout when it is present. Omit it when it is absent.

### 2. Intake
- [x] 2.1 Add age (1–120) and sex (`male` / `female` / `other`) beside name, phone, and reason
- [x] 2.2 Extend the consent sentence so it names age and sex. Keep the existing privacy-notice link.
- [x] 2.3 Block continue until the same fields clk-03 requires are present, including consent

### 3. Verification
- [x] 3.1 Frontend test: missing age or consent cannot submit; a filled form posts the slug checkout fields
- [x] 3.2 Typecheck and lint the touched files
- [x] 3.3 Browser: dummy patient books from `/d/:slug` and lands on the existing success page

---

## 📁 Files to Create/Update

- ⚠️ `frontend/app/book/page.tsx` — EXISTS, token-only
- ❌ `frontend/app/d/[slug]/page.tsx` — MISSING
- ⚠️ `frontend/lib/public-booking-intake.ts` — EXISTS, no age or sex
- ⚠️ Frontend booking API client — EXISTS, token checkout
- ❌ or ⚠️ Frontend test next to the book intake test — the token intake test EXISTS

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One slot grid. The slug route and the token route share it.
- Consent copy stays short. Same privacy notice.
- Do not render another practice's name on a bad slug.
- Success redirect is `/book/success`, not Instagram.

---

## ✅ Acceptance & Verification Criteria

- [x] A dummy patient can book from `/d/:slug` with name, age, sex, phone, reason, and consent — 2026-09-23
- [x] Queue mode and slot mode both use the existing grid — 2026-09-23
- [x] `/book?token=` still renders and still books — 2026-09-23
- [x] Browser check of the slug path is recorded on this task when it passes — 2026-09-23

---

## 📝 Notes

CLK-DL-1, CLK-DL-2, CLK-DL-3. Browser check on the local app: an unknown slug shows not-found, and a dummy booking on a practice with openings lands on `/book/success` on the same site with no Instagram link. Those dummy visits were cancelled afterward. `/book?token=` is covered by the existing intake test. Queue and slot still share this page.

---

## 🔗 Related Tasks

- [`task-clk-04-optional-conversation.md`](./task-clk-04-optional-conversation.md)
- [`task-clk-06-booking-sms.md`](./task-clk-06-booking-sms.md) — parallel, do not couple

**Last Updated:** 2026-09-23
