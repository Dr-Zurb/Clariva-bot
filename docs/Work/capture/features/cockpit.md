# Cockpit — capture (deferred / future / debt)

> Parking lot for cockpit v3, panes, chart rail, layout, and consult-room chrome.  
> **Program (shipped):** [`../../Daily-plans/May 2026/30-05-2026/cockpit-v3/`](../../Daily-plans/May%202026/30-05-2026/cockpit-v3/)

## Decisions needed

_Add GO/NO-GO items here during triage._

## Future features

- [ ] **OPD queue header** — no need for “today” in OPD queue header (migrated from stray `improvements` capture, 2026-06-18).
- [ ] **Cockpit tab Focus p4 — polish** — à la carte after dogfood: `F` hotkey · stub siblings · mobile. Plan: [`../../Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/p4-polish/`](../../Daily-plans/July%202026/17-07-2026/cockpit-tab-focus/p4-polish/) (`ctf-11`…`14`). Pick only pieces product wants — do not start unasked.

## Debt / hardening

- [ ] **Chart rail perf** — `useChartRailEmptySignals` re-fires all 6 list APIs every vitals keystroke because `draftHasVitals` is in the deps array. Split so persisted-list fetches are independent of draft vitals reads. (Source: inbox `[csl follow-up]`)

## Promoted / done

- [x] **Stable Consult surface (live move = no restart)** — shipped 2026-07-20. Consult (`body`) tab renders `<ConsultSurfaceSlot />`; `PatientProfilePage` mounts `<ConsultSurfaceHost>` once and portals `BodyZone` / `EndedConsultBody` into the active slot (offscreen fallback when Consult is hidden). Moving / retargeting Consult no longer remounts `ConsultationLauncher` / Twilio Room / patient notify. Companion: `ConsultSurfaceContext.tsx`.
- [x] **Consult drag during live teleconsult** — unlocked 2026-07-20. Supersedes v3-DL-6 `body`-during-`live` rearrange lock; Consult (`body`) is freely draggable / droppable while live. Anchored safety + send docks unchanged. Shell: `CockpitV3Shell` `canDragPane` always true; `consultActive` prop kept for call-site compat only.
- [x] **Cockpit tab Focus / Restore (p1)** — shipped 2026-07-17. Program: [`../../Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/`](../../Daily-plans/July%202026/17-07-2026/cockpit-tab-focus/). Maximize control on leaf tab strip; Esc Restore; persist suspension (CTF-D3 Option A).
- [x] **Cockpit tab Primary (~⅔) (p2)** — shipped 2026-07-17 (`ctf-05`…`07`). *(Neighbour semantics superseded by p7 CTF-D22.)*
- [x] **Cockpit tab Peek (~½) (p3)** — shipped 2026-07-17 (`ctf-08`…`10`). *(Neighbour semantics superseded by p7 CTF-D22.)*
- [x] **Cockpit tab Snap layouts + companion (p5)** — shipped 2026-07-18 (`ctf-15`…`18`). Visual Full/⅔/½/⅓ picker; ratios `full|wide|even|narrow`. *(Companion superseded by p7.)*
- [x] **Cockpit tab Show here (p6)** — shipped 2026-07-19 (`ctf-19`…`21`). Always-on **Show here**; slot-shell preserving swap. *(Session companion path removed in p7.)*
- [x] **Cockpit tab share focus (p7)** — shipped 2026-07-19 (**CTF-D22**). Wide/Even/Narrow = local parent-group share; siblings stay visible and share remainder proportionally; no default neighbour. Full still hides. *(Ratio geometry superseded by p8 CTF-D23 — local share couldn't beat sibling min-widths in crowded layouts.)* Plan: [`../../Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/p7-share-focus/`](../../Daily-plans/July%202026/17-07-2026/cockpit-tab-focus/p7-share-focus/).
- [x] **Cockpit tab snap rail (p8)** — shipped 2026-07-20 (**CTF-D23**). Wide/Even/Narrow lift the focused leaf to a root-level column at f% of the **screen** (67/50/33); every other visible pane re-parents into one vertical companion rail (`__focus_rail__`) at 100-f%. One companion → plain two-column split; sole visible → Full; hidden panes preserved. Focused pane now gets a real fraction even at 5+ columns. Plan: [`../../Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/p8-snap-rail/`](../../Daily-plans/July%202026/17-07-2026/cockpit-tab-focus/p8-snap-rail/).
