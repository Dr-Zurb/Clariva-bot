# Task ctf-12: Stub siblings while session active

> **Optional.** Skip unless hide-feels-gone in dogfood.  
> **Links:** [`../plan-p4-cockpit-tab-focus-polish-batch.md`](../plan-p4-cockpit-tab-focus-polish-batch.md)

---

## Goal

While Focus/Primary/Peek session is active, show off-path leaves as **collapsed stubs** (click → Restore or switch) instead of `hidden: true` (fully gone). Restore must still return the **exact prior** tree.

**Size:** M · **Model:** Sonnet · **Status:** Not started (optional).

---

## Breakdown

- [ ] 0.1 Lock UX: stub click = Restore vs enter Focus on that leaf from prior.
- [ ] 1.1 Transform variant or post-pass that marks siblings collapsed/stub-visible without deleting identity.
- [ ] 1.2 Renderer: reuse existing collapsed strip / rail stub patterns if present; do not invent a third chrome system.
- [ ] 1.3 Tests: Restore serialisation equals prior; session discard still works.
- [ ] 1.4 Confirm durable `setPaneHidden` / presets unchanged when no session.

**Scope:** session-only. No migration.

---

**Created:** 2026-07-17.
