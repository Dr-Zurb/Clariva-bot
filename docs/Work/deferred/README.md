# Deferred Tasks

Tasks and operational work we've intentionally postponed. When you're ready to resume, use these notes to pick up quickly.

---

## 📋 Index

| Item | Defer Reason | Resume When |
|------|--------------|-------------|
| [PAYOUT_OPERATIONAL_SETUP](./PAYOUT_OPERATIONAL_SETUP_2026-03.md) | App not production-ready; focus on core features first | App has paying users; ready to move money to doctors |
| [RLS Testing](./deferred-rls-testing-2026-01-20.md) | No frontend/auth yet | Frontend with auth + doctor user creation exists |
| [Service matcher phases B–D](./deferred-service-matcher-intelligence-bcd-2026-03.md) | Phase A shipped; B/C/D need metrics, policy toggles, and/or schema work | You want more autobook, override analytics, or default-row behavior |
| [IG DM interim “please wait”](./deferred-instagram-dm-interim-please-wait-2026-04.md) | UX/throttle/dedupe review; extra Graph send per slow turn | You want perceived-latency improvement on slow IG replies |
| [Doctor UI — add patient (manual)](./deferred-doctor-ui-add-patient-2026-04.md) | No dashboard “add patient” yet; defer until roster/MRN rules for non-bot paths are settled | After [15 Apr patient visibility plan](../Daily-plans/April%202026/15-04-2026/README.md) Phase A–B; ready to design create-patient API + UI |
| [Date/number-locale hydration sweep](./deferred-date-locale-hydration-sweep-2026-04-28.md) | One blocker hot-fixed; 18+ remaining `toLocale*(undefined, …)` call sites are mechanical replacements better done as one focused PR with a shared `frontend/lib/format-date.ts` helper + ESLint guard | Next hydration overlay surfaces, before the next demo, or when already touching `frontend/lib/` |

---

## 🎯 How to Use

1. **Before resuming:** Read the deferred doc for full context, prerequisites, and steps.
2. **After completing:** Move the doc to `docs/Work/Daily-plans/` or mark it done; remove from this index.
3. **When deferring something new:** Copy the structure of an existing deferred doc; add to this index.

---

**Last Updated:** 2026-04-28
