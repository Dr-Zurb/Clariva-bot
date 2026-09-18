# Task vsf-01: Gallery / Sidebar fill-height + orientation matrix

## 09 August 2026 — Video stage fill (cockpit + patient join)

---

## Task overview

Gallery and Sidebar left large white voids because inline `<VideoTile>`s used `aspect-video` (16:9) inside a flex/grid stage that expected children to stretch. Sidebar’s 30% rail became a short self-card with empty column below.

This task makes Gallery / Sidebar / Speaker **fill the call stage**, adapts portrait vs landscape stacking, and keeps the call header solid (non-glass) so it never reads as an overlay chip.

**Status:** ✅ Shipped (2026-08-09).

**Depends on:** Call-stage header / expand pass (CallStageHeader, cockpit layout storage).

---

## Acceptance criteria

- [x] `VideoTile` supports `fill` — `h-full` + `object-cover`, no `aspect-video`.
- [x] Gallery: stage `h-full` grid; portrait = 2 rows; landscape/`md+` = 2 columns.
- [x] Sidebar: both columns/rows stretch full height (remote ~70%, self ~30% in landscape/`md+`; stacked equal flex in portrait).
- [x] Speaker remote also fills (no 16:9 letterbox under PiP).
- [x] `CallStageHeader` uses solid background (not translucent over video).
- [x] Unit coverage for `fill` class behavior on `VideoTile`.

---

## Out of scope

- New layout modes / 3-way gallery
- Changing Twilio capture constraints by orientation
- Patient orientation-lock UX redesign (F2 button already exists on non-cockpit)

---

## Files

- `frontend/components/consultation/VideoTile.tsx`
- `frontend/components/consultation/VideoRoom.tsx`
- `frontend/components/consultation/CallStageHeader.tsx`
- `frontend/components/consultation/__tests__/VideoTile.fill.test.tsx`
