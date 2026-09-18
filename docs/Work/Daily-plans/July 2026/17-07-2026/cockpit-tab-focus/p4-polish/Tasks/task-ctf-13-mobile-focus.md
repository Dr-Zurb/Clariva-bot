# Task ctf-13: Mobile Focus path

> **Optional.** Skip unless mobile consults need Focus.  
> **Links:** [`../plan-p4-cockpit-tab-focus-polish-batch.md`](../plan-p4-cockpit-tab-focus-polish-batch.md)

---

## Goal

Expose Focus (and Primary/Peek if those phases shipped) on `CockpitMobileFallback` without breaking the flat stacked pane model.

**Size:** M–L · **Model:** Sonnet (Opus if 5+ files) · **Status:** Not started (optional).

---

## Breakdown

- [ ] 0.1 Lock mobile meaning of Focus: full-viewport overlay vs reorder stack to put leaf first.
- [ ] 1.1 Mount control on mobile pane chrome.
- [ ] 1.2 Session wiring (may share desktop hook).
- [ ] 1.3 Smoke: walk-in + known-patient; Esc/back Restores.
- [ ] 1.4 If 5+ files → STOP and use Opus per agent contract.

---

**Created:** 2026-07-17.
