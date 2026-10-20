# Plan p7 — Social: the week

## 13 Oct 2026 — Batch `social-assist` / `p7-week` (`soc-23..24`)

> **Status:** First version of the week is in `SocialSchedule.tsx`. Next is the signed-in walk (`soc-24`).
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-8, DL-13)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p3-schedule/`](../p3-schedule/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p7-social-assist-week.md`](./Tasks/EXECUTION-ORDER-p7-social-assist-week.md)

---

## Why this phase

Phase 3 stored a time and listed those cards down the page. A clinic week is easier as seven days you can see at once. The time still means “this post goes out then.” This phase draws that week. It does not send the file.

---

## Decision lock

Inherit DL-1…18. This phase uses DL-8 (the week of timed Ready cards) and DL-13 (no Instagram call here). The sender is the next phase, on a test account. The review already in progress stays basic and messages.

---

## What already exists (inspected 2026-10-13)

- A Ready card with a file can store `scheduledAt`. Clearing it returns the card to Ready. Leaving Ready clears the time and keeps the file.
- `SocialSchedule.tsx` grouped every timed card into a scrolling day list. A day with no card was absent. The empty line was “Nothing is timed.”
- Opening a row jumped back to Content and opened that card.
- Posted cards are not on Schedule. A Ready card with no time is not on Schedule.
- No content-publishing call exists in the card service.

---

## Scope Guard — DO NOT TOUCH

- Any call that publishes a file to Instagram.
- The Meta review already in progress.
- The Ready card’s time field. Schedule does not become the editor.
- An hour grid, a media grid, a list toggle, empty “+ New” slots, tags, and a weekly send count.
- Analytics, the page link, and the visit count.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-23`](./Tasks/task-soc-23-week-calendar.md) | The week of timed cards | M | Phase 3 |
| [`soc-24`](./Tasks/task-soc-24-phase-7-gate.md) | Phase 7 gate | S | soc-23 |

---

## Acceptance gate

- [x] Schedule opens on the week that contains today. Previous and Today move that week. — 2026-10-15
- [x] A Ready card with a time shows on that day, with the time, the format, and the title. — 2026-10-15
- [x] There is no “+ New” slot. Clearing a time removes the chip and leaves the day. — 2026-10-15
- [x] Opening a chip opens that card. — 2026-10-15
- [x] A posted card is not on the week. — 2026-10-15
- [x] Nothing is sent to Instagram. — 2026-10-15
- [x] This walk edited no code. The schedule tests were already green on `soc-23`. — 2026-10-15
