# e-task-1: Practice currency on Practice Info + remove flat appointment fee from Booking Rules

## Task overview

**Problem:** Booking Rules still shows **Appointment fee** + currency while the product direction is **service-catalog pricing** only. Currency must stay in the system (quotes, catalog minor units) but should be edited under **Practice Info**, not tied to a deprecated flat fee.

**Goal:**

1. Remove the **appointment fee** section (amount + duplicate currency control) from **Booking Rules**.
2. Add **Practice currency** (maps to existing `appointment_fee_currency` in API/DB) to **Practice Info** with clear copy.
3. (Optional v1.1) When **`country`** is added to Practice Info UI (field exists in `DoctorSettings` but is not wired in dashboard today), **default** currency from ISO country → ISO 4217 (e.g. `IN` → `INR`, `US` → `USD`) on first set; doctor can override.

**Out of scope:** Renaming DB column `appointment_fee_currency` → `practice_currency` (optional future migration; not required for this task).

**Change type:**

- [x] Frontend (Practice Info, Booking Rules)
- [ ] DB migration (reuse existing columns)
- [x] Docs / copy only on dashboard

---

## Reference (code anchors)

- `frontend/app/dashboard/settings/practice-setup/booking-rules/page.tsx` — form, `toForm`, `handleSubmit` PATCH fields
- `frontend/app/dashboard/settings/practice-setup/practice-info/page.tsx` — `toForm`, `handleSubmit`, fields layout
- `frontend/types/doctor-settings.ts` — `PatchDoctorSettingsPayload` already includes `appointment_fee_currency`
- `backend/src/services/doctor-settings-service.ts` — allowed PATCH keys include `appointment_fee_currency`
- Services catalog clear-modal copy references flat fee — update string in `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`

---

## Task breakdown

### 1. Booking Rules page

- [x] Remove the amber “Appointment fee” card (fee amount + currency `<select>`).
- [x] Remove `appointment_fee` / `appointment_fee_currency` from local form state for this page **or** stop sending `appointment_fee_minor` / `appointment_fee_currency` in PATCH (prefer **omit** those keys so a save on Booking Rules does **not** clear currency unintentionally — only Practice Info PATCH updates currency).
- [x] Update page title description: remove “appointment fee”; mention slots, advance booking, cancellation, buffers.
- [x] `frontend/app/dashboard/settings/practice-setup/page.tsx` — update card description for Booking Rules if it mentions appointment fee.

### 2. Practice Info page

- [x] Extend `toForm` / `handleSubmit` to include `appointment_fee_currency`:
  - Load from settings; default `INR` if null for **display** in select.
  - PATCH `appointment_fee_currency` (3-letter uppercase) on save together with practice name / timezone / specialty / address.
- [x] UI: `<select>` or combobox (INR, USD, EUR, GBP — match current Booking Rules options unless product wants full ISO list).
- [x] Helper text: “All **service catalog** prices and quotes use this currency (amounts are stored in minor units).”
- [ ] (Optional v1.1) Add **`country`** dropdown or combobox (ISO 3166-1 alpha-2) if product wants auto-default; wire `country` in PATCH.

### 3. Cross-page consistency

- [x] First visit: if `appointment_fee_currency` is null, Practice Info save should persist `INR` or value from country default — avoid null currency in production for catalog doctors (form defaults display to INR; save sends uppercase code).
- [x] **Backend:** already validates `^[A-Z]{3}$` — ensure frontend always sends uppercase.

### 4. Services catalog copy

- [x] Replace confirm dialog text that says teleconsult will use “flat appointment fee from Booking Rules” with accurate behavior (catalog required for priced teleconsults).

---

## Acceptance criteria

1. Booking Rules **never** shows or edits appointment fee amount; saving Booking Rules **does not null out** currency.
2. Practice Info saves **`appointment_fee_currency`** and it appears after reload.
3. No TypeScript/lint regressions; PATCH payload types unchanged from API perspective.

---

## Risks / notes

- Doctors who relied only on **flat fee** with **empty catalog** need a **migration message** (handled in task 2 + release notes): they must add catalog rows or accept “cannot quote teleconsult” until they do.
- If Booking Rules PATCH previously sent `appointment_fee_currency: null` when fee empty, verify that behavior is **removed** from that page’s submit path.

---

**Last updated:** 2026-03-31
