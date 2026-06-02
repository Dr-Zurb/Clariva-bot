# Execution order — Booking review redesign Phase 3 (depth + platform)

> Batch: [`plan-p3-booking-review-depth-batch.md`](../plan-p3-booking-review-depth-batch.md) · Product plan: [`plan-booking-review-redesign.md`](../../../../../../Product%20plans/plan-booking-review-redesign.md)
>
> **3 waves, 4 tasks.** Add the detail drawer, mobile cards, and keyboard triage on top of the Phase-1/2 inbox — all frontend-only. The live IG conversation is **deferred** to a scoped backend task (P3-BRR-2 / BR-Q3); it is not in this batch. Read top-to-bottom before starting.

---

## TL;DR for the executor

1. **brr-10 first, alone.** Build `ReviewDetailSheet` (right `Sheet`): signals + candidates + proposal/final + resolved audit, from data already on the wire. Replace the inline "Show technical detail" expander. Conversation = a graceful placeholder (no backend call).
2. **brr-11 next.** Mobile card layout (`<lg`) replacing the `overflow-x-auto` table; tap opens brr-10's drawer.
3. **brr-12 next, same lane.** Keyboard nav (j/k/c/r/x/Enter//?) + bulk-select/bulk-confirm, dispatching through the Phase-2 deferred-commit flow; inert while typing or over a modal.
4. **brr-13 last.** Parity + a11y + bulk/Undo edges + tests.
5. **No backend, no `page.tsx`, no match-explain copy edits.** The conversation endpoint is a separate follow-up — do **not** add it here.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **brr-10** | Detail drawer (`Sheet`): signals + candidates + resolved audit + conversation placeholder | Phase 2 | Lane A | **M** | **Auto** |
| **2** | **brr-11** | Mobile card layout (`<lg`) → opens the drawer | brr-10 | Lane A (serial) | **M** | **Auto** |
| **2** | **brr-12** | Keyboard triage + bulk-select/confirm | brr-10 | Lane A (serial) | **M–L** | **Auto** |
| **3** | **brr-13** | Integration + parity + a11y/bulk gate + tests | brr-10..12 | Lane A | **S–M** | **Auto** (optional light review) |

> **One honest lane.** All tasks converge on `ServiceReviewsInbox.tsx` (+ new components/hooks) and the shared drawer, so they serialise ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)). Waves are review checkpoints.

---

## Critical path

```
   brr-10  ── ReviewDetailSheet (signals + candidates + audit + convo placeholder)
        │
        ▼
   brr-11  ── mobile cards (<lg) → tap opens the drawer
        │
        ▼
   brr-12  ── keyboard nav + bulk-confirm (through the Phase-2 dispatcher)
        │
        ▼
   brr-13  ── parity + a11y + bulk/Undo GATE + tests
        │
        ▼
   Phase 3 closed → only the deferred IG-conversation read remains (BR-Q3)
```

Single chain. The leverage is **brr-10**: it's the shared detail surface mobile (tap) and keyboard (`Enter`) both open. Build it faithfully first.

---

## Wave detail

### Wave 1 — the shared detail surface (brr-10)

**Goal:** one drawer with all the context, opened from anywhere.

- **brr-10 — Detail drawer.** `ReviewDetailSheet` (right `Sheet`): match summary + all reason codes (match-explain helper), candidate services, AI proposal + final visit type, and resolved audit (`resolved_by_user_id`, `resolution_internal_note`) for resolved rows. Replace the inline expander; open on row click. Conversation section = a placeholder ("Conversation view coming soon" + safe deep-link if available) — **no backend call** (P3-BRR-2). **Gate:** drawer shows all on-wire detail; replaces the expander; PHI in-session; degrades without the conversation.

### Wave 2 — platform + speed (brr-11 → brr-12, serial)

**Goal:** usable on a phone and clearable from the keyboard.

