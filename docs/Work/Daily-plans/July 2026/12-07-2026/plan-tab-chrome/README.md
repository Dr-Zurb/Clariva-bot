# Plan tab chrome — 12 Jul 2026 program

> **Why this exists.** Plan shipped P0–P3 as flat peer zones (`RX_PLAN_ZONE_*` tint boxes). Subjective/Objective use L0 → L1 → L2 `CollapsibleContainer` cards with sticky headers, expand-scroll, and depth-tone. Plan also authored **Medications before Investigations**, while the patient PDF renders Investigations → Rx → plan text — so authoring order fought output order.
>
> **What this program does.** (1) Reorder so **Investigations sit above Medications**; (2) promote Plan zones to **L1 `CollapsibleContainer` cards** with the shipped VH sticky/scroll/depth-tone engine; (3) optionally add L2 nesting (Advice vs Education; medicine-row depth) in a later wave — **no drag-reorder / layout persistence in v1**.

---

## The one-sentence goal

> **Make Plan authoring order match the PDF (Investigations → Meds → …) and promote Plan sections to Subjective/Objective-parity L1 collapsible cards (sticky + scroll + depthTone), reusing the VH engine — frontend-only, no migration.**

---

## Decision lock

- **PLAN-C1 — Reuse VH, don’t fork.** `CollapsibleContainer` + sticky stack + `depthTone`. No new surface system.
- **PLAN-C2 — Authoring order = PDF order.** Investigations → Medications → (safety after meds) → Follow-up → Advice & education → Referral → Clinical notes.
- **PLAN-C3 — L0 = tab only.** `SoapTabFamilyProvider family="plan"`; no `depthTone` on the tab wrapper.
- **PLAN-C4 — L1 = major Plan sections.** Each is a `CollapsibleContainer` with `depthTone`, `stickyHeader`, `scrollOnExpand`, `closeScrollToSelector` → plan scroll-top.
- **PLAN-C5 — L2 only where nesting is real.** Deferred to Wave 2 (Advice/Education peers; medicine-row depth). Chip strips / packs stay in-body chrome.
- **PLAN-C6 — No drag-reorder in v1.** Fixed order from PLAN-C2.
- **PLAN-C7 — Rx engine frozen.** Densification, favorites, capture, DDI/allergy lift, shortcuts unchanged.
- **PLAN-C8 — Safety stays med-adjacent.** Allergy/DDI after Medications, not above Investigations.

---

## Phasing

| Wave | Task | Scope | Migration? | Model |
|---|---|---|---|---|
| **W0** | `plan-c-01` | Reorder Investigations above Meds | No | Sonnet |
| **W1** | `plan-c-02` | L1 CollapsibleContainer cards + sticky/scroll/depthTone | No | Sonnet |
| **W2** | `plan-c-03` | L2 nesting (Advice/Education; optional med-row depth) | No | Sonnet / Opus if 5+ |
| **W3** | `plan-c-04` | Close gate | No | Sonnet |

---

## Where it will be built

- `frontend/components/cockpit/rx/sections/PlanSection.tsx`
- `frontend/components/ui/CollapsibleContainer.tsx` (consume only)
- `frontend/components/cockpit/rx/sections/section-chrome.tsx` (`family="plan"` already shipped)
- Tests: `PlanSection.test.tsx`

---

**Created:** 2026-07-12. **Status:** ✅ Complete (W0–W3). Medicine-row depth deferred (see plan-c-03).
