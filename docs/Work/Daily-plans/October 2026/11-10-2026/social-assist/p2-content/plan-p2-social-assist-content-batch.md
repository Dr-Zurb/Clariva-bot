# Plan p2 — Social: the content board

## 11 Oct 2026 — Batch `social-assist` / `p2-content` (`soc-03..06`)

> **Status:** Gate recorded 2026-10-11. A logged-in dummy image still depends on migration 247.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-3…DL-7, DL-12, DL-14)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p1-shell/`](../p1-shell/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-social-assist-content.md`](./Tasks/EXECUTION-ORDER-p2-social-assist-content.md)

---

## Why this phase

Content is the board. A doctor writes a title, chooses it, makes the piece outside Halo Aid, and attaches the file. The columns are Thoughts and ideas, Chosen, Making, and Ready. No clock and no visit count yet.

---

## Decision lock

Inherit DL-1…15. This phase uses DL-3 (the four columns), DL-4 (a card can start in any column), DL-5 (format and topic tags on Chosen), DL-6 (format changes the words, not the columns), DL-7 (Ready means the file is on the card and it is not public), DL-12 (moving a card is the approval), DL-14 (no AI).

---

## What already exists (inspected 2026-10-11)

- Phase 1 ships an empty Content tab. There is no card store.
- Latest canonical migration inspected: `245_visit_page_links.sql`. Ignore the duplicate `* N.sql` files. Read the numbered sequence before adding the next migration.
- Doctor-scoped RLS is the existing pattern (see `doctor_settings` and COMPLIANCE.md).
- Visit documents and clinic branding already use storage. A marketing file is not a visit document and not a letterhead. Do not put it in those buckets.
- Routes mount from `backend/src/routes/api/v1/index.ts`. Controllers validate with Zod and call services. No `process.env` outside config.

---

## Scope Guard — DO NOT TOUCH

- A publish time, the Schedule list, an Instagram URL, a visit count, the public booking page.
- `visit_page_links`.
- Visit-document storage and the patient chart.
- Insights and the post funnel.
- Instagram connect, the DM reply, and any Meta permission.
- AI, suggestion lines, and reading visit counts onto a card.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-03`](./Tasks/task-soc-03-card-record.md) | Doctor-owned card record and API | L | Phase 1 |
| [`soc-04`](./Tasks/task-soc-04-content-board.md) | The four columns | M | soc-03 |
| [`soc-05`](./Tasks/task-soc-05-card-words-and-file.md) | Words by format, and the file on Ready | L | soc-04 |
| [`soc-06`](./Tasks/task-soc-06-phase-2-gate.md) | Phase 2 gate | M | soc-05 |

---

## Acceptance gate

- [x] A doctor adds a title in Thoughts and ideas, moves it to Chosen, sets Post or Reel or Story and a topic, and writes the words for that format. (2026-10-11)
- [x] Making means the file is not on the card yet. Ready means the file is on the card. The card is not public. (2026-10-11)
- [x] A card can be created straight into Ready when the file already exists. (2026-10-11)
- [x] Another doctor cannot read or change the card. Logs have no title that includes a patient name, and no file bytes. (2026-10-11)
- [x] There is no time, no Instagram URL, no visit count, and no AI button. (2026-10-11)
- [x] Typecheck, lint, and the new tests for this phase are green. (2026-10-11)
