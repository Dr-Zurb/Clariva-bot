# Task text-B8: Multi-attachment composer (up to 5 per send; `batch_id`-grouped; thumbnails)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today the composer supports one attachment per send (Plan F06's attachment path). Doctors and patients in real consultations regularly want to send 3–5 photos / lab PDFs together — current UX forces 5 sequential single-send attachments, each producing a separate bubble. Confusing.

This task lets the composer queue up to 5 attachments before send. On send, each attachment INSERTs as its own row but all share the same `batch_id` UUID. The render side groups consecutive bubbles with the same `batch_id` into a single visual cluster (e.g. a 2x3 grid of thumbnails) with the optional caption (the composer's text body) attached to the first bubble in the batch.

`batch_id` column ships in B1.

**Estimated time:** ~5 hours.

**Status:** Done (2026-05-23).

**Depends on:**
- [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) — hard. `batch_id` column ships there.
- [task-text-B2](./task-text-B2-message-bubble-extract.md) — hard. Grouped render lives in `<MessageBubble>` (or a new sibling `<MessageBatch>` component).

**Soft-blocks:** [task-text-B9](./task-text-B9-drag-and-drop-attachment.md) (drag-and-drop drops files into the same composer queue).

**Source plan:** [T2 §T2.15](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

### Composer-side

- [x] **`composerAttachments: ComposerAttachment[]` state** in `<TextConsultRoom>`:
  ```ts
  interface ComposerAttachment {
    localId: string;                  // for keying / removal
    file: File;                       // the raw selected file
    previewUrl: string;               // URL.createObjectURL(file) for thumbnail
    mime: 'image/*' | 'application/pdf';
    sizeBytes: number;
  }
  ```
  Capped at 5; appending a 6th drops the first (or shows a toast — pick one; recommendation: toast `Maximum 5 attachments per send.`).
- [x] **Attachment-picker handler** — current single-file path becomes `Array.from(e.target.files).slice(0, 5 - composerAttachments.length).forEach(addAttachment)`. Reuse the existing 10MB / image+PDF MIME guards.
- [x] **Composer attachments preview row** — above the textarea, horizontal scroll if needed, each thumbnail with a × remove button:
  ```tsx
  <div className="flex gap-2 overflow-x-auto pb-2">
    {composerAttachments.map(a => (
      <div key={a.localId} className="relative w-16 h-16 flex-shrink-0">
        {a.mime.startsWith('image/') ? (
          <img src={a.previewUrl} className="w-full h-full object-cover rounded" />
        ) : (
          <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">📄</div>
        )}
        <button
          type="button"
          onClick={() => removeAttachment(a.localId)}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs"
          aria-label="Remove attachment"
        >×</button>
      </div>
    ))}
  </div>
  ```
- [x] **`URL.revokeObjectURL`** on remove (and on send) to prevent memory leaks. Also revoke on unmount.

### Send-side

- [x] **Multi-attachment send flow** in the existing send helper:
  ```ts
  async function sendComposer() {
    const batchId = composerAttachments.length > 0 ? crypto.randomUUID() : null;
    const text = composerBody.trim();

    if (composerAttachments.length === 0) {
      // existing text-only path
      return existingTextSend(text);
    }

    // 1. Upload each file in parallel to consultation-attachments/{session_id}/{uuid}.{ext}
    const uploaded = await Promise.all(
      composerAttachments.map(uploadAttachment), // returns { attachmentId, mime, sizeBytes }
    );

    // 2. INSERT one row per attachment with same batch_id; first row carries the text body
    await Promise.all(
      uploaded.map((u, i) =>
        supabase.from('consultation_messages').insert({
          session_id: sessionId,
          sender_id: currentUserId,
          sender_role: currentUserRole,
          kind: 'attachment',
          body: i === 0 ? text || null : null,        // caption only on first
          attachment_id: u.attachmentId,
          batch_id: batchId,
        })
      )
    );

    setComposerAttachments([]);
    setComposerBody('');
  }
  ```
- [x] **Atomic-ish upload** — if any upload fails, revert: delete already-uploaded files from Storage, surface an error toast, keep the composer state intact so the user can retry. (Strict atomicity isn't possible without a server-side endpoint; best-effort is acceptable for v1.)
- [x] **Optimistic local insert** — push placeholder bubbles into local state with `pending: true` flag before the real INSERT settles, same pattern as text-only sends. Reconcile on Realtime INSERT.

### Render-side

- [x] **Grouped render** — modify the message-list `.map` (in `<TextConsultRoom>` or extracted into a small grouping helper) to walk the messages and emit either a single bubble or a batch group:
  ```ts
  function groupMessages(messages: ConsultationMessage[]): MessageGroup[] {
    // Group consecutive messages by (sender_id, batch_id) when batch_id is non-null.
    // Each group renders as a <MessageBatch> if length > 1, else a single <MessageBubble>.
  }
  ```
- [x] **`<MessageBatch>` component** — `frontend/components/consultation/MessageBatch.tsx`:
  - Renders the caption (first message's `body`) above a thumbnail grid.
  - 2-column grid for 2–4 attachments; 3-column for 5.
  - Each thumbnail tappable → opens lightbox (C2 wires this; for now, individual thumbnails open the existing single-attachment viewer).
  - Reactions (B5) + reply (B4) target the FIRST message in the batch (the one with the caption); pin (B7) similarly.
- [x] **Single-attachment messages** (no `batch_id`) render as today through `<MessageBubble>`.
- [x] **Three-host parity** — composer + render work in `standalone` / `panel` / `canvas`. `canvas` (narrow) can wrap to 1-column thumbnails for 2+ attachments; document the breakpoint.
- [x] **`mode='readonly'`** — composer hidden; render still groups attachments (history view).
- [x] **Type extensions** — `ConsultationMessage` gets optional `batch_id?: string`. Adapter (`text-session-supabase.ts`) maps the new column.
- [x] Frontend type-check + lint clean. Manual smoke: select 3 photos + type "Lab results"; send; both windows show one cluster with caption + 3 thumbnails; tap a thumbnail → opens current viewer.

---

## Out of scope

- **More than 5 per send.** UX cap; the DB allows arbitrary `batch_id` group sizes, but we limit composer-side.
- **Mixed image+PDF batches.** Allowed (the cap is on count, not type); render handles both. No special UI for "this is a PDF batch".
- **Batch-level edit/delete.** Edit applies to the caption only (B6); delete operates per-message (deleting a single attachment in the batch leaves the others). A "delete entire batch" affordance is out of scope.
- **Reordering thumbnails before send.** Out of scope; users can remove + re-add.
- **Drag-and-drop.** B9 owns; this task supports it implicitly via `addAttachment`-on-drop wiring at B9 time.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/MessageBatch.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (composer attachments state; preview row; multi-upload send flow; group-render helper).
- `frontend/lib/text/group-messages.ts` — **new** (~30 LOC + 30 LOC test; pure function).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (no major change; ensure single-attachment render still works untouched when not in a batch).
- `frontend/lib/text/types.ts` — **edit** (add optional `batch_id` to `ConsultationMessage`).
- `frontend/lib/text/text-session-supabase.ts` — **edit** (map `batch_id` column on row reads).

**No backend, no schema** (B1 ships the column).

---

## Notes / open decisions

1. **`batch_id` on a single-attachment send** — recommendation: NULL it. The render-side grouper only kicks in for `batch_id !== null` AND `length > 1`. Consistency: single-attachment sends don't carry a batch_id; only multi-attachment sends do.
2. **Caption-on-first-only** — alternative: caption on a separate `kind='text'` row that precedes the batch. Rejected because it complicates the grouping (a batch is then "1 text + N attachments" instead of "N attachments where the first has body"). Caption-on-first is simpler.
3. **Upload parallelism** — `Promise.all` is fine for ≤5; no need to throttle.
4. **Failure isolation** — if 4/5 uploads succeed and 1 fails, current "delete-all + revert" is the safe choice. A future iteration could allow partial sends; v1 keeps it atomic.
5. **`crypto.randomUUID()`** — ES2021+; supported in all modern browsers. Polyfill if support targets are older (search `randomUUID` usages in the project to verify).
6. **Realtime INSERT order** — Realtime INSERTs may arrive out-of-order across the 5 inserts; the grouper relies on `batch_id` matching, not arrival order, so this is fine. Visual order within a batch follows `created_at` ASC.
7. **Lightbox integration** — C2 (image lightbox) wires the thumbnail tap to open all batch images with prev/next navigation. For now, fall back to the existing single-attachment viewer; document the integration point.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.15](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Schema dep:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) (`batch_id` column).
- **Render dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md).
- **Soft-blocks:** [task-text-B9](./task-text-B9-drag-and-drop-attachment.md), [task-text-C2](./task-text-C2-image-lightbox.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
