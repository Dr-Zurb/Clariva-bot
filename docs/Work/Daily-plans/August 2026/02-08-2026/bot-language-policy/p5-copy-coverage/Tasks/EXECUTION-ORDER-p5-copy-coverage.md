# Execution order — p5 copy coverage

> Batch: [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md)

---

## Pre-flight (before any code)

- [x] Confirm **LANG5-D1** with the founder: p5 ships **no patient-visible change**. Five tasks, ~55 strings, and the bot says exactly what it says today. Worth agreeing on before someone reviews the PRs expecting Hindi. *(implied by program lock; restate in PR)*
- [x] Confirm **LANG5-D6** — comment DMs inherit the linked conversation's language, never detect from comment text. *(decision lock stands)*
- [x] **Re-run the audit before starting.** (2026-08-02 evening) — **~55 unique / ~62 file:line** still inline; no p5 migrations landed. Counts by task: lang-20 ~18, lang-21 9, lang-22 ~18, lang-23 ~10. LANG5-D7 cross-file dupes still present (cancel confirm, pick-not-found cancel/reschedule). `:243`/`:287` still duplicate `resolveNoUpcomingAppointmentsMessage`. `dm-copy.ts` = **2127** lines.
- [x] Read the p3 pattern before writing a builder, so p5 matches rather than invents:
  - `backend/src/utils/dm-copy.ts:44-47` — `enAllLocales` and what it means
  - Any `lang-09` builder end to end: typed input → `toStaticLocale` → colocated record
  - `backend/tests/unit/utils/dm-copy-locale-invariants.test.ts` — the invariants every new builder must satisfy
  - `backend/tests/unit/utils/dm-copy.snap.test.ts` — snapshot shape
- [x] **Split decision (2026-08-02):** **stay single-file for `lang-20`**. A mechanical split of 2127 lines is its own PR and would bury the migration review. Revisit a `dm-copy/appointments.ts` extract **before `lang-22`** if the file exceeds ~2400 after lang-20/21. Do not discover a mid-flight split inside lang-22.
- [x] `npm run test:dm-conversation` — language 4/4 green; full suite 14/15 (sole fail `safety-emergency-en` §1.6 vs open-crisis — parked, not language). Baseline attributable for p5.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **0 — Optional split** | — | If `dm-copy.ts` is splitting, land the move alone, no content changes, snapshots unchanged. Skip if staying single-file. |
| **1 — Highest volume** | `lang-20` ✅ | Cancel/reschedule/status plus the action executor. Shared builders; executor now uses `formatRescheduleChoiceLinkDm` (queue-mode fix §3.4). |
| **2 — Highest risk** | `lang-21` ✅ | Consent / revocation / pause. Language threaded; custom doctor pause verbatim (LANG5-D4). |
| **3 — Bulk** | `lang-22` ✅ | Booking links, staff review, funnel clarifiers. Language on booking-link + staff-review modules; funnel clarifiers in `dm-copy`; SLA timeout OOB via stored language. |
| **4 — Edges** | `lang-23` ✅ | Comment DMs, throttle ack, `FALLBACK_REPLY`, OOB slot/notification stragglers, welcome-back language, English-only exception list. |
| **5 — Gate** | `lang-24` 🟡 | Eng close-out ✅ (`dm-copy-lang-24-sweep.test.ts`, PHI registry, p6 input). Founder IG English E2E + `test:dm-conversation` still open. |

**Parallelism:** `lang-20` and `lang-21` touch disjoint files and can run together. `lang-22` and `lang-23` both add builders to `dm-copy.ts` — running those in parallel means conflicts in one file and one snapshot. Sequence them.

---

## The mechanical recipe

Every string in this phase follows the same six steps. Written once here so the task files do not repeat it:

1. Find the literal and its call site.
2. Add a builder in `dm-copy.ts` — typed input carrying `language` (LANG3-D1), colocated `enAllLocales` record (LANG3-D2/LANG5-D1).
3. Mark `phi: true` in the registry if it interpolates patient data (LANG5-D3).
4. Replace the literal with the builder call, passing `ctx.turnLanguage` in-turn or the stored column out-of-band (LANG3-D3).
5. Add a per-locale golden snapshot (LANG3-D5).
6. Assert the `en` output is byte-identical to the string you deleted (LANG5-D1).

Step 6 is the one that makes the phase reviewable. Do not skip it because a string "obviously" did not change.

---

## Task files

| # | File |
|---|------|
| 20 | [`task-lang-20-cancel-reschedule-status-copy.md`](./task-lang-20-cancel-reschedule-status-copy.md) |
| 21 | [`task-lang-21-consent-revoke-pause-copy.md`](./task-lang-21-consent-revoke-pause-copy.md) |
| 22 | [`task-lang-22-booking-link-and-staff-review-copy.md`](./task-lang-22-booking-link-and-staff-review-copy.md) |
| 23 | [`task-lang-23-comment-throttle-fallback-copy.md`](./task-lang-23-comment-throttle-fallback-copy.md) |
| 24 | [`task-lang-24-close-gate-p5.md`](./task-lang-24-close-gate-p5.md) |

---

**Created:** 2026-08-02.
