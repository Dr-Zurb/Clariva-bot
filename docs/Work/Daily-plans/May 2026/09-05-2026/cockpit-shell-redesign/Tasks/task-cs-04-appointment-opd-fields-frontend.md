# Task cs-04: Frontend `Appointment` type mirror + `<CockpitHeader>` consumes the real OPD token

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase A, Lane β step 1 — **XS, ~30min**

---

## Task overview

Stitched onto [`cs-03`](./task-cs-03-appointment-opd-fields-backend.md). After the backend payload widening lands, the frontend `Appointment` type needs the two new optional fields, and `<CockpitHeader>` needs to read `opd_token_number` instead of falling back to `?`.

This is a one-file (technically two-file) follow-up to cs-03. **Run in the same chat as cs-03** to avoid a context reload.

**Estimated time:** ~30min.

**Status:** Pending.

**Hard deps:** [`cs-03`](./task-cs-03-appointment-opd-fields-backend.md) must be merged first (or at least drafted with the API contract finalized).

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D6](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability) (continued from cs-03).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (continuing from the cs-03 chat).

**New chat?** **No** — stitch onto the cs-03 chat. The model already has the backend types loaded; the frontend type-mirror is a 2-line change.

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Frontend `Appointment` type mirror

- [ ] In `frontend/types/appointment.ts`, add the two optional fields to the `Appointment` interface:

  ```ts
  /** Set when the appointment is part of an OPD queue session. NULL otherwise. */
  opd_event_type?: 'group' | 'token' | null;
  /** OPD session token number. NULL for non-OPD appointments. */
  opd_token_number?: number | null;
  ```

  - Optional + nullable: backend returns null for non-OPD appointments. The optional `?` is for forward-compat (old API responses without the fields shouldn't crash the type-checker).

### `<CockpitHeader>` consumes the real token

- [ ] Find where `<CockpitHeader>` currently renders `#?`. Probable location: row 1, near the modality icon — likely a hardcoded fallback like:

  ```tsx
  {appointment.opd_token_number ? `#${appointment.opd_token_number}` : '#?'}
  ```

  …or worse, a literal `'#?'` with a TODO comment.

- [ ] Replace with the proper conditional:

  ```tsx
  {appointment.opd_event_type === 'token' && typeof appointment.opd_token_number === 'number' && (
    <span className="text-xs font-medium text-muted-foreground">
      Token #{appointment.opd_token_number}
    </span>
  )}
  ```

  - **Render only for `event_type === 'token'`.** `'group'` events don't have a meaningful display token; suppress the chip in that case rather than showing a misleading number.
  - **`typeof === 'number'` not `??`** — defends against the (unlikely) case of `opd_token_number === 0` rendering as falsy.

### `MobilePillBar` mirror (if applicable)

- [ ] Grep for `'#?'` and `'opd_token'` across `frontend/components/consultation/cockpit/` and `frontend/components/consultation/`. If `<MobilePillBar>` or any other small surface also renders the token, apply the same conditional render. (Likely there isn't one — the mobile pill bar is action-only — but verify.)

### Type-check + tests

- [ ] `pnpm --filter frontend tsc --noEmit` is clean.
- [ ] If `cockpit-header.test.tsx` exists, add a test:
  - Render `<CockpitHeader>` with `opd_event_type='token'` + `opd_token_number=3`. Assert "Token #3" is in the DOM.
  - Render with `opd_event_type=null` + `opd_token_number=null`. Assert "Token #" / "#?" is NOT in the DOM.
- [ ] All existing cp-NN tests still pass.

### Manual verification

- [ ] Open the cockpit for a queue-mode appointment (one that exists in `opd_queue_entries`). Confirm the header shows the real token number (e.g. `Token #3`) on first render — not after a delay, not as `#?`.
- [ ] Open the cockpit for a scheduled-mode (non-OPD) appointment. Confirm no token chip renders.

---

## Out of scope

- **The backend widening** — that's cs-03.
- **Refactoring how the OPD snapshot is consumed elsewhere.** `<CockpitQueueRail>` reads tokens from `useOpdSnapshot`, not from the appointment payload — leave it alone. The two paths are intentionally distinct (one is the "current patient's stable token", the other is the "session-day queue").
- **Caching strategy.** The cockpit refetches the appointment normally; no prefetch optimization is part of this task.

---

## Files expected to touch

**Modified:**
- `frontend/types/appointment.ts` (+2 fields, ~4 LOC with JSDoc)
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~5 LOC delta)
- `frontend/components/consultation/cockpit/__tests__/cockpit-header.test.tsx` (only if it exists; ~15 LOC delta)

**New:** none.

---

## Notes / open decisions

1. **Display copy: `Token #3` vs `#3`.** Picked `Token #3` for clarity. The `Token` prefix tells the doctor what the number means without context. If clinical UX prefers `#3` (shorter, more glance-able), it's a one-line change later — file a polish task.
2. **Color treatment.** Used `text-muted-foreground` because the token is metadata, not a primary identifier. The patient name + age/sex stay primary; the token is a secondary chip.
3. **What about events with `event_type='group'`?** Group events are currently rare (and the schema permits them but no UI mints them). Suppressing the chip for group events is the right default; we can revisit if/when group queues become a real product.
4. **Inline-editing the token from the cockpit?** Out of scope — token assignment is the OPD queue page's job, not the cockpit's.

---

## References

- **Predecessor:** [`task-cs-03-appointment-opd-fields-backend.md`](./task-cs-03-appointment-opd-fields-backend.md) — backend half of this stitched pair.
- **Affected files:**
  - `frontend/types/appointment.ts`
  - `frontend/components/consultation/cockpit/CockpitHeader.tsx`
  - `frontend/components/consultation/cockpit/__tests__/cockpit-header.test.tsx` (conditional)

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
