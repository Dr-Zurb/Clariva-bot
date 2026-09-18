# Execution order — p2 retire second detector

> Batch: [`../plan-p2-retire-second-detector-batch.md`](../plan-p2-retire-second-detector-batch.md)

---

## Pre-flight (before any code)

- [ ] p1 gate closed (`lang-05` ✅) — `ctx.turnLanguage` exists and is populated.
- [ ] Confirm **LANG2-D1…D5**, especially **LANG2-D4** (delete `localizeReply` rather than re-point it).
- [ ] Snapshot current behavior: run the golden DM transcript fixtures and save the output. This is the diff baseline for LANG2-D5.
- [ ] Inventory the 15 `detectSafetyMessageLocale` sites and 2 `localizeReply` sites (listed in the batch plan) so none is missed.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Emitters** | `lang-06` ✅ | The bulk. Thread `language` down through 5 util files, delete `detectSafetyMessageLocale`. |
| **2 — LLM translator** | `lang-07` ✅ | Delete `localizeReply` + `detectPatientLanguageHint`; replace 2 call sites with table strings. Independent of wave 1 but easier once the param plumbing exists. |
| **3 — Gate** | `lang-08` ✅ | Snapshot diff review + live smoke (eng gate closed; IG smoke founder). |

---

## Task files

| # | File |
|---|------|
| 06 | [`task-lang-06-emitters-read-turn-language.md`](./task-lang-06-emitters-read-turn-language.md) |
| 07 | [`task-lang-07-delete-localize-reply.md`](./task-lang-07-delete-localize-reply.md) |
| 08 | [`task-lang-08-close-gate-p2.md`](./task-lang-08-close-gate-p2.md) |

---

**Created:** 2026-08-02.
