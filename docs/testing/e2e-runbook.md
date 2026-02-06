# E2E Runbook – MVP Flow (Manual)

Manual end-to-end verification for the complete MVP flow: **Instagram message → bot → patient collection → booking → payment → notifications → doctor dashboard**.

**Related:** [TESTING.md](../Reference/TESTING.md) (PII placeholders, canonical responses), [webhook-testing-guide.md](./webhook-testing-guide.md) (webhook tests), [e-task-6-e2e-testing-and-test-data-compliance.md](../Development/Daily-plans/2026-02-04/e-task-6-e2e-testing-and-test-data-compliance.md).

---

## Scope

- **In scope:** Full flow from first patient message to doctor viewing the appointment in the dashboard.
- **Out of scope:** Production data or credentials; use test/staging only. No real PHI.

---

## Prerequisites

### Environment

- Backend: `backend/.env` with Supabase (service role), Instagram (app secret, verify token), OpenAI (optional for intent), Redis (optional for queue), payment providers (test keys only).
- Frontend: `frontend/.env.local` with `NEXT_PUBLIC_API_URL` pointing at backend.
- **Do not** use production API keys, production Supabase, or production payment keys.

### Test Accounts / Data

- **Instagram:** Test Instagram account connected to your Meta App (webhook subscribed).
- **Doctor:** Test Supabase user with doctor role; RLS allows this user to see only their patients/appointments.
- **Patient data in tests:** Use placeholders only: `PATIENT_TEST`, `+10000000000`, `TEST_EMAIL@example.com` (see [TESTING.md](../Reference/TESTING.md)).

### Services Running

1. Backend: `cd backend && npm run dev`
2. Frontend: `cd frontend && npm run dev`
3. (Optional) Redis for webhook queue; if not set, webhook may use in-memory/placeholder behavior per project config.
4. (Optional) ngrok or similar for webhook URL if testing real Instagram delivery (see [webhook-testing-guide.md](./webhook-testing-guide.md) / [ngrok-webhook-bypass.md](../setup/ngrok-webhook-bypass.md)).

---

## E2E Steps (Manual)

### 1. Patient sends message on Instagram (or simulated webhook)

- **Real:** Send a message from a test Instagram account to the connected Page; webhook receives it and (if queue enabled) processes it.
- **Simulated:** Use integration script or POST to webhook endpoint with valid signature and payload (use fake placeholders for any PHI in payloads). See [webhook-testing-guide.md](./webhook-testing-guide.md).

**Verify:** Webhook returns 200; event is queued/processed (check logs or queue).

### 2. Bot responds and collects info

- Continue conversation so the bot collects: name, phone, date of birth, gender, reason for visit (as per collection flow).
- Use **placeholder values** in manual tests if logging or inspecting: e.g. `PATIENT_TEST`, `+10000000000`.

**Verify:** Bot replies; collection state advances; consent requested where required.

### 3. Patient books appointment

- Trigger booking (e.g. “book appointment” or equivalent intent).
- Provide doctor and slot (availability API used); booking creates an appointment record.

**Verify:** Appointment created in DB; response indicates success; no 500.

### 4. Payment link generated and sent

- After booking, payment flow generates a link (Razorpay/PayPal test mode).
- Link sent to patient (e.g. via Instagram DM or test notification).

**Verify:** Payment link present; uses test mode only.

### 5. Patient pays (test mode)

- Complete payment in test mode (Razorpay/PayPal sandbox).

**Verify:** Payment webhook or callback received; payment status updated; no production charges.

### 6. Appointment confirmed; notifications sent

- Appointment marked confirmed/paid as per flow.
- Doctor notification (email) and patient notification (e.g. DM) sent.

**Verify:** Notifications triggered (check logs or test inbox); no real PHI in logs (metadata/IDs only).

### 7. Doctor sees appointment in dashboard

- Log in to frontend as the test doctor (Supabase auth).
- Open dashboard → Appointments list.
- **Verify:** Appointment appears in list (filters work if implemented).
- Open appointment detail.
- **Verify:** Detail view shows expected fields; link to patient (if implemented) works.
- Open patient detail (from appointment or patients list).
- **Verify:** Patient detail loads; only data for that doctor’s patients (RLS).

---

## Test Data Compliance

- **Manual test data:** Prefer placeholders: `PATIENT_TEST`, `+10000000000`, `TEST_EMAIL@example.com`.
- **Automated tests:** Same placeholders; no real PHI; assert structure over raw values (see [TESTING.md](../Reference/TESTING.md)).
- **Failure output:** Jest should be run with `--silent` or equivalent where appropriate so PHI is not printed on failure.

---

## Checklist Summary

| Step | What to verify |
|------|----------------|
| 1 | Webhook receives message / simulation returns 200; event processed |
| 2 | Bot replies; collection steps advance; consent when required |
| 3 | Appointment created; success response |
| 4 | Payment link generated and sent (test mode) |
| 5 | Payment completed in test mode; status updated |
| 6 | Notifications sent; no PHI in logs |
| 7 | Doctor login → Appointments list → Appointment detail → Patient detail (RLS) |

---

## Automated E2E (Playwright)

The frontend includes Playwright E2E specs for critical dashboard flows (per [FRONTEND_TESTING.md](../Reference/FRONTEND_TESTING.md)):

- **Location:** `frontend/e2e/dashboard.spec.ts`, `frontend/playwright.config.ts`
- **Run:** `cd frontend && npm run test:e2e` — Playwright starts the app on port **3003** (or `E2E_PORT`) so it does not conflict with the backend on 3000.
- **Tests:** Login page load; unauthenticated redirect; full flow (login → dashboard → appointments) when `E2E_USER` and `E2E_PASSWORD` are set in `frontend/.env.local`.
- **Env:** `E2E_PORT` (default `3003`). Set `E2E_USER` and `E2E_PASSWORD` in `frontend/.env.local` for the full login test. If the password contains `#`, use double quotes (e.g. `E2E_PASSWORD="Bangin@#2937"`).
- Run against test backend/staging only; no production API or credentials.

**Recommended: run full E2E against an already-running app (so login works like manual)**

1. **Terminal 1** — start the app with your env (loads `frontend/.env.local`, port **3003**):
   - `cd frontend`
   - `npm run dev:e2e`
   - Do **not** use `npm run dev` for this—that uses port 3000; tests expect the app on 3003.
2. **Terminal 2** — run E2E against that app (no server started by Playwright):
   - `cd frontend`
   - `npm run test:e2e:existing-server`
3. All three tests, including the full login flow, should pass.

**If the full-flow test fails ("No Supabase auth request was seen" or login never redirects):**
1. Use the two-terminal approach above; **Terminal 1** must run `npm run dev:e2e` (not `npm run dev`).
2. **Clear the Next.js cache** so the client bundle is rebuilt with your env: from `frontend`, run `Remove-Item -Recurse -Force .next` (PowerShell) or `rm -rf .next` (bash), then start again with `npm run dev:e2e`. Re-run the test in Terminal 2.
3. Ensure manual login works at http://localhost:3003/login with `E2E_USER`/`E2E_PASSWORD`.
4. In `.env.local` use `E2E_PASSWORD="..."` (double quotes) if the password contains `#`.
5. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to the project where the test user exists.

---

**Last updated:** 2026-02-04  
**Reference:** [e-task-6-e2e-testing-and-test-data-compliance.md](../Development/Daily-plans/2026-02-04/e-task-6-e2e-testing-and-test-data-compliance.md)
