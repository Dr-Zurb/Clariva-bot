# Task ver-06: Close gate

> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## ✅ Checks

- [ ] Backend + frontend gates green; migration test green.
- [ ] RLS: cross-doctor + non-admin denial proven; storage private + signed-URL only.
- [ ] End-to-end: submit → pending → admin approve → go-live unlocked; reject → blocked + reason shown.
- [ ] No PII/registration numbers/doc contents in any log.
- [ ] Deploy notes: apply migration on Supabase; create the storage bucket + policies; set the first admin's `app_metadata.role`.
- [ ] Update `REGULATORY_AND_LAUNCH_STRATEGY.md` / compliance docs if the verification posture changes any stated control.
- [ ] Mark batch + tasks ✅; capture dogfood + deploy items in `inbox.md`.

**Created:** 2026-07-22.
