# Cockpit tab focus — 17 Jul 2026 program

> **Why this exists.** Doctors often need one SOAP / consult tab to own (or nearly own) the canvas without permanently reshaping their saved layout or picking arbitrary fractions (¼ / ⅓ / ½). Phase 1 shipped temporary **Focus + Restore**. Later phases add more **named intents** and polish — still no free fraction picker.

---

## The one-sentence goal

> **Named / discrete layout intents on every cockpit leaf — Full · ⅔ · ½ · ⅓ via visual picker + exact Restore; global snap-rail ratios (focused pane owns f% of the screen, everything else stacks into one companion rail); polish (hotkey / stubs / mobile) only if dogfood asks.**

---

## Decision lock (program-wide)

### From Phase 1 (frozen)

- **CTF-D1 — Named intents, not fractions.** No ¼ / ⅓ / ½ / ¾ chip picker. Manual drag remains the fine-tune escape hatch.
- **CTF-D2 — Temporary tree mutation + exact Restore.** Snapshot prior `paneTree`; Restore via `applyLayout(prior)`. Not a built-in preset.
- **CTF-D3 — Session-ephemeral prior.** Option A shipped: `setPersistSuspended` while session active.
- **CTF-D4 — One chrome control.** Leaf tab-strip trailing action (`PaneFocusButton`). Esc Restores.
- **CTF-D5 — Orthogonal surfaces.** Ribbon sheets + workspace presets unchanged.
- **CTF-D6 — Drag while session active.** Exits session, keeps post-drag tree, discards prior.
- **CTF-D7 — Target is structural leaf / active tab.** Preserve `paneIds` / `activeTabId`.
- **CTF-D8 — Frontend-only.** Zero backend / migration / RLS.

### Additive (later phases)

- **CTF-D9 — Primary ≈ 67 / 33.** *(Superseded by CTF-D22.)* Was: focused branch ~67%, one neighbour ~33%; others hidden.
- **CTF-D10 — Mode switches from original prior.** Focus ↔ Wide ↔ Even ↔ Narrow always recompute from the session’s original prior tree, never from the current transformed tree.
- **CTF-D11 — Chrome menu grows by named intents.** Idle: menu of available intents. Active: **Restore** (and optionally switch intent). Still no fraction chips. *(Superseded for UI by CTF-D15 visual picker in p5; discrete stops remain.)*
- **CTF-D12 — Peek ≈ 50 / 50** (Phase 3). *(Superseded by CTF-D22.)* Was: neighbour 50/50. *(Internal ratio becomes `even` in p5.)*
- **CTF-D13 — Polish is optional and cancellable.** Hotkey / stub siblings / mobile each ship only if product asks after soak (Phase 4).
- **CTF-D14 — Narrow ≈ 33 / 67** (Phase 5). *(Superseded by CTF-D22.)* Was: focused ~⅓, neighbour ~⅔.
- **CTF-D15 — Visual layout picker** (Phase 5). Diagram grid Full · ⅔ · ½ · ⅓; not a free slider.
- **CTF-D16 — Auto companion + inline Beside swap** (Phase 5). *(Superseded by CTF-D22 — no neighbours.)*
- **CTF-D17 — Internal ratio rename** (Phase 5). `'full' | 'wide' | 'even' | 'narrow'`; unified `enterSplit`.
- **CTF-D18 — Show here always-on** (Phase 6). Every leaf has **Show here ▾**; not gated on Focus.
- **CTF-D19 — Idle Show here = durable swap** (Phase 6). Other host → `swapPaneTreeNodes`; same-leaf tab → `setActiveTab`.
- **CTF-D20 — Session companion Show here = setCompanion** (Phase 6). *(Superseded by CTF-D22 — Show here always durable.)*
- **CTF-D21 — Focus menu is size-only** (Phase 6). No Beside section inside the layout dropdown.
- **CTF-D22 — Share-based local ratios** (Phase 7). *(Superseded by CTF-D23.)* Was: focused leaf takes f% of **its parent group**; visible siblings share the remainder proportionally. Broke down in crowded layouts because sibling min-widths ate the viewport.
- **CTF-D23 — Global snap rail** (Phase 8). Wide/Even/Narrow lift the focused leaf to a **root-level column at f% of the screen** (67/50/33); every other visible pane is re-parented into a single vertical **companion rail** (`__focus_rail__`) at 100-f%. One companion → plain two-column split; sole visible → Full. Hidden panes preserved as hidden root siblings. Gives the focused pane a *real* fraction even at 5+ columns (rail costs only one min-width). Full still hides others; Show here still durable.

---

