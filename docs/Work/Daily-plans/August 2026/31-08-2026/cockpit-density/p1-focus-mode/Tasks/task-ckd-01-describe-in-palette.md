# Task ckd-01: Describe bar on the palette row

**Program / Phase:** cockpit-density · Phase 1  
**Status:** done — 2026-08-31  
**Change Type:** Update existing

**Current State:**
- ✅ `VisitDescribeFormBar` mounts in `safetyDock` (`PatientProfilePage.tsx`)
- ✅ `CockpitPalette` is the next `shrink-0` sibling
- ❌ Two stacked rows (~73px). Proposal grows the dock.

**Scope Guard:** Expected files: `VisitDescribeBar.tsx`, `CockpitPalette.tsx`, `CockpitV3Shell.tsx`, `PatientProfilePage.tsx`, tests. No parse-orchestrator changes.

**Design Constraints:**
- CKD-DL-5: desktop = palette row; proposal = popover.
- Mobile keeps the block bar in the safety dock.
- Palette `flex-wrap` must not wrap the describe input onto a second row.

**Acceptance:**
- Desktop palette contains the describe input.
- Proposal does not change canvas height.
- Existing VisitDescribeBar parse/apply tests still pass.
