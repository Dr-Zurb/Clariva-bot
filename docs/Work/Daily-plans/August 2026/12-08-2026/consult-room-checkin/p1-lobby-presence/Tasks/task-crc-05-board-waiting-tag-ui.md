# Task crc-05: Board Waiting / Stepped away tags

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 5 — **S–M, ~2h**

---

## Task overview

Surface presence tags from crc-02 on the OPD doctor board so Start decisions are presence-aware (CRC1-D7).

**Estimated time:** ~2h  
**Status:** ⏳ Pending  
**Hard deps:** crc-02 (tags on wire).  
**Source:** CRC-D2, CRC-D8, CRC1-D7.

---

## Model & execution guidance

**Recommended model:** Auto / Composer.

**New chat?** **Yes.** Pre-load:

- This task + batch plan.
- `frontend/components/opd/shared/slotAxes.ts` (tag labels)
- `frontend/components/opd/OpdSlotDenseRow.tsx`, `OpdSlotMobileCard.tsx`
- Queue row components that show tags (`OpdQueueRow` / dense row — find current tag rendering from OSM)
- `opdSlotSectioning.ts` tooltips pattern (`SLOT_CHIP_SECTION_HINT`) — add tag tooltips only, do not change section order
- Backend tag list already includes `patient_waiting` / `patient_stepped_away`

---

## Acceptance criteria

### UI

- [ ] Slot dense row + mobile card show a clear **Waiting** chip when tag `patient_waiting`.
- [ ] Show **Stepped away** (or agreed short label) when `patient_stepped_away`.
- [ ] Queue mode rows show the same chips (parity).
- [ ] Tooltip copy, e.g.:
  - Waiting: “Patient is in the consult lobby right now.”
  - Stepped away: “Patient checked in earlier but lobby went idle.”
- [ ] Visual weight secondary to lifecycle badge (tag, not replacing Overdue/Incomplete).
- [ ] No new filter chip required in p1 (tags only). If adding a filter is tempting, **do not** — out of scope.

### Tests

- [ ] Unit/snapshot or label helper tests for new tag labels if the repo already tests tag labels that way.

### Out of scope

- Reordering sections / status filter chips.
- Realtime board updates (still 30s poll).
- Auto-suggest requeue when next token not waiting (nice follow-up; not p1).

---

## Scope Guard

- Frontend OPD presentation only (+ tiny shared label map). ≤ 5 files preferred.
- **DO NOT** change partition/section order from recent OSM UI work.

---

## Done when

- Doctor can glance at the board and see who is in lobby vs stepped away; tooltips clear; no section regressions.
