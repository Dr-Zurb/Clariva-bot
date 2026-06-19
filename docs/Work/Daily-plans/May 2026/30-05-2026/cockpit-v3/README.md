# Cockpit v3 — daily batches

> **Product plan:** [`plan-cockpit-v3.md`](../../../../Product%20plans/plan-cockpit-v3.md) — **Shipped 2026-06-02**  
> **Live reference:** [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../Reference/product/cockpit/COCKPIT.md)  
> Phases 0–5 (the core program) are **shipped** — the live appointment-detail cockpit is `CockpitV3Shell` only. **Phase 6 (shipped 2026-06-03)** is the first post-ship enhancement: default workflow layouts + a switcher + a premium visual pass (realises the deferred V3-Q1 seed).

| Phase | Folder | Status | Batch plan |
|---|---|---|---|
| 0 — scaffold | [`p0-scaffold/`](./p0-scaffold/) | ✅ Shipped | [`plan-p0-cockpit-v3-scaffold-batch.md`](./p0-scaffold/plan-p0-cockpit-v3-scaffold-batch.md) |
| 1 — shell | [`p1-shell/`](./p1-shell/) | ✅ Shipped | [`plan-p1-cockpit-v3-shell-batch.md`](./p1-shell/plan-p1-cockpit-v3-shell-batch.md) |
| 2 — dnd | [`p2-dnd/`](./p2-dnd/) | ✅ Shipped | [`plan-p2-cockpit-v3-dnd-batch.md`](./p2-dnd/plan-p2-cockpit-v3-dnd-batch.md) |
| 3 — platform | [`p3-platform/`](./p3-platform/) | ✅ Shipped | [`plan-p3-cockpit-v3-platform-batch.md`](./p3-platform/plan-p3-cockpit-v3-platform-batch.md) |
| 4 — cutover | [`p4-cutover/`](./p4-cutover/) | ✅ Shipped (2026-06-02) | [`plan-p4-cockpit-v3-cutover-batch.md`](./p4-cutover/plan-p4-cockpit-v3-cutover-batch.md) |
| 5 — tab model | [`p5-tab-model/`](./p5-tab-model/) | ✅ Shipped (2026-05-31) | [`plan-p5-cockpit-v3-tab-model-batch.md`](./p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md) |
| 6 — layouts + polish | [`p6-layouts-and-polish/`](./p6-layouts-and-polish/) | ✅ Shipped (2026-06-03) | [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](./p6-layouts-and-polish/plan-p6-cockpit-v3-layouts-and-polish-batch.md) |

**Cutover summary:** Phase 5 flattened the nested column template into the eight-tab flat registry ([`PARITY-MATRIX-cv3t-03.md`](./p5-tab-model/PARITY-MATRIX-cv3t-03.md)). Phase 4 then deleted the legacy shell, customize mode, the 5-zone overlay, and the feature flag (`cv3x-03`), and rewrote `COCKPIT.md` to describe v3 as the live model (`cv3x-04`).

**Deferred fast-follows:** **Phase 6** picks up the V3-Q1 default seed (as the Consult/Read/Document/Review workflow layouts) + the switcher + the premium visual pass. Still deferred → **Phase 7**: custom user-saved presets (preset CRUD UI + the `LayoutNode ↔ PaneTreeNode` bridge) on the surviving [`cockpit-layout-presets-tree.ts`](../../../../../../frontend/lib/api/cockpit-layout-presets-tree.ts) API; per-(doctor × consult-type) persistence; legacy `templates.tsx` / `InvestigationsAutoMerge` / `built-in-presets.ts` / `layout-presets-builtin.ts` glue removal once the reference audit is green.

**Predecessor:** pane-freedom program — [`../cockpit-pane-freedom/`](../cockpit-pane-freedom/) (Phases 1–4; interaction layer superseded by v3).
