# Plan p4 — Social: analytics

## 11 Oct 2026 — Batch `social-assist` / `p4-analytics` (`soc-10..14`)

> **Status:** Gate recorded 2026-10-11. Run migration `251_social_card_visits.sql` if you have not. Logged-in booking and Use again are still the browser checks.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-8 paste exit, DL-9, DL-10, DL-11)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p3-schedule/`](../p3-schedule/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-social-assist-analytics.md`](./Tasks/EXECUTION-ORDER-p4-social-assist-analytics.md)

---

## Why this phase

A phone post comes home when the doctor pastes the Instagram URL. The card’s page link is `/d/:slug` plus a durable code, so a booking that started there counts as a visit. Use again copies the words back to Thoughts and ideas. Nothing republishes.

This is the only phase that touches the public booking page.

---

## Decision lock

Inherit DL-1…15. This phase uses DL-8 (the paste exit), DL-9 (the page link), DL-10 (visits only), DL-11 (use again). Reach, saves, and follows stay out. Clinic Insights stays the practice page.

---

## What already exists (inspected 2026-10-11)

- Public booking is `/d/:slug` via `frontend/app/d/[slug]/page.tsx` and `public-clinic-checkout-service`.
- `visit_page_links` (`245_visit_page_links.sql`) are one-hour codes tied to `conversation_id`. `findVisitPageLink` rejects an expired code. A card must not use this table.
- Clinic Insights post funnel (`post-conversion-analytics-service`) attributes comment leads to an Instagram media id. It does not count bookings from a card link. Leave it.
- Phase 3 can show `/d/:slug` with no card code.

---

## Scope Guard — DO NOT TOUCH

- `visit_page_links` rows and their one-hour expiry.
- The Insights post funnel and its media-id attribution.
- Instagram insights, reach, saves, follows, follower count.
- Reading the grid. Publishing a file.
- Copying a patient name, phone, age, or chart field onto the card.
- The DM reply.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-10`](./Tasks/task-soc-10-card-link.md) | Durable page link on the card | M | Phase 3 |
| [`soc-11`](./Tasks/task-soc-11-posted-list.md) | Paste the Instagram URL and list posted cards | M | soc-10 |
| [`soc-12`](./Tasks/task-soc-12-visit-count.md) | A booking from the card link counts one visit | L | soc-10 |
| [`soc-13`](./Tasks/task-soc-13-use-again.md) | Use again copies words back to Thoughts and ideas | S | soc-11 |
| [`soc-14`](./Tasks/task-soc-14-phase-4-gate.md) | Phase 4 gate | M | soc-12, soc-13 |

`soc-12` and `soc-13` do not depend on each other. The execution order runs them side by side after the link and the posted list exist.

---

## Acceptance gate

- [x] A Ready card that is timed, or a card the doctor marks posted, shows a page link of `/d/:slug` plus that card’s code. The code still works the next day. — 2026-10-11
- [x] Pasting an Instagram URL puts the card on Analytics and removes it from Schedule. — 2026-10-11
- [x] A dummy booking that starts from that link adds one to the visit count. A booking that does not start from the link does not. — 2026-10-11
- [x] The card has no patient name, phone, or id after that booking. — 2026-10-11
- [x] Use again creates a new card in Thoughts and ideas with the same words and tags, and does not copy the file, the URL, or the time. — 2026-10-11
- [x] Insights still shows its own post funnel. An expired chat code still expires. — 2026-10-11
- [x] Typecheck, lint, and the new tests for this phase are green. — 2026-10-11
