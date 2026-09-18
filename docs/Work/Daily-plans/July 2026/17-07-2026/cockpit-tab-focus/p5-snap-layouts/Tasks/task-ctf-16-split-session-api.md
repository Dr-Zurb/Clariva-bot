# Task ctf-16: Split session API (ratio + companion)

> **Depends on:** `ctf-15`  
> **Status:** ✅ Complete (2026-07-18).

## Shipped

- Session `{ prior, focusedLeafId, ratio, neighbourId }`
- `enterSplit` / `setCompanion` / `companionCandidates`
- Legacy aliases `enterFocus` → full, `enterPrimary` → wide, `enterPeek` → even
- Surfaced on `useCockpitV3Layout`
- Tests: narrow restore, ratio chain CTF-D10, setCompanion, full clears neighbour

**Closed:** 2026-07-18.
