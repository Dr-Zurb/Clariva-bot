# Cockpit — capture (deferred / future / debt)

> Parking lot for cockpit v3, panes, chart rail, layout, and consult-room chrome.  
> **Program (shipped):** [`../../Daily-plans/May 2026/30-05-2026/cockpit-v3/`](../../Daily-plans/May%202026/30-05-2026/cockpit-v3/)

## Decisions needed

_Add GO/NO-GO items here during triage._

## Future features

- [ ] **OPD queue header** — no need for “today” in OPD queue header (migrated from stray `improvements` capture, 2026-06-18).

## Debt / hardening

- [ ] **Chart rail perf** — `useChartRailEmptySignals` re-fires all 6 list APIs every vitals keystroke because `draftHasVitals` is in the deps array. Split so persisted-list fetches are independent of draft vitals reads. (Source: inbox `[csl follow-up]`)

## Promoted / done

_Move lines here when promoted to Daily-plans or closed._
