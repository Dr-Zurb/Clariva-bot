# Plan p1 — Field search (Cmd-K jump)

## 30 Aug 2026 — Batch `rx-fast-entry` / `p1-field-search` (`rfeq-01..03`) — **M, ~1 day**

> **Status:** ✅ Gate green 2026-08-30 (live Cmd-K smoke residual — see Notes)
> **Product plan:** [`plan-rx-fast-entry.md`](../../../../../Product%20plans/plan-rx-fast-entry.md) (RFE-DL-1…RFE-DL-12 — inherited, not re-litigated)
> **Program:** [`../README.md`](../README.md) · Prefix `rfeq`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-rx-fast-entry-field-search.md`](./Tasks/EXECUTION-ORDER-p1-rx-fast-entry-field-search.md)

---

## Why this phase

Lean defaults hid surgical / family / social history (and several Plan sections). Those sections are reachable only through manage-sections menus. The shipped Cmd-K palette searches patients and navigates — it cannot jump to SpO₂.

This phase adds a **route-aware `fields` source**. On an open visit, `spo2` navigates to that same appointment with a reserved query target; the cockpit restores the SOAP pane if needed, expands the section, and focuses the input. Off a visit the source is silent.

Unhide and set-value are **Phase 2**. This phase does not widen `SourceItem`.

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| RFE-DL-1…RFE-DL-12 | Inherited. **Do not re-litigate.** |
| **RFE1-D1** | Query key is **`rxFocus`**. Value is dotted `pane.section[.field]` using existing ids (`objective.vitals.vitalsSpo2`, `subjective.family_history`). Consumer strips the param after applying. |
| **RFE1-D2** | Index is **client-static**. Labels come from `SUBJECTIVE_SECTION_LABELS`, `OBJECTIVE_SECTION_LABELS`, `PLAN_SECTION_LABELS`, `ASSESSMENT_SECTION_LABELS`, and `vitals-schema` / categorical-vital labels. No fetch, no cache beyond the palette's existing query cache. |
| **RFE1-D3** | Custom blocks (`custom_block:…`) are **out of the index** in this phase. Static sections + vitals only. |
| **RFE1-D4** | Deep-link **restores a hidden pane** (`restoreLeaf`) and **activates its tab** (`setActiveTab`). It does **not** call `focusLeafInTree` (snap-rail). It does **not** unhide a hidden section. |
| **RFE1-D5** | Palette placeholder copy may mention fields **only as a secondary hint**. Primary copy stays patient-search. Do not replace the patients-first empty state. |

---

## Scope Guard — DO NOT TOUCH

- `SourceItem` stays navigation-only. No `kind: "action"`.
- `CockpitPalette.tsx` (v3 add-pane).
- Rx form dispatch / doctor-settings hidden-set writes (Phase 2).
- Parse services, apply-action builders (Phase 3).
- Factory-visible sets in the four `*-section-visibility.ts` modules.
- New migration.

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rfeq-01`](./Tasks/task-rfeq-01-field-index-and-cmdk-source.md) | Static field index + `fields` source in the palette | M | Auto |
| [`rfeq-02`](./Tasks/task-rfeq-02-rx-focus-deep-link.md) | Cockpit consumes `rxFocus` — restore pane, expand, scroll, focus | M | Auto |
| [`rfeq-03`](./Tasks/task-rfeq-03-field-search-gate.md) | Telemetry key, tests, Phase 1 gate | S | Auto |

---

## Acceptance gate

- [x] On `/dashboard/appointments/:id`, Cmd-K `spo2` lists Oxygen Saturation under a Fields group; selecting it lands on that visit with Objective / Vitals focused. (palette integration + rfeq-02 reveal/focus when the input is mounted)
- [x] On `/dashboard/patients-v2` (or any non-appointment path), Cmd-K `spo2` does **not** list fields. Patient search is unchanged.
- [x] If the Objective pane is hidden on the canvas, the jump restores it and activates the tab. The tree is not snap-railed.
- [x] A hidden *section* (e.g. Family history) still jumps to the Subjective pane and the section id — it does **not** unhide the section (Phase 2).
- [x] `rxFocus` is gone from the URL after the consumer applies it.
- [x] `cmdkSelected("fields")` fires; `cmdkSearched` still receives length only.
- [x] `npx tsc --noEmit` + lint clean on touched files. New field-index + deep-link tests green. Existing palette patient-search tests still pass.

---

## Risk register (phase)

| Risk | Mitigation |
|------|------------|
| Agent widens `SourceItem` "so the source can do more" | RFE-DL-1 + this Scope Guard. rfeq-01 acceptance forbids an action kind. |
| `focusLeafInTree` used because it is nearby | RFE1-D4. rfeq-02 lists it on DO NOT TOUCH. |
| Index hardcodes labels instead of reading the registries | RFE1-D2. Test: renaming a label in `OBJECTIVE_SECTION_LABELS` changes the hit. |

---

## Notes

- rfeq-02 deferred **expand of a collapsed SOAP section** (no shared expand API across the four tabs). Pane restore + tab activate + section scroll + best-effort field focus shipped. Expand is a Phase 2 / leftover note — not a silent skip of the pane-level gate.
- **Live Cmd-K smoke residual:** this session had no authenticated browser pass on the running Next app (`npm run dev` is up; API proxy to `:3001` was flaky). Operator follow-up: open a visit → Cmd-K `spo2` → confirm Fields + focus; leave the visit → Cmd-K `spo2` → no Fields. Palette + deep-link suites cover the same paths in Vitest.

**Last Updated:** 2026-08-30
