# Execution order — p3 dm-copy localization

> Batch: [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md)

---

## Pre-flight (before any code)

- [ ] p2 gate closed (`lang-08` ✅) — one detector, one stored value, all in-turn emitters obeying it.
- [ ] Confirm **LANG3-D1…D7**, especially **D7** (consent/legal stays English in v1) and **D4** (untranslated ships English, never machine-translated).
- [ ] Secure a **human Hindi reviewer** for the booking-funnel strings. Without one, `lang-12` ships English arms and the phase closes partially — decide that up front rather than discovering it at the gate.
- [ ] Re-read the module contract at `backend/src/utils/dm-copy.ts:1-23`. Every change must preserve: pure functions, typed inputs, one helper per family, golden snapshot coverage.
- [ ] Pull the mixed-language punch-list produced during `lang-06`.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Mechanism** | `lang-09` ✅ | **Opus.** Establish the dispatch pattern on **one** family (intake ask) and prove it end to end. Do not migrate 24 builders before the pattern is agreed. |
| **2 — In-turn callers** | `lang-10` ✅ | Mechanical once the pattern exists. Intake + non-text wired; remaining builders wait on lang-12. |
| **3 — Out-of-band** | `lang-11` ✅ | **Opus.** Needs a DB read of `conversations.language`; different failure modes (no conversation, deleted account). |
| **4 — Bulk copy** | `lang-12` ✅ | The remaining families + punch-list. Largest, lowest risk once 09–11 land. |
| **5 — Gate** | `lang-13` 🟡 | Eng checks done; founder full-funnel live smoke still open. |

Waves 2 and 3 can run in parallel — disjoint caller sets.

---

## Task files

| # | File |
|---|------|
| 09 | [`task-lang-09-dm-copy-locale-dispatch.md`](./task-lang-09-dm-copy-locale-dispatch.md) |
| 10 | [`task-lang-10-migrate-in-turn-callers.md`](./task-lang-10-migrate-in-turn-callers.md) |
| 11 | [`task-lang-11-out-of-band-senders.md`](./task-lang-11-out-of-band-senders.md) |
| 12 | [`task-lang-12-translate-remaining-families.md`](./task-lang-12-translate-remaining-families.md) |
| 13 | [`task-lang-13-close-gate-p3.md`](./task-lang-13-close-gate-p3.md) |

---

**Created:** 2026-08-02.
