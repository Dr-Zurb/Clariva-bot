# Subjective tab — backlog (deferred / future / debt)

> Parking lot for the subjective-tab program. Promote to a Daily-plan phase when scheduled.  
> **Program:** [`../../Daily-plans/June 2026/03-06-2026/subjective-tab/`](../../Daily-plans/June%202026/03-06-2026/subjective-tab/)  
> **Status:** Core program v1 complete (P1–P12 shipped). Items below are follow-ups only.

## Decisions needed

- [ ] **AI free-text parse fallback** (`subj-14` §4) — deferred pending compliance gate. **GO/NO-GO:** schedule the compliance review or formally drop it. (Source: [`task-subj-13-freetext-parsing-completion.md`](../../Daily-plans/June%202026/03-06-2026/subjective-tab/p5-freetext-parsing/Tasks/task-subj-13-freetext-parsing-completion.md))

## Future features

- [ ] **Specialty section catalog + presets** — expand history sections; preselect by specialty (e.g. gynae menstrual/obstetric). Full spec in [`section-catalog.md`](section-catalog.md). Promote to Phase 13+ daily-plan when ready.
- [ ] **Voice dictation** into free-text notes + custom-section bodies — natural fit for telemed cockpit.
- [ ] **Section quick-jump** — once a doctor has 10+ sections (specialty packs will push this), add a small “jump to section” affordance.

## Debt / hardening

- [ ] **Stale doc** — flip Phase 4 `EXECUTION-ORDER` status `⏳ Planned` → Done (rapid-capture + nested associated complaints are shipped; `ComplaintCaptureBar`, `AssociatedComplaintsPanel` exist).
- [ ] **Lint** — `SubjectiveSection.tsx` `useEffect` missing `customBlockIds` dep.
- [ ] **Empty-template guard** — blank templates (e.g. title-only custom section) can be saved and list as misleading summaries; tighten per-section / `custom_block` save guards.
- [ ] **Touch drag-reorder** — verify section grip works on touch, not only mouse + keyboard.
- [ ] **Perf** — `useChartRailEmptySignals` re-fires all list APIs on vitals keystroke; linked-chart subjective sections share that fetch surface (also tracked under [`../cockpit.md`](../cockpit.md)).

## Promoted / done

_Move lines here when promoted to Daily-plans or closed._
