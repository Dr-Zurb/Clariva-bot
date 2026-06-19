# Subjective tab — Phase 4: rapid complaint capture + nested associated complaints — 04 Jun 2026 batch plan

> **Phase 4 of the Subjective-tab program — a follow-up enhancement after the `subj-01..10` program closed (2026-06-03).** Phases 1–3 shipped structured complaint cards (type-aware OLDCARTS/SOCRATES), owned histories, linked patient-background sections, fast entry (`complaint_master` autocomplete, favourites, carry-forward, presets), smart-confirm defaults, and the close-gate. Phase 4 refines the **entry interaction** and adds **one level of nesting**, both grounded in real consult workflow: a patient lists several complaints in one breath, and some complaints travel together (a chief complaint + its associated complaints).
>
> **Source:** doctor field-feedback (2026-06-04) on the shipped Subjective tab; extends the [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) (ST-D1/ST-D2 still binding — complaints stay a JSONB array; `cc` stays derived).
>
> **Prefix note:** tasks are `subj-*`, continuing the program numbering. Phase 4 = `subj-11..12`.
>
> **Builds on:** the whole `subj-01..10` surface (cards, collapse/expand, `ComplaintAutocomplete`, schema registry, `cc`/`hopi` derivation, autosave). This phase is **additive**: subj-11 is a pure interaction rewire (no data change); subj-12 is a JSONB shape extension with **no migration**.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Both tasks are Auto/Sonnet; subj-12 carries a per-message Opus escalation budget because it changes the `cc`/`hopi` derivation contract (the close-gate locked byte-parity) and the JSONB serialize/hydrate round-trip.
>
> **Task-file note:** every `task-subj-*` file follows [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) — **no code, schemas, or function signatures in tasks** ([planning/execution boundary](../../../../../process/TASK_MANAGEMENT_GUIDE.md)).
>
> **Exec order + wave plan:** [`Tasks/EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md`](./Tasks/EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md).

---

## What Phase 4 does (one sentence)

> **Replace the "+ Add complaint" editor-on-add flow with a rapid-capture bar (type → Enter → collapsed card → repeat), then let a chief complaint own one level of nested "associated complaint" cards (each with its own OLDCARTS), with chips and nested cards coexisting via a promote path — all without a migration, `cc` unchanged and `hopi` extended to indented sub-lines.**

After Phase 4: a doctor faced with "headache, heartburn, body ache, lethargy" types each +
Enter in seconds (collapsed cards), then clicks any card to fill its SOCRATES; and a
*chest pain* card can carry an associated *breathlessness* card with its own onset/severity.

---

## Decision lock (frozen for this phase — confirmed 2026-06-04)

- **P4-D1** — Rapid-capture bar is the **sole add path**; new cards land **collapsed**; details via click-to-expand (subj-11).
- **P4-D2** — Capture bar is **autocomplete-backed** so a picked `complaint_master.category` drives the right schema on expand (subj-11).
- **P4-D3** — Duplicate complaint name → **focus the existing card**, don't add a second (subj-11).
- **P4-D4** — Nesting is **one level only**; associated complaints can't nest further (subj-12).
- **P4-D5** — Keep both `associated` **chips** and nested `associatedComplaints` **cards**, bridged by a **promote chip → card** action (subj-12).
- **P4-D6** — `cc` stays **top-level-only**; `hopi` renders associated complaints as **indented sub-lines** — a deliberate change to the close-gate byte-parity contract, fixtures updated (subj-12).
- **P4-D7** — Reorder is **sibling-only**; promote/demote is an explicit button, **not** cross-level drag (subj-12).
- **Carried:** ST-D1 (complaints = JSONB array), ST-D2 (`cc`/`hopi` derived).

---

## What this phase does NOT do (deferred)

| Item | Why |
|---|---|
| Recursive (>1 level) nesting | Complexity ≫ clinical payoff (P4-D4) |
| Cross-level drag promote/demote | Explicit button is simpler + clearer (P4-D7) |
| A DB migration | `complaints` is already JSONB; nesting is app-side shape only |
| ROS / ICE / structured social-history / AI scribe | Still out of program scope |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Capture bar: type → Enter registers a collapsed card; bar clears; focus retained; click-to-expand still opens the type-aware editor; duplicate name focuses the existing card.
- [ ] Nesting: a chief complaint holds one level of associated complaint cards (own attributes); chips + nested cards coexist; chip→card promotion works; removing a parent cascades children.
- [ ] `complaints` (with `associatedComplaints`) round-trips through create / update / autosave / reload.
- [ ] `cc` unchanged; `hopi` renders associated complaints as indented sub-lines; subj-10 gate fixtures updated; PDF/SMS/snapshot reproducible.
- [ ] No migration added; backend validation permits the nested array.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; reducer/derivation/cards suites green.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Structured complaint cards + owned histories + linked sections (ST.1–ST.5) | ✅ Done (2026-06-03) |
| Phase 2 | Fast entry: complaint master + favourites + carry-forward + presets (ST.6–ST.8) | ✅ Done (2026-06-03) |
| Phase 3 | Polish: smart-confirm defaults + integration/a11y/gate (ST.9–ST.10) | ✅ Done (2026-06-03) |
| **Phase 4** | **Rapid capture + nested associated complaints (subj-11..12)** | ⏳ Planned (subj-11..12) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-11 (rapid-capture bar) | 1 | 0 | ~0.5–1d |
| Wave 2 | subj-12 (nested associated complaints) | 1 | 0 (escalation budget) | ~1–1.5d |
| **Total** | **2** | **2** | **0** | **~1.5–2.5d agent-time** |

`subj-12` carries the Opus escalation budget: it changes the `cc`/`hopi` derivation contract
and the JSONB round-trip — escalate one message if the ripple reaches the PDF/SMS/snapshot
mappers beyond the named callsites.

---

## Sequencing notes

- **subj-11 first.** It introduces the capture bar component + the collapsed-add behaviour.
- **subj-12 after.** The nested add-bar reuses subj-11's capture component one level down, so building it first avoids duplicating the bar.

---

## References

- **Surfaces this builds on:**
  - [`frontend/components/cockpit/rx/subjective/ComplaintList.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx) · [`ComplaintCard.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx) · [`ComplaintAutocomplete.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx).
  - [`frontend/components/cockpit/rx/RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — reducer + `cc`/`hopi` derivation + `buildRxPayload` round-trip.
  - [`frontend/types/prescription.ts`](../../../../../../../frontend/types/prescription.ts) — the `Complaint` type extended in subj-12.
- **Predecessor phases:** [`p1-complaint-cards/`](../p1-complaint-cards/) · [`p2-fast-entry/`](../p2-fast-entry/) · [`p3-polish/`](../p3-polish/).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md`](./Tasks/EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md).

---

**Created:** 2026-06-04.  
**Status:** ⏳ `Planned` (2026-06-04) — Phase 4 of the Subjective-tab program; a post-close enhancement.  
**Owner:** TBD.
