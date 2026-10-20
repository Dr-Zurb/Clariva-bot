# Plan p6 — Social: card drag

## 12 Oct 2026 — Batch `social-assist` / `p6-columns` (`soc-20..22`)

> **Status:** Card drag landed 2026-10-12. The board shows the four columns only. Next is the signed-in drag walk (`soc-22`).
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-3, DL-4, DL-7, DL-12, DL-14)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p5-board/`](../p5-board/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p6-social-assist-columns.md`](./Tasks/EXECUTION-ORDER-p6-social-assist-columns.md)

---

## Why this phase

Phase 5 makes the four columns usable when they are full. This phase lets the doctor drag a card along Thoughts and ideas, Chosen, Making, and Ready. The columns stay fixed. A topic stays a tag.

---

## Decision lock

Inherit DL-1…18. This phase uses DL-3 (four fixed columns, cards drag), DL-12 (dragging is the approval), DL-7 (only Ready holds the file), DL-14 (no AI).

---

## What already exists (inspected 2026-10-12)

- A card’s place is one of thoughts, chosen, making, ready, or posted. Posted is off the board. Ready requires a file. A time requires Ready and a file. Leaving Ready clears the file and the time.
- The board’s columns are the four opening columns in `SocialBoard.tsx`. Phase 5 adds **+**, a topic on any card, a per-column filter and sort, and expand.
- A card drags between those four. The card editor can make the same move. The board does not add, rename, or reorder columns. Revised 12 Oct 2026, evening.
- Latest migration written: `251_social_card_visits.sql`. Ignore duplicate `* N.sql` files. Read the numbered sequence before adding the next migration.
- Deleting the doctor’s account already deletes their cards.

---

## Scope Guard — DO NOT TOUCH

- The public booking page, the visit count, and `visit_page_links`.
- Schedule’s meaning: Ready cards that have a time. Analytics’ meaning: posted cards.
- Adding, renaming, or dragging a column.
- AI.
- Insights, the DM reply, Integrations, and any Meta permission.
- This week, parked, and seasonal as built-in columns.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-20`](./Tasks/task-soc-20-column-record.md) | A column the doctor owns | L | Phase 5 |
| [`soc-21`](./Tasks/task-soc-21-named-column.md) | Add, rename, and remove a column | M | soc-20 |
| [`soc-22`](./Tasks/task-soc-22-phase-6-gate.md) | Phase 6 gate | M | soc-21 |

---

## Acceptance gate

- [x] The board still opens on Thoughts and ideas, Chosen, Making, and Ready. There is no control to add a column. — 2026-10-15
- [x] Dragging a card moves it to the column under the pointer. Refresh keeps that column. — 2026-10-15
- [x] A card with no file cannot land on Ready. The card stays where it was. — 2026-10-15
- [x] A click still opens the card. Filter, sort, and expand still work. — 2026-10-15
- [x] No AI. This walk edited no code. Lint and the board tests were already green on `soc-21`. — 2026-10-15
