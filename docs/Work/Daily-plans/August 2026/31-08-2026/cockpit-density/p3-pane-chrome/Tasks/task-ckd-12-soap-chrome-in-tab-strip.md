# Task ckd-12: Move SOAP chrome into the leaf tab strip

**Program / Phase:** cockpit-density · Phase 3  
**Status:** done — 2026-08-31  
**Change Type:** Update existing

Portal `SoapTabChromeActions` (expand / collapse / clear / templates / manage) from the four SOAP section bodies into `PaneTabStripV3` `trailingActions` via `SoapPaneChromeProvider` / `Slot` / `Portal`. Isolated section tests have no host — chrome stays in-flow.

**Do not** rewrite pane bodies or SOAP field internals.
