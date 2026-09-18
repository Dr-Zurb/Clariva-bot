# Task ckd-13: Single background + single border for the context header

**Program / Phase:** cockpit-density · Phase 3  
**Status:** done — 2026-08-31  
**Change Type:** Update existing

Wrap `CockpitHeader` + `CockpitContextRow` in `CockpitContextSurface` (`border-b bg-background`). Strip the header’s own `border-b` / backdrop fill and the context row’s `border-b` / `bg-card`.
