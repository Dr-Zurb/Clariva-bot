# Cockpit v3 — daily batches

> **Product plan:** [`plan-cockpit-v3.md`](../../../Product%20plans/plan-cockpit-v3.md)  
> All phases for this program live in this folder. Execute in order.

| Phase | Folder | Batch plan | Execution order |
|---|---|---|---|
| 0 — scaffold | [`p0-scaffold/`](./p0-scaffold/) | [`plan-p0-cockpit-v3-scaffold-batch.md`](./p0-scaffold/plan-p0-cockpit-v3-scaffold-batch.md) | [`EXECUTION-ORDER-p0-cockpit-v3-scaffold.md`](./p0-scaffold/Tasks/EXECUTION-ORDER-p0-cockpit-v3-scaffold.md) |
| 1 — shell | [`p1-shell/`](./p1-shell/) | [`plan-p1-cockpit-v3-shell-batch.md`](./p1-shell/plan-p1-cockpit-v3-shell-batch.md) | [`EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./p1-shell/Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md) |
| 2 — dnd | [`p2-dnd/`](./p2-dnd/) | [`plan-p2-cockpit-v3-dnd-batch.md`](./p2-dnd/plan-p2-cockpit-v3-dnd-batch.md) | [`EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md) |
| 3 — platform | [`p3-platform/`](./p3-platform/) | [`plan-p3-cockpit-v3-platform-batch.md`](./p3-platform/plan-p3-cockpit-v3-platform-batch.md) | [`EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./p3-platform/Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md) |
| 4 — cutover | [`p4-cutover/`](./p4-cutover/) | [`plan-p4-cockpit-v3-cutover-batch.md`](./p4-cutover/plan-p4-cockpit-v3-cutover-batch.md) | [`EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./p4-cutover/Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md) |
| 5 — tab model | [`p5-tab-model/`](./p5-tab-model/) | [`plan-p5-cockpit-v3-tab-model-batch.md`](./p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md) | [`EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./p5-tab-model/Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md) |

**Phase 4 began the cutover** (parity matrix ✅ → flag flip + kill-switch ✅), but the flip exposed a structural defect: the default-on canvas isn't buildable (the palette + blank-seed operate on the nested template's column wrappers, which render nothing). **Phase 5 (tab model) ✅ shipped (2026-05-31):** it flattened the columns into a uniform flat tab registry, pointed the palette/seed at the real leaf tabs, decoupled Plan/Investigations, relabelled the body tab "Consult", and **re-proved parity on the flat-tab canvas** ([`PARITY-MATRIX-cv3t-03.md`](./p5-tab-model/PARITY-MATRIX-cv3t-03.md), 45 suites · 345 assertions green — supersedes cv3x-01 for the flip→soak→delete decision). **Phase 4 now resumes on a buildable v3:** ~1-week soak → cv3x-03 (delete the old shell + the now-dead glue: column factories, `InvestigationsAutoMerge`, `middle-bottom`) → cv3x-04 docs → `COCKPIT.md` flips to v3 and the program is Shipped.

**Predecessor:** pane-freedom program — [`../cockpit-pane-freedom/`](../cockpit-pane-freedom/) (Phases 1–4).