- **brr-11 — Mobile cards.** Below `lg`, render `ReviewCard`s (patient, reason, proposal + `ConfidenceBadge`, `SlaCountdown`/queued-age, Confirm + overflow for Reassign/Cancel); tap → drawer. Desktop table stays `lg+`. Toolbar + "N new" pill + toasts work in both (BR-DL-8 / P3-BRR-3). **Gate:** no horizontal scroll `<lg`; all actions reachable; tap opens the drawer.
- **brr-12 — Keyboard + bulk.** A selection model + a keyboard hook (mirror `use-composer-hotkeys`): `j`/`k` move, `c`/`r`/`x` act on selection, `Enter` open drawer, `/` focus filter, `?` help. Bulk-select → bulk-confirm fires per-row through the Phase-2 deferred-commit dispatcher (per-row 409 reconcile); one batch toast = Undo over the batch. Inert while typing or over a `Dialog`/`Sheet`; visible focus + `aria` (P3-BRR-4/5). **Gate:** shortcuts act correctly + safely; bulk-confirm routes through the dispatcher with parity.

**Why serial:** both edit the inbox and both target brr-10's drawer.

### Wave 3 — close the phase (brr-13)

**Goal:** parity + a11y + the bulk/Undo edges.

- **brr-13 — Integration + gate + tests.** Action-call parity (mouse / keyboard / bulk / quick-resolve); 409 everywhere; PHI no-log (drawer audit, card, keyboard); bulk + Undo edge cases; a11y (focus, `aria`, no trap); targeted tests; `tsc` + `lint`; inbox line. **Gate:** the batch cross-cutting gate is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **brr-10 — Auto (M).** Compose a `Sheet` from data already fetched; no new logic.
- **brr-11 — Auto (M).** Responsive card layout + an overflow menu, reusing existing atoms + the dispatcher.
- **brr-12 — Auto (M–L).** A keyboard/selection hook + bulk routing through the Phase-2 flow. Largest UX surface; the care is in a11y + the bulk/Undo batch, not new domains.
- **brr-13 — Auto (S–M).** Verification + tests. **Optional light review** of bulk + keyboard parity. No Opus: the only Opus-candidate (conversation read) is deferred out of this batch.

**No Opus build tasks. No Composer tasks** (interdependent UI on one component → keep coherent under Auto).

---

## Global anti-goals (apply to every task)

- ❌ Do **not** touch the backend, any migration, or `frontend/app/dashboard/booking-review/page.tsx`.
- ❌ Do **not** add the IG-conversation read endpoint or call it — it is a deferred, separately-scoped task (P3-BRR-2).
- ❌ Do **not** change `staff-review-match-explain.ts` copy/semantics.
- ❌ Do **not** introduce a new action call path — keyboard / mobile / bulk dispatch through the Phase-2 dispatcher; preserve payloads + the 409 reconcile (BR-DL-7 / P2-BRR-1).
- ❌ Do **not** fire shortcuts while typing in an input or while a `Dialog`/`Sheet` is open (P3-BRR-5).
- ❌ Do **not** add bulk reassign/cancel (confirm-only this phase).
- ❌ Do **not** add patient/reason/audit text to logs, analytics, or telemetry (BR-DL-5).

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own targeted test(s) green.
- [ ] Action-call parity preserved (spot-check at brr-12 and brr-13).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **The drawer is the keystone.** Mobile tap and keyboard `Enter` both open `ReviewDetailSheet`; build/stabilise it in brr-10 before the surfaces that target it.
- **Conversation is a placeholder only.** Render a clearly-labelled "coming soon" panel (+ a safe deep-link if one exists); do not fetch. The endpoint is a deferred PHI/RLS task (P3-BRR-2).
- **Resolved audit:** `resolved_by_user_id` is a UUID — render it plainly (or "staff") without a name lookup (no extra fetch); `resolution_internal_note` shows as-is. PHI stays in-session.
- **Mirror `use-composer-hotkeys`** for the keyboard hook: effect-bound, priority-ordered, guards for typing/modal, `preventDefault` only when you act.
- **Bulk routes through the Phase-2 dispatcher** (P3-BRR-4): bulk-confirm iterates the same deferred-commit entry per row; offer one batch Undo that cancels all still-pending in the batch. No new endpoint, no new payload.
- **Parity is still the prime directive** — new surfaces, same calls (BR-DL-7).
