# Task text-B7: Pinned messages (doctor-only, 3-cap, `<PinnedMessagesBanner>`)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Doctors mid-consult need a way to keep a critical instruction visible after the chat scrolls past it: dosing, red-flag instructions, the agreed-upon plan summary. Patient-side, the same banner ensures the most important guidance never gets lost in scroll.

Pin lives at the top of the message list as a collapsed banner showing pinned messages (max 3 — RLS-enforced in B1). Tap a pinned item → smooth-scroll to the original. Long-press a pinned item (doctor only) → unpin.

Doctor-only pin/unpin is enforced both at RLS (`consultation_messages_pin_doctor_only` policy from B1) and in the UI (the menu option appears only when `currentUserRole === 'doctor'`).

**Estimated time:** ~5 hours.

**Status:** Done.

**Depends on:**
- [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) — hard. `pinned_at`/`pinned_by` columns, RLS policy, auto-unpin trigger ship there.
- [task-text-B2](./task-text-B2-message-bubble-extract.md) — hard. Pin/unpin live in the per-bubble menu.
- [task-text-B3](./task-text-B3-markdown-lite-renderer.md) — soft. Banner excerpts use `compact: true` markdown rendering.

**Source plan:** [T2 §T2.14](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

- [x] **`<PinnedMessagesBanner>` new component** at `frontend/components/consultation/PinnedMessagesBanner.tsx`:
  ```ts
  interface PinnedMessagesBannerProps {
    pinned: ConsultationMessage[];        // max 3, sorted by pinned_at DESC
    currentUserRole: 'doctor' | 'patient';
    onJumpToPin: (messageId: string) => void;
    onUnpin?: (messageId: string) => void; // present only for doctor
  }
  ```
  Renders a collapsible bar at the very top of the message-list area:
  - Collapsed default (just shows "📌 N pinned" + chevron).
  - Expanded shows up to 3 rows, each with a 1-line truncated body (`renderMarkdownLite(body, { compact: true })`), tap → `onJumpToPin`, long-press / right-click (doctor) → `onUnpin`.
- [x] **Pin / unpin action wired into `<MessageBubbleMenu>`** (B6) — only for `currentUserRole === 'doctor'`:
  - Pin: `update({ pinned_at: new Date().toISOString(), pinned_by: currentUserId })`. RLS blocks if cap of 3 is hit; on rejection, toast `Maximum 3 pinned messages. Unpin one first.`.
  - Unpin: `update({ pinned_at: null, pinned_by: null })`. RLS allows on doctor-only.
- [x] **`pinnedMessages` derivation in `<TextConsultRoom>`** — `messages.filter(m => m.pinned_at && !m.deleted_at).sort((a, b) => b.pinned_at - a.pinned_at).slice(0, 3)`. Recomputed on every messages-state change. Auto-unpin trigger (B1) means deleted-then-pinned can't actually happen — but keep the `!m.deleted_at` guard defensive.
- [x] **Auto-unpin trigger verification** — when a pinned message is soft-deleted (B6), the B1 trigger NULLs `pinned_at`. The UPDATE event fans out via Realtime; `pinnedMessages` re-derives; banner updates. No code path needed; verify with manual smoke.
- [x] **3-cap RLS reject toast** — when the doctor tries to pin a 4th, RLS returns 0 rows (`update().eq().select()` returns []). Frontend interprets this as "cap hit" and toasts the friendly message. Don't surface the raw Postgres error.
- [x] **`<MessageBubble>` shows `📌 pinned` micro-badge** when `message.pinned_at !== null`. Small, above the body, subdued.
- [x] **Three-host parity** — banner renders in `standalone` / `panel` / `canvas`. In `canvas` (narrow), the banner is more compact (1-line collapsed only by default).
- [x] **`mode='readonly'`** — banner renders (history view should preserve pinned context); pin/unpin actions hidden (no UI affordance, no menu).
- [x] **Initial load** — `<TextConsultRoom>` already loads message history on mount; pinned derivation reads from that. No separate query.
- [x] Frontend type-check + lint clean. Manual smoke (two windows): doctor pins a message; both windows show banner with the pinned content; doctor pins a second + third; banner updates each time; doctor tries a 4th → toast; doctor unpins one → banner updates; doctor soft-deletes a pinned message (B6) → banner removes that row immediately.

---

## Out of scope

- **Patient-side pin/unpin.** Doctor-only by RLS; UI mirrors that. Patient can pin in a future iteration.
- **Pin notification** ("Dr. X pinned a message"). System-message kind would need a B1 ENUM addition; defer.
- **Pin reordering / drag-to-reorder.** Sorted by `pinned_at` DESC; no manual reorder.
- **Pinning system messages.** Pin only `kind === 'text'` and `kind === 'attachment'`; system messages can't be pinned (UI hides the menu option).
- **"Pin to top of list" sticky scroll.** Banner is the affordance; no sticky-bubble injection.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/PinnedMessagesBanner.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/MessageBubbleMenu.tsx` — **edit** (B6 owns; this task adds the Pin/Unpin entries when `currentUserRole === 'doctor'`).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (`📌 pinned` micro-badge above the body when `pinned_at !== null`).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (`pinnedMessages` derivation; mount `<PinnedMessagesBanner>` above the message list; `togglePin` handler with cap-error toast; reuse `scrollToMessage` from B4).

**No backend, no schema** (B1 ships both).

---

## Notes / open decisions

1. **3-cap enforcement order** — both at RLS and in the UI? Yes — UI for fast feedback (disable Pin button when 3 are already pinned), RLS as the truth source. RLS reject toast is the fallback for races.
2. **Banner expand/collapse memory** — local-state only (resets on remount); no `localStorage` persistence (resetting on each consult is fine; pinned banners are short-lived).
3. **Banner click area for jump-to-pin** — the entire row, including the body excerpt, is the tap target. The unpin action lives behind a long-press (mobile) / hover-revealed `×` button (desktop).
4. **Body excerpt truncation** — single line, ellipsis on overflow. Use Tailwind `truncate`. Excerpt does not show the full markdown render; only inline (`compact: true`).
5. **Pin badge position** — above the body, not inline with the timestamp, so it's noticeable when scrolling past the original.
6. **Banner positioning vs. day-separator (A4)** — banner is fixed at the top of the message-list container, ABOVE the first day-separator. Day-separator stays as a flow item.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.14](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Schema dep:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) (columns + RLS + auto-unpin trigger).
- **Render dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md), [task-text-B3](./task-text-B3-markdown-lite-renderer.md).
- **Reuses:** `scrollToMessage` helper from [task-text-B4](./task-text-B4-reply-to-message.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done — picked up 2026-05-23.
