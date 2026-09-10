# poa-02 — Sticky filter band + worklist chips

> **Model:** Auto  
> **Depends:** poa-01  
> **Plan:** POA-D3, D4, D5

## Goal

Primary worklists are always-visible chips in a sticky band (OPD-like), while View keeps secondary controls.

## Work

1. Wrap Patients search + chip row + View/bulk in a sticky band:
   - Classes inspired by OPD: `sticky top-14 z-20 bg-background/80 backdrop-blur` (+ light horizontal padding as needed).
2. Add chip strip (new small component or inline in `PatientsToolbar`):
   - **All** (clears `segment`)
   - Incomplete consults → `incomplete-consult`
   - Follow-up overdue → `at-risk-followup`
   - New (30d) → `new-30d`
   - Revisits (30d) → `revisit-30d`
3. Chip visuals: mirror `OpdQueueStatusFilter` — `rounded-full`, `text-xs font-medium`, active = primary fill, inactive = outline/muted. Prefer counts from KPI payload when available (optional); zeros stay visible but muted if easy.
4. Wire to existing `toggleSegment` / `setSegment` + clearable pill behavior (pill may become redundant when chips show active state — keep pill for Tags filter only, or keep both if clearer).
5. KPI tile click still sets the same segment (stay in sync with chips).
6. **View** menu: remove duplicate worklist checkboxes if chips own them; keep Saved views, Tags, Columns (+ allergies if present).

## Out of scope

Search clear/`/` (poa-03), table chrome (poa-04).

## Done when

- Chips switch segments without opening View.
- Sticky band remains visible while scrolling table body.
- View no longer the only path to the four worklists.
- Tags / saved views / columns still work.
