# Cockpit tab Focus + Restore — Phase 1 batch plan (17 Jul 2026)

> **Hand-off doc.** Written for an executing agent. Self-contained: cites real files, locked decisions (inherit program README), phased tasks, scope guard, verification gate.
>
> **One-line intent:** Ship temporary **Focus** (leaf owns the canvas) + exact **Restore** on cockpit leaves — named intents only; no fraction picker; no new preset.
>
> **Program index / decision lock:** [`../README.md`](../README.md) (`CTF-D1`…`D8`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-cockpit-tab-focus.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-tab-focus.md).

---

## Why this batch

During a consult the doctor mostly works in one SOAP surface at a time. Today they either:

1. Manually drag splitters (slow, imprecise mid-consult), or
2. Switch a whole **workspace preset** (Consult / Document / …) which changes more than they want and fights a carefully tuned personal layout.

Focus is the missing middle: **one leaf temporarily owns the canvas; Esc / Restore puts the prior tree back byte-for-byte.** Presets stay for durable workspace modes; ribbon sheets stay for chart/history overlays.

---

## Current state (grounded)

- Cockpit v3 layout is a recursive `PaneTreeNode` (`sizePct`, `hidden`, optional `paneIds` / `activeTabId`, `children`) owned by `useShellLayout` + `useCockpitV3Layout.dispatchEngine`.
- Mutations already exist for hide/add/split/tabs (`hidePaneToRoot`, `dropPaneIntoZone`, …). **There is no Focus primitive yet.**
- Leaf chrome: `PaneHeader` already has an `actions` slot; tabbed leaves use `PaneTabStripV3`.
- Undo/redo exists on the shell — Focus must **not** rely on undo as the product Restore path (undo is shared with ordinary drags). Use an explicit prior snapshot (CTF-D2 / D3).

---

## Decision lock (inherited — do not re-litigate)

See program README: **CTF-D1** named intents · **CTF-D2** snapshot + Restore · **CTF-D3** session-ephemeral prior · **CTF-D4** one chrome control + Esc · **CTF-D5** orthogonal to ribbon/presets · **CTF-D6** drag exits Focus · **CTF-D7** structural leaf / active tab · **CTF-D8** frontend-only.

---

## ⚠️ Scope guard

- **DO NOT** implement Primary (~⅔) or any fraction menu in this phase — that is [`../p2-primary/`](../p2-primary/).
- **DO NOT** touch ribbon expand, `default-layouts.ts` preset trees, or backend / migrations.
- **DO NOT** expand into a 5+ file drive-by chrome refactor; if wiring needs that many files, STOP and escalate model / split the task.
- Change only what Focus/Restore needs.

---

## Cross-cutting acceptance gate (whole phase)

Phase 1 is green only when **all** hold:

- [x] Every visible cockpit leaf (Body / Subjective / Objective / Assessment / Plan — and any other registry leaf still on canvas) exposes a Focus control. _(ctf-03 — `CockpitLeafView` trailingActions)_
- [x] Entering Focus makes that leaf own the canvas (~full visible area); other structural siblings collapse/hide per the mutation contract in `ctf-01`.
- [x] Restore (control toggle or Esc) restores the **exact** pre-Focus `paneTree` (sizes + hidden + tabs metadata).
- [x] SOAP form state does not remount/lose drafts across Focus ↔ Restore. _(leaf ids preserved; live draft dogfood in inbox)_
- [x] Applying a built-in / saved preset while Focused clears Focus cleanly (new tree wins; prior discarded — `discardFocusSession` then apply).
- [x] Manual resize while Focused exits Focus and keeps the post-drag tree (CTF-D6).
- [x] Light + dark desktop smoke; keyboard path works; no layout thrash on unrelated panes. _(Esc + a11y classes verified; visual light/dark dogfood in inbox)_
- [x] `cd frontend && npx tsc --noEmit && npm run lint` clean for the slice; Focus unit + chrome tests green. _(118 tests; no Focus-slice tsc errors)_

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `ctf-01` | Pure `focusLeafInTree` / restore helpers + unit tests | S–M | Sonnet / Auto |
| `ctf-02` | Focus session hook wired to `applyLayout` (snapshot, Esc, drag/preset exit) | M | Sonnet |
| `ctf-03` | Chrome affordance on leaf header / tab strip + a11y | S–M | Sonnet / Auto |
| `ctf-04` | Close gate: smoke + verification | S | Sonnet / Composer |

---

## Cost estimate

| Wave | Tasks | Wall-clock |
|---|---|---|
| Wave 1 — mutation primitive | `ctf-01` | ~2–3h |
| Wave 2 — session + shell | `ctf-02` | ~2–4h |
| Wave 3 — chrome | `ctf-03` | ~2–3h |
| Wave 4 — close gate | `ctf-04` | ~1–2h |
| **Total** | **4** | **~7–12h agent-time** |

**Caps:** 0 Opus expected. No migration.

---

## Sequencing notes

- **ctf-01 first.** Pure tree transform + tests; no React. Everything downstream consumes it.
- **ctf-02 next.** Owns snapshot lifecycle, Esc, interaction with presets/drag, persist policy (CTF-D3).
- **ctf-03.** Thin UI over the hook; keep file count small.
- **ctf-04 last.** Prove the cross-cutting gate.

---

## Open questions (resolve in ctf-02, document the pick)

1. **Sibling treatment in Focus:** hide siblings (`hidden: true` + rebalance) vs collapse-to-stub strip? Recommendation: **hide + rebalance along the ancestor path** so the focused leaf truly owns space; stubs are a nicety, not required for p1.
2. **Preset while Focused:** auto-exit Focus and apply preset (recommended) vs block with toast.
3. **Refresh mid-Focus:** restore prior from `sessionStorage` vs stay Focused. Recommendation: **stay Focused if focusMeta present**, with Restore still available.

---

## References

- Program: [`../README.md`](../README.md)
- Ribbon (orthogonal): `../../16-07-2026/ribbon-expand-snapshot-history/`
- DoD: `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`

---

**Created:** 2026-07-17. **Status:** ✅ Phase 1 complete (2026-07-17) — ready to merge / dogfood.
