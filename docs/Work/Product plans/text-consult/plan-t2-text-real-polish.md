# Text T2 — Real polish (8 items, ~5 days)

## Reactions, replies, edits, formatting — pull the chat from "MVP" to "feels like a real chat"

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T2 is the second slice; assumes T1 has shipped.
>
> **Foundation:** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) and [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — T2 introduces small additive schema changes that compose with both.

---

## Goal

Ship eight chat features that move the surface from "you can send messages" to "you can have a structured conversation". Every item is implemented in a way that respects Decision 5 LOCKED (live-only writes) and Plan 07's `mode='readonly'` (none of the mutation actions render in readonly).

This tier introduces **the only schema work** in the entire text-consult roadmap outside T5 telemetry: one new table (`consultation_message_reactions`) plus four additive nullable columns on `consultation_messages` (`edited_at`, `deleted_at`, `pinned_at`, `pinned_by`, `reply_to_id`).

---

## Status

`Drafted` — pre-approved by owner; **all 8 items SELECTED 2026-04-28** for the implementation batch tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md). See that file for sub-batch sequencing (T2 maps to Sub-batch B — the only schema slice in the frontend half of the batch).

---

## What's in scope (8 items)

> All 8 items below are marked **`[SELECTED 2026-04-28]`** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for sequencing into Sub-batch B (one migration, then 8 frontend items).

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| T2.9 | **`[SELECTED 2026-04-28]`** **Message reactions.** Quick reactions (👍 / ❤️ / ✓ / ❓ / 😮) on any non-system message. Long-press / right-click → picker; tap an existing reaction to add yours / remove. Aggregated count badge per emoji. | M (~6h) | New `consultation_message_reactions` table + RLS; new `<ReactionPicker>` component; `MessageBubble.tsx` extract; Plan 06 system kind `'reaction_added'` (optional, for audit). |
| T2.10 | **`[SELECTED 2026-04-28]`** **Reply-to-message.** Tap a message → "Reply" → composer shows a quoted preview of the parent + a "✕" to cancel. Sent reply renders with the inline-quoted parent (one-level only — no nested threading). | M (~6h) | `consultation_messages.reply_to_id` column; `<MessageBubble>` quoted-parent render; composer reply-affordance; tap-on-quote scrolls to parent. |
| T2.11 | **`[SELECTED 2026-04-28]`** **Edit window (60 s).** Sender can edit own message within 60 s of original send. Edited bubble shows a small "edited" tag + tooltip with original time. Backend RLS allows UPDATE on own row WHERE `created_at >= now() - interval '60 seconds'` AND session is live. | M (~6h) | `consultation_messages.edited_at` column; new RLS policy `consultation_messages_update_recent`; composer edit-mode UI; `<MessageBubble>` edited tag. |
| T2.12 | **`[SELECTED 2026-04-28]`** **Soft-delete a message.** Sender can delete own message within the same 60 s window. UI replaces with a placeholder "(deleted by Dr. X)". Body stays in DB (audit trail) but is null in the wire response (RLS column-level filter via view). | S (~4h) | `consultation_messages.deleted_at` column; new view `consultation_messages_view` that nulls `body` when `deleted_at IS NOT NULL`; same 60s RLS UPDATE policy. |
| T2.13 | **`[SELECTED 2026-04-28]`** **Markdown-lite rendering.** Allow-list of: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, bullet lists, and auto-link plain URLs. NO headings, NO images-by-URL, NO HTML, NO blockquotes. Strict allow-list = no XSS surface. | M (~5h) | New `frontend/lib/text/markdown-lite.ts` (no marked / no DOMPurify dep — hand-rolled allow-list); `<MessageBubble>` body render; composer toolbar optional (Slack-style). |
| T2.14 | **`[SELECTED 2026-04-28]`** **Pinned messages.** Doctor can pin up to 3 messages (e.g. "take this medicine 2× daily" / "follow up in 7 days"). Pinned messages render at the top in a collapsed banner ("3 pinned messages — show"). Patient can read; only doctor can pin/unpin. | M (~5h) | `consultation_messages.pinned_at` + `pinned_by` columns; new RLS policy `consultation_messages_pin_doctor_only`; `<PinnedMessagesBanner>` component. |
| T2.15 | **`[SELECTED 2026-04-28]`** **Multi-attachment composer.** Today the picker is one-file-at-a-time and the bubble is one-attachment-per-message. Allow up to 5 attachments per message with thumbnails in the composer + a single send. | M (~5h) | `consultation_messages.attachment_url` becomes optional list (or follow Plan 06's existing scheme — one row per attachment but tagged with a `batch_id` so the UI groups them). Decision needed (see open questions). |
| T2.17 | **`[SELECTED 2026-04-28]`** **Drag-and-drop attachment on desktop.** Drop an image / PDF anywhere on the chat surface → opens the attachment-pending preview (T2.15 multi-attach UI). Mobile is unaffected (existing camera + gallery picker). | S (~3h) | `TextConsultRoom.tsx` outer drop zone; reuses existing attachment validation pipeline. |

T2.16 is intentionally absent — voice notes were considered and explicitly killed in Plan 06's audio-MIME exclusion (no audio in the allowlist). Re-introducing them is a Decision change, not a tier item.

---

## Non-goals (explicitly NOT in T2 — owned by later tiers)

- **AI-suggested replies / templates / summaries** — T3 items.
- **Post-chat summary / rating / PDF export** — T4 items.
- **Multi-tab kick / push / virtualization** — T5 items.
- **Swipe gestures / long-press behaviours on mobile (the picker uses long-press as ONE input method, but the polished swipe-to-reply gesture is T6)** — T6 items.
- **Voice notes / audio recordings** — explicitly out of scope (Plan 06 / migration 082 LOCKED no audio MIMEs).
- **Threading > 1 level deep** — explicitly out of scope (medical chats benefit from a flat narrative; nested threads fragment context).
- **Reaction emoji customisation** — fixed allow-list of 5 emojis. Custom emoji surfaces add moderation surface; not warranted.

---

## Schema deliverable (lands in one migration)

```sql
-- Migration 0XX — Text T2 chat polish (reactions / reply / edit / delete / pin)

-- 1. Reactions table.
CREATE TABLE consultation_message_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES consultation_messages(id) ON DELETE CASCADE,
  reactor_id  UUID NOT NULL,
  reactor_role TEXT NOT NULL CHECK (reactor_role IN ('doctor', 'patient')),
  emoji       TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '✓', '❓', '😮')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reactor_id, emoji)   -- one reactor can't double-react with same emoji
);

CREATE INDEX consultation_message_reactions_message_id_idx
  ON consultation_message_reactions(message_id);

-- RLS — same shape as consultation_messages: doctor-branch keys on
-- auth.uid()=doctor_id (via session join); patient-branch keys on
-- the custom-claim JWT. Live-only writes (Decision 5 LOCKED).

-- 2. Reply-to + edit + delete + pin columns on consultation_messages.
ALTER TABLE consultation_messages
  ADD COLUMN reply_to_id UUID REFERENCES consultation_messages(id) ON DELETE SET NULL,
  ADD COLUMN edited_at   TIMESTAMPTZ,
  ADD COLUMN deleted_at  TIMESTAMPTZ,
  ADD COLUMN pinned_at   TIMESTAMPTZ,
  ADD COLUMN pinned_by   UUID;

CREATE INDEX consultation_messages_reply_to_id_idx
  ON consultation_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE INDEX consultation_messages_pinned_at_idx
  ON consultation_messages(session_id, pinned_at) WHERE pinned_at IS NOT NULL;

-- 3. View that nulls body for soft-deleted rows (T2.12).
CREATE OR REPLACE VIEW consultation_messages_view AS
SELECT
  id, session_id, sender_id, sender_role, created_at,
  CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE body END AS body,
  kind, attachment_url, attachment_mime_type, attachment_byte_size,
  system_event, reply_to_id, edited_at, deleted_at, pinned_at, pinned_by
FROM consultation_messages;

-- Update <TextConsultRoom> to read from the view (the optimistic-INSERT
-- bubble is unchanged — it already has the body locally).

-- 4. RLS additions.

CREATE POLICY consultation_messages_update_recent ON consultation_messages
  FOR UPDATE
  USING (
    sender_id = (CASE
      WHEN auth.role() = 'authenticated' THEN auth.uid()
      ELSE (auth.jwt() ->> 'sub')::TEXT
    END)::UUID
    AND created_at >= now() - interval '60 seconds'
    AND deleted_at IS NULL                           -- can't edit a deleted msg
    AND EXISTS (                                     -- session must still be live
      SELECT 1 FROM consultation_sessions s
      WHERE s.id = consultation_messages.session_id
        AND s.status = 'live'
    )
  )
  WITH CHECK (sender_id = (CASE ... END)::UUID);

CREATE POLICY consultation_messages_pin_doctor_only ON consultation_messages
  FOR UPDATE
  USING (
    auth.uid() = (
      SELECT doctor_id FROM consultation_sessions
      WHERE id = consultation_messages.session_id
    )
  )
  WITH CHECK (
    -- Only the pin columns may move.
    edited_at IS NOT DISTINCT FROM OLD.edited_at AND
    deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND
    body IS NOT DISTINCT FROM OLD.body
  );
```

All columns are **additive nullable** — Plan 04 + Plan 06 + Plan 07 rows render with zero of them populated and behave exactly as before.

---

## Implementation contract per item (key items)

### T2.9 — Reactions

```ts
// frontend/components/consultation/ReactionPicker.tsx (NEW)
//
// Trigger: long-press (mobile) / right-click (desktop) on a message bubble.
// Picker: row of 5 emojis above the bubble.
// Tap → INSERT into consultation_message_reactions; Realtime broadcast
// to both sides; aggregated count badge re-renders.
//
// Existing reactions:
//   - One badge per emoji with count: "👍 2"
//   - Tap own emoji → DELETE.
//   - Tap others' emoji (where you haven't reacted with it yet) → INSERT.
//
// Subscribe via the same Realtime channel using a second filter:
//   client.channel(`reactions:${sessionId}`)
//     .on('postgres_changes', { event: '*', schema: 'public',
//          table: 'consultation_message_reactions',
//          filter: `message_id=in.(${messageIds.join(',')})` }, handler)
```

### T2.10 — Reply-to-message

```ts
// In MessageBubble.tsx:
//   if (message.reply_to_id) {
//     const parent = messages.find(m => m.id === message.reply_to_id);
//     <QuotedParentPreview message={parent ?? null} onClick={scrollToParent} />
//   }
//
// Composer reply-affordance:
//   - Tap "Reply" on a bubble → set composerReplyTo = message.
//   - Composer shows a small preview row above the textarea with the
//     parent body truncated + "✕" to cancel.
//   - Send INSERT carries `reply_to_id = composerReplyTo.id`.
//
// scrollToParent: scroll the parent bubble into view + add a 1.5s
// highlight class (border-blue-300 fading out).
```

### T2.11 + T2.12 — Edit / soft-delete (combined)

```ts
// Sender-side composer enters "edit mode" or "delete confirm" via a
// per-bubble overflow menu (•••).
//
// Time-window enforcement:
//   - Frontend: hide the menu items when message.created_at + 60s < now.
//     Re-render once a second using a ticker so the menu auto-hides as
//     time runs out.
//   - Backend: RLS policy enforces the same window — defense in depth.
//
// Edit:
//   - Replace bubble body with an inline textarea + Save / Cancel.
//   - Save → UPDATE consultation_messages SET body=$1, edited_at=now()
//     WHERE id=$2.
//   - Realtime UPDATE event re-renders both sides; bubble shows "edited"
//     tag + tooltip with original time.
//
// Delete:
//   - Confirm modal: "Delete this message?"
//   - Confirm → UPDATE consultation_messages SET deleted_at=now()
//     WHERE id=$1.
//   - Both sides re-render the bubble as "(deleted by Dr. Sharma)".
//   - Reactions on a deleted message: keep the row (audit) but hide the
//     reaction badges in the UI.
```

### T2.13 — Markdown-lite

```ts
// frontend/lib/text/markdown-lite.ts (NEW)
//
// Strict allow-list — NO marked / NO DOMPurify dependency. ~80 lines:
//   - Tokenize: split on whitespace, then run each token against patterns.
//   - Inline patterns (no nesting, no fancy parsing):
//       **text**     → <strong>text</strong>
//       *text*       → <em>text</em>
//       `text`       → <code>text</code>
//       ~~text~~     → <s>text</s>
//       https?://... → <a href={url} target="_blank" rel="noopener">{url}</a>
//   - Block patterns:
//       Lines starting with "- " or "• " → <ul><li>…</li></ul>
//   - Everything else: text-escape.
//
// Returns React elements directly (no innerHTML / dangerouslySetInnerHTML).
// XSS-safe by construction; no need for sanitisation.
//
// Composer-side: optional toolbar (Slack-style — B / I / Code / Link /
// List buttons) wraps selection or inserts at cursor. Toolbar is hidden
// in `panel` and `canvas` layouts (limited width); only `standalone`
// shows it.
```

### T2.14 — Pinned messages

```tsx
// <PinnedMessagesBanner> (NEW)
//
// Renders above the message list when any pinned message exists.
// Collapsed default: "📌 3 pinned messages [show]".
// Expanded: list of 3 with truncated body + jump-to-message on tap.
//
// Doctor-only "Pin" / "Unpin" action in the per-bubble overflow menu.
// 3-pin cap enforced UI-side (disable Pin when count = 3 with tooltip);
// no DB constraint (cap is a product choice, not a data integrity rule).
```

### T2.15 — Multi-attachment composer

```
DECISION REQUIRED before commit: schema shape for multi-attach.
Options:
  (a) One consultation_messages row per attachment, all sharing a `batch_id`
      column. Render groups by batch_id. PRO: keeps existing single-attachment
      shape; minimal migration. CON: composer transactionally inserts N rows.
  (b) A new `consultation_message_attachments` child table FK'd to a parent
      message row. PRO: cleaner conceptually. CON: Plan 06's existing
      attachment-on-message-row contract has to be migrated.

Recommendation: (a). Keeps Plan 06 contract; migration adds one nullable
`batch_id` column. The existing single-attachment path naturally has
`batch_id = NULL`.
```

### T2.17 — Drag-and-drop attachment

```ts
// In TextConsultRoom.tsx outer container:
//   onDragOver: e.preventDefault() + show drop overlay
//   onDragLeave: hide drop overlay
//   onDrop: extract files from e.dataTransfer.files,
//           pipe into the existing T2.15 attachment-validate pipeline.
//
// Drop overlay: full-surface backdrop with "Drop files here · max 5 ·
// max 10 MB each" copy.
//
// Standalone + canvas layouts only; panel layout's narrow width makes the
// drop target ambiguous (could be confused with the parent video room).
```

---

## Acceptance criteria

- [ ] **T2.9** — reactions add / remove within 1 s; survive a reconnect; survive a hard reload (initial-fetch hydrates them).
- [ ] **T2.10** — reply preview renders correctly; tap-on-quote scrolls + highlights the parent; deleted parent (T2.12) renders as "(deleted message)" preview without crashing.
- [ ] **T2.11** — edit only allowed within 60 s; RLS rejects backend attempts outside the window; "edited" tag visible to both sides.
- [ ] **T2.12** — delete only allowed within 60 s; deleted body never reaches the wire on subsequent fetches (view nulls it); existing reactions hide cleanly.
- [ ] **T2.13** — markdown-lite renders the 5 inline + 1 block pattern; pasting `<script>` into a bubble renders as literal text; markdown is OFF inside `kind='attachment'` and `kind='system'` rows.
- [ ] **T2.14** — doctor can pin / unpin within 1 s; 3-message cap enforced; banner collapsed default; tap-on-pinned scrolls + highlights.
- [ ] **T2.15** — multi-attach batches render as a grouped bubble; each attachment retains its own download / preview affordance.
- [ ] **T2.17** — drag-and-drop on desktop works in Chrome / Firefox / Safari; mobile unaffected.
- [ ] All items respect `mode='readonly'` (no compose / mutate affordances visible).
- [ ] Live-only invariant: after session ends, all mutations rejected by RLS; UI renders the existing "session ended" composer-disabled state.
- [ ] Migration is reversible (down migration drops the new view first, then the columns and table).
- [ ] Frontend type-check + lint clean. Backend type-check + lint clean. Migration runs cleanly against an empty DB AND against a DB with existing Plan-04 / Plan-06 rows.
- [ ] Manual smoke: doctor + patient on different devices for a 10-min chat exercises every T2 item without hitting a console error.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend**) — message-list render now consumes `<MessageBubble>` and `<PinnedMessagesBanner>`.
- `frontend/components/consultation/MessageBubble.tsx` (**new** — extracted from inline JSX so reactions/reply/edit/delete have a coherent host).
- `frontend/components/consultation/ReactionPicker.tsx` (**new**, T2.9).
- `frontend/components/consultation/PinnedMessagesBanner.tsx` (**new**, T2.14).
- `frontend/components/consultation/QuotedParentPreview.tsx` (**new**, T2.10).
- `frontend/lib/text/markdown-lite.ts` (**new**, T2.13).