## What this program does NOT do

| Item | Why / where |
|---|---|
| Free fraction size menu / slider | CTF-D1 / D15 |
| Overlay / modal fullscreen of pane content | CTF-D2 |
| New built-in preset ("Focus Plan") | CTF-D2 / D5 |
| Changing ribbon expand | Separate program |
| Persisting Focus as default across visits | CTF-D3 |

---

## Phasing

| Phase | Folder | Status | Ships |
|---|---|---|---|
| **p1 — Focus + Restore** | [`p1-focus-restore/`](./p1-focus-restore/) | ✅ Complete 2026-07-17 | Full-canvas Focus, Esc/Restore, persist suspension, leaf chrome |
| **p2 — Primary (~⅔)** | [`p2-primary/`](./p2-primary/) | ✅ Complete 2026-07-17 | Named Primary + Focus/Primary/Restore menu; CTF-D9/D9b/D10 |
| **p3 — Peek (~½)** | [`p3-peek/`](./p3-peek/) | ✅ Complete 2026-07-17 | Named Peek (~50/50) + menu; CTF-D12 |
| **p4 — Polish** | [`p4-polish/`](./p4-polish/) | Planned — optional / à la carte after dogfood | `F` hotkey · stub siblings · mobile Focus |
| **p5 — Snap layouts + companion** | [`p5-snap-layouts/`](./p5-snap-layouts/) | ✅ Complete 2026-07-18 | Visual Full/⅔/½/⅓ picker · Narrow · Beside swap (`ctf-15`…`18`) |
| **p6 — Show here** | [`p6-show-here/`](./p6-show-here/) | ✅ Complete 2026-07-19 | Always-on Show here on every leaf; Focus = size only (`ctf-19`…`21`) |
| **p7 — Share focus** | [`p7-share-focus/`](./p7-share-focus/) | ✅ Complete 2026-07-19 (superseded by p8) | Local share ratios; no neighbours (`CTF-D22`) |
| **p8 — Snap rail** | [`p8-snap-rail/`](./p8-snap-rail/) | ✅ Complete 2026-07-20 | Global snap-rail ratios — focused pane owns f% of the screen, rest stack into one rail (`CTF-D23`) |

**Execute in order.** Cancel later phases in the program README if dogfood shows they are unnecessary — do not invent free fractions as a substitute. p4 polish stays optional even after p5.

---

## Shipped code (p1–p8 — extend, don’t fork)

- `frontend/lib/patient-profile/v3/focus-leaf.ts` — `focusLeafInTree`, global snap rail (`wide`/`even`/`narrow` via `snapRailInTree`, `FOCUS_RAIL_ID`), `splitLeafByRatio`, `listShowHereCandidates`
- `frontend/lib/patient-profile/v3/usePaneFocusSession.ts` — `ratio` + `enterSplit` + Esc (no neighbour)
- `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` — resize/preset discard wiring; surfaces focus API + durable `showPaneHere`
- `frontend/lib/patient-profile/useShellLayout.ts` — `setPersistSuspended`
- `frontend/components/patient-profile/v3/PaneFocusButton.tsx` + `LayoutRatioIcon.tsx` — visual Full/⅔/½/⅓ + Restore
- `frontend/components/patient-profile/v3/PaneShowHereButton.tsx` — always-on Show here chip
- `frontend/components/patient-profile/v3/PaneTabStripV3.tsx` — `trailingActions`

---

## Cost / model sketch

| Phase | Tasks | Opus? | Wall-clock (after go-ahead) |
|---|---|---|---|
| p1 | 4 | 0 | ✅ done |
| p2 | 3 (`ctf-05`…`07`) | 0 | ✅ done |
| p3 | 3 (`ctf-08`…`10`) | 0 | ✅ done |
| p4 | up to 4 optional | 0 | ~3–10h depending on picks |
| p5 | 4 (`ctf-15`…`18`) | 0 | ✅ done |
| p6 | 3 (`ctf-19`…`21`) | 0 | ✅ done |
| p7 | 1 (CTF-D22) | 0 | ✅ done |
| p8 | 1 (CTF-D23) | 0 | ✅ done |

No migration / PHI / RLS. If a task balloons to a 5+ file refactor, **STOP and switch to Opus**.

---

## Process refs

- `docs/Work/process/PHASED-PLANS-GUIDE.md`
- `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`
- `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`
- `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`

---

**Created:** 2026-07-17. **Status:** p1–p3 ✅ · p5–p8 ✅ · p4 polish optional. **Pattern:** temporary layout-tree discrete intents + exact Restore + global snap-rail ratios + always-on Show here.
