# Task text-D1: Composer-draft crash recovery (`useComposerDraft` → `sessionStorage`; clears on send)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **warm-up**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The user types a 200-word reply, the browser tab crashes / the laptop hibernates / accidentally Cmd+W, the user reopens the consult, and the draft is gone. Today this is a real loss. Two-line fix:

1. On every composer keystroke (debounced 300 ms), persist `composerBody + replyTo + composerAttachments-meta` to `sessionStorage` keyed by `consult-draft-{sessionId}`.
2. On `<TextConsultRoom>` mount, hydrate the composer from that key if present.
3. On successful send (after server-INSERT acks), clear the key.

`sessionStorage` is per-tab and cleared when the tab closes — exactly the right scope. (Choosing `localStorage` would risk recovering drafts from a sibling tab, which is messy when D2's multi-tab kick is also in play.)

**Composer attachment files cannot be persisted** (Files / Blobs aren't serialisable to sessionStorage). Only the metadata (`localId`, `name`, `mime`, `sizeBytes`) is saved; on hydrate, the user sees a banner `Your draft was restored. Re-attach: <list of file names>` and re-attaches manually.

**Estimated time:** ~3 hours.

**Status:** Done.

**Depends on:** None hard.

**Source plan:** [T5 §T5.30](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

- [x] **`useComposerDraft(sessionId)` hook** at `frontend/lib/text/use-composer-draft.ts`:
  ```ts
  interface ComposerDraft {
    body: string;
    replyTo: { id: string; sender_name: string; body: string } | null;
    attachmentMeta: { localId: string; name: string; mime: string; sizeBytes: number }[];
    savedAt: string;     // ISO
  }
  // Returns:
  // {
  //   hydratedDraft: ComposerDraft | null,   // null if no draft on mount
  //   saveDraft: (draft: ComposerDraft) => void,    // debounced 300ms
  //   clearDraft: () => void,
  // }
  ```
- [x] **Debounce** — single shared 300 ms debouncer; calls `sessionStorage.setItem` once. Cleanup on unmount fires the trailing call.
- [x] **Hydration banner** — when `hydratedDraft !== null`, render above the composer:
  ```tsx
  <div className="bg-yellow-50 border-l-2 border-yellow-400 px-3 py-1 text-xs text-yellow-800">
    Your draft was restored.
    {hydratedDraft.attachmentMeta.length > 0 && (
      <> Re-attach: {hydratedDraft.attachmentMeta.map(a => a.name).join(', ')}</>
    )}
    <button onClick={clearDraft} className="underline ml-2">Discard</button>
  </div>
  ```
  Banner persists until either user sends OR taps Discard OR all attachment-meta entries get re-attached + body modified.
- [x] **`<TextConsultRoom>` mount integration** — read `hydratedDraft`, set `composerBody = draft.body`, `replyTo = draft.replyTo`. Don't auto-restore attachments (can't); show banner.
- [x] **`saveDraft` triggers** — on every change to `composerBody`, `replyTo`, or `composerAttachments`. Skip when all three are empty (don't persist an empty draft).
- [x] **`clearDraft` triggers** — after successful Send (post-server-ack); after Discard tap.
- [x] **`sessionStorage` quota** — typical limit is 5MB; a 200KB draft is fine. Don't persist file blobs (the metadata is small).
- [x] **Multi-tab safety** — D2 (multi-tab kick) might evict this tab; if so, the draft stays in `sessionStorage` of THIS tab and is recoverable when the user comes back. Document.
- [x] **Three-host parity** — works in `standalone` / `panel` / `canvas`. The session ID is the key, so each layout / consult correctly isolates its own draft.
- [x] **`mode='readonly'`** — composer is gone; `useComposerDraft` early-returns (doesn't read or write).
- [x] **Unit tests** at `frontend/lib/text/__tests__/use-composer-draft.test.ts`:
  - Hydrate from prior `sessionStorage` value.
  - Save debounced (assert one `setItem` call after 300 ms despite 5 rapid changes).
  - Clear after send.
  - Empty draft never persisted.
  - SSR-safe (no `sessionStorage` access during initial render — guard with `typeof window`).
- [x] Frontend type-check + lint clean. Manual smoke: type a 50-word body + select an attachment + tap reply on a message; close the tab; reopen the consult; banner shows + body + reply-state restored + "Re-attach: photo1.jpg" listed.

---

## Out of scope

- **Persisting attachment file blobs.** Files aren't serialisable to sessionStorage; IndexedDB could persist blobs but would dramatically increase complexity. v1 just shows the names.
- **Cross-tab draft sync.** sessionStorage is per-tab; document.
- **Draft history** ("show me drafts I've discarded"). Out of scope.
- **Auto-restore without banner.** Banner is intentional — silent restore can confuse users who'd already moved on.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/use-composer-draft.ts` — **new** (~80 LOC).
- `frontend/lib/text/__tests__/use-composer-draft.test.ts` — **new** (~80 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mount hook; hydration banner; integrate `saveDraft` calls; `clearDraft` on send-ack).

**No backend, no schema.**

---

## Notes / open decisions

1. **Debounce duration** — 300 ms is enough to cover normal typing without being so long that a sudden crash mid-burst loses the last word.
2. **Why `sessionStorage` not `localStorage`** — drafts shouldn't persist across browser sessions for clinical privacy. If the laptop is shared, a closed tab shouldn't leave a recoverable draft on the next user.
3. **Why not IndexedDB** — overkill for ≤200 KB drafts; sessionStorage's synchronous API is simpler.
4. **Per-key vs per-session-storage-bucket** — per-session-key (`consult-draft-{sessionId}`) so multiple parallel consults don't trample each other.
5. **Hydration of `replyTo.body`** — at restore time, the original parent message might have been edited or deleted. The banner shows the body AS IT WAS WHEN SAVED; on send, the new INSERT references `reply_to_id` and the actual parent's current state will render in the bubble. Acceptable inconsistency.
6. **SSR guard** — `typeof window === 'undefined'` early-return. Next.js will hydrate later.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.30](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Coordinates with:** [task-text-D2](./task-text-D2-multi-tab-kick.md) (kicked tab leaves its draft recoverable on reopen).
- **Related:** [task-text-C6](./task-text-C6-hardware-keyboard-shortcuts.md) — `Esc` clears the composer; the cleared content survives in the draft for restore.

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done.
