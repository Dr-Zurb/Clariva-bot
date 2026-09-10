# Plan p2 — In-cockpit command bar

## 30 Aug 2026 — Batch `rx-fast-entry` / `p2-command-bar` (`rfec-01..03`) — **M, ~1 day**

> **Status:** ✅ Gate green 2026-08-30 (live smoke residual)
> **Product plan:** [`plan-rx-fast-entry.md`](../../../../../Product%20plans/plan-rx-fast-entry.md) (RFE-DL-1…RFE-DL-12 — inherited)
> **Prior phase:** [`../p1-field-search/`](../p1-field-search/) — field index + `rxFocus` jump
> **Program:** [`../README.md`](../README.md) · Prefix `rfec`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md`](./Tasks/EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md)

---

## Why this phase

Cmd-K can now *find* a field. It still cannot **show** a hidden section or **set** a value, because the palette is outside the Rx form and is navigation-only (RFE-DL-1).

This phase mounts a **command bar** inside the Rx form provider. `/` opens it. The doctor can jump (reuse Phase 1's index), unhide (*Show Family history*), or set a vital (`spo2 98`). Cmd-K stays global — this bar does not steal it (RFE-Q3).

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| RFE-DL-1…RFE-DL-12 | Inherited. **Do not re-litigate.** |
| **RFE2-D1** | **Name lock, restated.** The component is a command bar. Do not name it palette. Do not import or wrap `CockpitPalette`. |
| **RFE2-D2** | Trigger is **`/`** when focus is not in an editable field (input, textarea, contenteditable, combobox). Escape closes. Cmd-K is not remapped. |
| **RFE2-D3** | Unhide writes through the **same in-memory hidden-set mutation + `hiddenOverridesToPersist` + existing `save*SectionHidden` / vitals persist path** the manage-section menus already use. No new doctor-settings key. No new sentinel (RFE-Q5). |
| **RFE2-D4** | Set-value vocabulary is **vitals only** (numeric + categorical keys already in the vitals visibility registry). Grammar is deterministic `label-or-alias` + value. No AI. A hidden vital is unhidden, then set. |
| **RFE2-D5** | Command-bar telemetry is a **new prefix**, counts-only: opened, searched (length), selected (kind: jump / unhide / set). The helpers must not accept a string that could be the raw command. |
| **RFE2-D6** | Jump inside the bar may call the Phase 1 consumer directly (same appointment, no `router.push` required). Reuse the field index module — do not fork the label maps. |

---

## Scope Guard — DO NOT TOUCH

- `GlobalCommandPalette` `SourceItem` contract (still navigation-only).
- `CockpitPalette.tsx`.
- Factory-visible sets.
- Parse services / apply-action builders (Phase 3).
- `cmdkSearched` signature (do not add a query parameter).
- New migration.
- The empty-hidden-set vs "show all" ambiguity (RFE-Q5).

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rfec-01`](./Tasks/task-rfec-01-command-bar-shell.md) | Command bar shell + `/` trigger + jump results | M | Auto |
| [`rfec-02`](./Tasks/task-rfec-02-unhide-section.md) | *Show \<section\>* through the existing persist path | M | Auto |
| [`rfec-03`](./Tasks/task-rfec-03-set-vital.md) | Deterministic set-value + counts-only telemetry | M | Auto |

---

## Acceptance gate

- [x] Inside a visit, `/` (focus not in an input) opens the command bar. Cmd-K still opens the global palette. (Vitest: editable-focus ignore + Cmd-K not remapped)
- [x] `family` offers *Show Family history* when that section is hidden; accepting adds it, persists via the existing settings path, scrolls, and focuses. (rfec-02 suite)
- [x] `spo2 98` sets SpO₂ to 98. If that vital is hidden, it is shown first. No network / AI call. (grammar + bar suite)
- [x] Jump from the bar to a visible field focuses it without a full page reload. (`rxFocus` replace on the current visit)
- [x] Telemetry helpers cannot be passed the raw command string. QA grep of the new prefix shows counts only. (`[ehr:rxcmd]`; `queryLen` / `kind` only)
- [x] Lean factory defaults unchanged. Manage-section menus still work. (no visibility-list edits)
- [x] Type-check + lint clean. New command-bar tests green. (touched files; repo-wide tsc still has pre-existing errors)

---

## Notes

- rfec-02 residual remains: Plan / Assessment / Objective *section* Show is not wired. Subjective + Vitals are. File budget went to set-value.
- **Live `/` smoke residual:** this session had no authenticated browser pass. Operator follow-up: open a visit → `/` → `spo2 98` writes; `/` → `family` shows Family history when hidden; Cmd-K still searches patients. Grammar + bar suites cover the same paths in Vitest.

---

## Risk register (phase)

| Risk | Mitigation |
|------|------------|
| `/` fires while typing in a complaint card | RFE2-D2. Ignore when focus is editable. |
| Unhide persists `[]` and the next load reapplies factory hide | RFE-Q5 / RFE2-D3. Same as the menus. Do not invent `__show_all__` in production. |
| Set-value parses "98" onto the wrong vital | Aliases must be specific (`spo2`, `sp o2`, schema label). Ambiguous queries offer a pick list, they do not write. |
| Telemetry copy-paste from cmdk grows a query argument | RFE2-D5. Signature review in rfec-03. |

---

**Last Updated:** 2026-08-30
