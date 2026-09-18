# Task inv-02: Pre-fill from demo + close gate

> **Links:** batch [`../plan-doctor-invite-v1-batch.md`](../plan-doctor-invite-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-invite-v1.md`](./EXECUTION-ORDER-doctor-invite-v1.md)

---

## 📋 Task Overview

Optionally capture practice name/specialty at invite time and write them to `doctor_settings` once the invited user exists, then close the batch.

**Status:** ⏳ PENDING. **Change Type:** Additive to inv-01 + minimal admin UI.

**Scope Guard:** optional fields on the invite; a settings write; no password ever set by admin.

---

## ✅ Task Breakdown

### 1. Pre-fill
- [ ] 1.1 Accept optional `practice_name`/`specialty` on the invite endpoint.
- [ ] 1.2 Persist to `doctor_settings` for the new user (on invite or first login — document the chosen point).

### 2. Minimal admin UI
- [ ] 2.1 A small "Invite doctor" form in the admin area (behind the guard) — email + optional fields.

### 3. Close gate
- [ ] 3.1 Slice lint/type-check + tests green.
- [ ] 3.2 Manual: invite w/ pre-fill → doctor logs in → practice fields present; onboarding checklist reflects them.
- [ ] 3.3 Mark batch + tasks ✅; capture dogfood in `inbox.md`.

---

## ✅ Acceptance Criteria

- [ ] Optional pre-fill lands in `doctor_settings`; admin never sets a password.
- [ ] Batch verified + docs marked complete.

**Created:** 2026-07-22.
