# Subjective tab — Phase 3: polish (smart-confirm defaults + integration/a11y/close-gate) — 03 Jun 2026 batch plan

> **Phase 3 of the Subjective-tab program (the `v3` slice).** Phases 1–2 made the tab structured and fast. Phase 3 adds **smart-confirm defaults** (picking a complaint pre-selects the doctor's usual attribute values so the common case is pick → glance → done) and runs the **close-gate**: integration smoke, a11y/contrast, keyboard-only flow, and the assertion that the prescribe → send pipeline (`cc`/`hopi` derivation, PDF, SMS, snapshot) is unchanged (ST.9 / ST.10).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — realises **ST.9–ST.10**. Inherits **ST-D1..ST-D7** + Phases 1–2.
>
> **Prefix note:** tasks are `subj-09..10`, closing the program numbering.
>
> **Builds on:** Phases 1–2 ([`../p1-complaint-cards/`](../p1-complaint-cards/), [`../p2-fast-entry/`](../p2-fast-entry/)). Uses `doctor_note_favorites` / prior complaints (from subj-06) to derive per-doctor defaults.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **One Opus task** — the close-gate review (`subj-10`), per the hard-rule §5 (close-gate review). `subj-09` is Auto.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-subjective-tab-polish.md`](./Tasks/EXECUTION-ORDER-p3-subjective-tab-polish.md).

---

## What Phase 3 does (one sentence)

> **Add per-doctor smart-confirm defaults to the complaint cards (suggestions, visually distinct until confirmed, never overwriting an explicit edit), then run the whole-program close-gate — integration smoke, a11y/contrast (light+dark), keyboard-only flow, and a byte-parity assertion that the PDF/SMS/snapshot are unchanged — and stamp the gate.**

---

## Decision lock (frozen for this phase)

- **ST-D2 (inherited, gate-critical)** — `cc`/`hopi` derivation must keep the PDF/SMS/snapshot byte-identical; the close-gate asserts it.
- **ST-D5** — smart-confirm defaults are the last layer of the fast-entry stack; defaults are *suggestions*, never silent overwrites.
- Defaults are derived per-doctor from `doctor_note_favorites` / prior complaints (subj-06) — no new schema.

---

## What this phase does NOT do

| Item | State |
|---|---|
| ROS / ICE / structured social history / AI scribe | Out of program v1 |
| Any clinical-path / pipeline change | Forbidden — the gate asserts none happened |

---

## Cross-cutting acceptance gate (whole program close-gate — owned by subj-10) — ✅ PASSED 2026-06-03

- [x] **All Phase 1 + Phase 2 gates still green.** (subjective-tab frontend suite 105/105; subjective backend services 6/6)
- [x] Integration smoke: add 3 complaints → reorder → autocomplete + favourite chips → carry-forward → preset apply → smart-confirm defaults → autosave → reload restores. (`SubjectiveTab.integration.test.tsx`)
- [x] a11y/contrast holds in light + dark; 44px hit targets; keyboard-only add/edit (Tab/Enter); no layout shift in the narrow rail. (semantic theme tokens; `min-h-11` targets; `aria-pressed` chips; arrow-key/Enter/Escape nav covered by `ComplaintList`/`ComplaintCard` tests)
- [x] **Zero regression** to the prescribe → safety → send pipeline: `cc`/`hopi` derive byte-identically; PDF + SMS summary + snapshot unchanged for an equivalent note; autosave unchanged; linked sections don't double-write; allergies still feed the safety strip. (`ccHopiPipelineParity.test.ts`; PDF body maps `rx.cc`/`rx.hopi` verbatim; SMS reads only Dx/investigations/follow-up/meds; `buildRxPayload` has no allergy/PMH keys)
- [x] Full backend + frontend suites green; `tsc`/lint clean; gate stamped. — see [`task-subj-10` close-gate verdict](./Tasks/task-subj-10-integration-a11y-and-close-gate.md#-close-gate-verdict--passed-2026-06-03) for the two routed pre-existing deviations (cockpit-v3 p6 layout suites; `@react-pdf/renderer` jest-ESM infra) — both **outside** the Subjective-tab surface.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Structured cards + owned histories + linked sections (ST.1–ST.5) | ⏳ Planned (subj-01..05) |
| Phase 2 | Fast entry: master + favourites + carry-forward + presets (ST.6–ST.8) | ⏳ Planned (subj-06..08) |
| **Phase 3** | **Smart-confirm defaults + integration/a11y/close-gate (ST.9–ST.10)** | ⏳ Planned (subj-09..10) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-09 (smart-confirm defaults) | 1 | 0 | ~1h |
| Wave 2 | subj-10 (integration + a11y + close-gate) | 0 | 1 | ~1–2h |
| **Total** | **2** | **1** | **1** | **~2–3h agent-time** |

One Opus task (subj-10 close-gate review — hard-rule §5), within the §8 cap.

---

## Sequencing notes

- **subj-09 before subj-10.** Defaults are a feature; the gate verifies the whole program including them. subj-10 builds nothing — it is pure integration + a11y verification + the pipeline-unchanged assertion + the stamp.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.9–ST.10 + risks (the `cc`/`hopi` parity risk).
- **Process:** [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §5/§8 (close-gate Opus) · [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p3-subjective-tab-polish.md`](./Tasks/EXECUTION-ORDER-p3-subjective-tab-polish.md).

---

**Created:** 2026-06-03.  
**Status:** ⏳ `Planned` (2026-06-03) — Phase 3 of the Subjective-tab program; the `v3` slice + close-gate.  
**Next:** on green gate, fold the Subjective-tab behaviour into the canonical EHR reference + mark the product plan `Shipped`.
