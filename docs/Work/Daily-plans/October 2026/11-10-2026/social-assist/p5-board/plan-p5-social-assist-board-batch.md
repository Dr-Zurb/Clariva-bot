# Plan p5 — Social: board tools

## 12 Oct 2026 — Batch `social-assist` / `p5-board` (`soc-15..19`)

> **Status:** In progress. `soc-15` through `soc-18` landed 2026-10-12. Next is the phase 5 gate.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-5, DL-14, DL-16, DL-17, DL-18)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p4-analytics/`](../p4-analytics/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p5-social-assist-board.md`](./Tasks/EXECUTION-ORDER-p5-social-assist-board.md)

---

## Why this phase

The four columns exist. A long column is a narrow list, and the add bar sits above the board with a file picker beside a new title. This phase makes the columns usable when there are many cards. It does not add columns the doctor names. That is phase 6.

---

## Decision lock

Inherit DL-1…18. This phase uses DL-5 (a topic on any card, format from Chosen), DL-14 (no AI), DL-16 (filter and sort per column), DL-17 (expand, grouped by topic), DL-18 (add from the column).

---

## What already exists (inspected 2026-10-12)

- Content is `frontend/components/dashboard/social/SocialBoard.tsx`. Four fixed columns. A bar above them takes a title and an optional file. With a file, the card is created in Ready. Without one, it is created in Thoughts and ideas.
- Move is a select on the card. Posted cards are not on the board.
- The card record already stores `topic` on any column. The API accepts it. `SocialCardPanel.tsx` asks for format and topic only after the card leaves Thoughts and ideas. A thought shows “Move it to Chosen to set the format.”
- Schedule, Analytics, the page link, the visit count, and Use again are in the app from phases 3 and 4.
- Latest migration written for this program: `251_social_card_visits.sql`. This phase adds no migration.

---

## Scope Guard — DO NOT TOUCH

- Named columns. That is phase 6.
- Dragging a card. Move stays a select.
- Schedule, Analytics, the public booking page, `visit_page_links`, and the visit count.
- Insights, the DM reply, Integrations, and any Meta permission.
- AI, suggestion lines, and a Generate ideas button.
- This week, parked, and seasonal as their own controls.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-15`](./Tasks/task-soc-15-add-on-column.md) | Add a card from the column | M | Phase 4 |
| [`soc-16`](./Tasks/task-soc-16-topic-on-any-card.md) | A topic on any card | S | soc-15 |
| [`soc-17`](./Tasks/task-soc-17-filter-and-sort.md) | Filter and sort on each column | M | soc-16 |
| [`soc-18`](./Tasks/task-soc-18-expand-column.md) | Open a column wide | M | soc-17 |
| [`soc-19`](./Tasks/task-soc-19-phase-5-gate.md) | Phase 5 gate | M | soc-18 |

---

## Acceptance gate

- [x] The bar above the board is gone. **+** on a column adds a title in that column. **+** on Ready asks for the file. — 2026-10-15
- [x] A thought can take a topic. The thought has no format field. Format is chosen when the card leaves Chosen. — 2026-10-15
- [x] Each column has its own tag filter and its own sort. Latest, then A to Z. Filtering Thoughts does not hide a card in another column. — 2026-10-15
- [x] Expand opens that column over the board, grouped by topic, using that column’s filter and sort. Close returns to the four columns. — 2026-10-15
- [x] There is no AI button and no new column control. — 2026-10-15
- [x] This walk edited no code. Lint and the board tests were already green on `soc-18`. — 2026-10-15
