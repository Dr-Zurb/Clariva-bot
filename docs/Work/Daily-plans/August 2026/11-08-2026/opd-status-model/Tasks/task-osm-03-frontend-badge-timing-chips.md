# Task osm-03: Frontend — badge / timing / chips

## 11 Aug 2026 — Batch [opd-status-model](../plan-opd-status-model-batch.md) — Wave 3 — **M, ~4h**

---

## Task overview

Render lifecycle as the primary badge, timing as the wait/secondary cell, tags as chips. Move stepped-away from lifecycle override to `doctor_away` tag (OSM-D6). Keep old filter URL values working (OSM-D7).

**Estimated time:** ~4h.

**Status:** Pending.

**Hard deps:** osm-02 (payload shape).

**Source:** plan OSM-D1–D3, D6, D7.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + plan decision lock.
- `frontend/types/opd-doctor.ts`
- `frontend/components/opd/OpdSlotDenseRow.tsx`
- `frontend/components/opd/OpdSlotMobileCard.tsx`
- `frontend/components/opd/OpdQueueDenseRow.tsx` (only if queue surfaces consume the new axes; otherwise leave queue alone per scope guard)
- `frontend/components/opd/OpdSlotStatusFilter.tsx`
- `frontend/components/opd/OpdQueueGrid.ts`
- `frontend/hooks/useConsultSteppedAway.ts`
- `frontend/lib/cockpit/consult-stepped-away.ts`
- Related `frontend/**/__tests__` for dense rows / filters

**Estimated turns:** 3–4.

---

## Acceptance criteria

### Types

- [ ] Mirror `VisitLifecycle`, `SlotTiming`, `SlotTag` (+ optional fields on row type) in `frontend/types/opd-doctor.ts`.
- [ ] Drop the `grace` legacy comment once FE no longer special-cases it; keep accepting `'grace'` in URL translation only if needed.

### Row UI

- [ ] `OpdSlotDenseRow` / `OpdSlotMobileCard`: badge from `lifecycle`; wait cell from `timing`; chips from `tags`.
- [ ] Labels (draft): Scheduled / In consult / Incomplete / Done / Cancelled / Missed.
- [ ] Remove `steppedAway` lifecycle override. Keep `useConsultSteppedAway`; when true, append tag `doctor_away` (chip or Incomplete emphasis only when lifecycle is already `incomplete` / `in_consult` per product copy — prefer: show chip "Away" when stepped away; badge stays server lifecycle).
- [ ] Aria / tooltip: full "Incomplete consult" where short badge is "Incomplete".

### Filter

- [ ] `OpdSlotStatusFilter` filters on `lifecycle` (+ optional tag filter if cheap; otherwise tags are display-only this wave).
- [ ] Translate old URL values (`upcoming`, `running_late`, `grace`, `in_consultation`, `missed`, `overflow`) → new filters so bookmarks survive (OSM-D7).
- [ ] Counts: consume server `counts` including `incomplete`.

### Layout

- [ ] Re-check `OpdQueueGrid.ts` column widths; the 118px status widen from 2026-08-11 may be reversible once tags move off the badge.

### Tests

- [ ] Update dense-row / filter tests for new labels and Incomplete / Away behaviour.
- [ ] Snapshot / string assertions that still expect "Grace" or lifecycle-overridden Incomplete must be updated.

### Out of scope

- Queue-mode ETA / token UI redesign.
- Deleting `slotStatus` from the API.
- Write-path `booking_origin` (osm-04).

---

## Done when

- Slot board shows Overflow as a chip without suppressing Late/Upcoming.
- Leave-guard stepped-away still visible without inventing a false Incomplete when the session is live.
- Old filter query params still work.