**Backend:**

- `backend/migrations/0XX_text_t2_chat_polish.sql` (**new**) — single migration for all T2 schema work.

**No DM-copy changes. No new vendor.**

---

## Open questions / decisions for during implementation

1. **Reactions emoji set** (T2.9) — current proposal: 👍 / ❤️ / ✓ / ❓ / 😮. Alternatives: ❤️‍🩹 (medical-themed), ⚠️ (warning), 🙏 (thanks). Recommendation: stay with the 5 above; expand only if doctors ask.
2. **Edit window length** (T2.11) — 60 s like Slack, or 5 min like Telegram? Recommendation: 60 s — clinical record immutability matters; longer windows raise audit-trail concerns.
3. **Delete-ability of attachments** (T2.12) — does T2.12's soft-delete also revoke the signed URL for an attachment? Recommendation: yes — body nulled in the view AND the storage object becomes inaccessible (delete the row, keep the file for audit but make it 404 to clients without service-role).
4. **Multi-attach schema shape** (T2.15) — option (a) batch_id vs option (b) child table. Recommendation: (a). See T2.15 contract above.
5. **Pinned messages cap** (T2.14) — 3, 5, or unlimited? Recommendation: 3. Pinned banner stays compact; doctors who want more can demote older pins.
6. **Markdown render in `panel` / `canvas`** (T2.13) — render markdown but hide the composer toolbar in narrow layouts? Recommendation: yes — render is free, toolbar needs space.
7. **Reactions on system messages** (T2.9) — should reactions be allowed on `kind='system'` rows (consult-started banner, recording-paused, etc.)? Recommendation: no — system rows are informational, reactions add noise.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) — `consultation_messages` table this tier extends.
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — attachment + system-message contracts.
- [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — `mode='readonly'` invariant T2 must respect.
- [Voice T2 — Real polish](../voice-consult/plan-t2-voice-real-polish.md) — symmetry reference.
- Supabase Realtime — `postgres_changes` filter for the reactions subscription (T2.9).

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; **all 8 items SELECTED 2026-04-28** — implementation tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) (Sub-batch B; one migration `0XX_text_t2_chat_polish.sql` lands first, then 8 frontend items).
