# Plan p3 — Social: the schedule

## 11 Oct 2026 — Batch `social-assist` / `p3-schedule` (`soc-07..09`)

> **Status:** Gate recorded 2026-10-11. Run migration `248_social_card_time.sql` if you have not.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-8, DL-13)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p2-content/`](../p2-content/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-social-assist-schedule.md`](./Tasks/EXECUTION-ORDER-p3-social-assist-schedule.md)

---

## Why this phase

A Ready card can take a time. Schedule is the list of those cards by day. Halo Aid stores the time. It does not publish. The doctor posts from the phone.

The durable card code and the visit count are Phase 4. Until then, the first comment can show the public page `/d/:slug` with no card code, and the visit count stays absent.

---

## Decision lock

Inherit DL-1…15. This phase uses DL-8 only for the time exit, and DL-13 (no Instagram publish call). The paste-URL exit is Phase 4.

---

## What already exists (inspected 2026-10-11)

- Phase 2 leaves a Ready card with a file and words.
- The public page is `/d/:slug` (`frontend/app/d/[slug]/page.tsx`). `doctor_settings.public_slug` exists (`241_doctor_settings_public_slug.sql`).
- `visit_page_links` (`245`) expire in one hour and belong to a conversation. Do not use them here.
- No content-publishing permission is in the Meta review submitted 8 Oct 2026.

---

## Scope Guard — DO NOT TOUCH

- Any call that publishes a file to Instagram.
- The paste-URL exit, the Analytics list, and the visit count (`soc-10`…`soc-14`).
- Empty future slots, a Drafts / Approvals / Sent row, and a weekly category schedule.
- The DM reply and Integrations.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-07`](./Tasks/task-soc-07-ready-time.md) | A time on a Ready card | M | Phase 2 |
| [`soc-08`](./Tasks/task-soc-08-schedule-list.md) | Schedule list by day | M | soc-07 |
| [`soc-09`](./Tasks/task-soc-09-phase-3-gate.md) | Phase 3 gate | S | soc-08 |

---

## Acceptance gate

- [x] A Ready card with a file can take a time and then appears on Schedule under that day. (2026-10-11)
- [x] A card without a file cannot take a time. (2026-10-11)
- [x] Nothing is sent to Instagram. The card tells the doctor to post from the phone at that time. (2026-10-11)
- [x] Clearing the time returns the card to Ready. (2026-10-11)
- [x] Analytics is still empty. (2026-10-11)
- [x] Typecheck, lint, and the new tests for this phase are green. (2026-10-11)
