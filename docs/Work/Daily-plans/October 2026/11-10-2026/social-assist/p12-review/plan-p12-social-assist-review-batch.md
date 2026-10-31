# Plan p12 — Social: the doctor reviews a cut

## 31 Oct 2026 — Batch `social-assist` / `p12-review` (`soc-31`…`35`)

> **Status:** Planned. Not started. Doctor side only.
> **Product note:** [`editor.md`](../../../../../Product%20plans/social-assist/editor.md)
> **Program:** [`../README.md`](../README.md) · Prior studio phase [`../p8-studio/`](../p8-studio/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p12-social-assist-review.md`](./Tasks/EXECUTION-ORDER-p12-social-assist-review.md)

Phases 9–11 stay the analytics plan. This phase does not take their numbers.

---

## Why this phase

A doctor who has an editor does not cut the video. They watch the file and say what to change: this stretch, shorten it, add this, add a clip. The editor does the cutting in their own tool.

This phase is that conversation on the Making card the doctor already has. The editor does not get a page, a link, or a login here.

---

## Decision lock

Inherit DL-1…26. This phase adds the following. Do not re-litigate the board.

| ID | Decision |
|---|---|
| **ED-1** | The card stays in Making. No new column. |
| **ED-2** | Halo Aid does not cut, trim, split, reorder, or write on the video. |
| **ED-3** | A message is one instruction. It may name one moment, or a start and an end, on the file in the player. |
| **ED-4** | A message may point at one file already on Resources. That file is a reference. It does not become the file that posts. |
| **ED-5** | The player shows the file under review. There is no row of takes. |
| **ED-6** | Resources stay the shelf already on the card. This phase does not copy them and does not hide any of them. The editor’s access to that shelf is the next phase. |
| **ED-7** | The note is not part of the handoff. A thought can name a patient. |
| **ED-8** | **Mark ready** is unchanged. It is still the doctor’s approval. |
| **ED-9** | No editor login, private link, email, or upload from outside the doctor’s session. |
| **ED-10** | The handoff clears when the card leaves Making. |

---

## What already exists (inspected 31 Oct 2026)

- Making opens the composer. The note and Resources are on the card. The phone, the caption, and **Mark ready** are on the preview side.
- Resources are the scraps already stored for that card: photos, videos, voice notes, and documents. The shelf is labeled Resources.
- A video over 100 MB is refused. This phase does not raise that cap and does not add a store.
- Latest social migration inspected: `267_social_card_make_at.sql`. Read the folder and take the next free number. Two files share `266`.
- `SocialCardPanel.tsx` is about 5,100 lines. Review is a new component.
- Desk staff are `clinic_staff`, one doctor, role receptionist. An editor is not that row.

---

## Scope Guard — DO NOT TOUCH

- Any call that publishes to Instagram.
- The editor’s page, a token, mail, and an account for that person.
- Video editing inside the player.
- A second list of takes under the player.
- Copying the note, or choosing a subset of Resources, onto the handoff.
- Ideas, Chosen, Ready, Schedule, and Analytics, except the Making badge and its filter.
- Phases 9–11.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-31`](./Tasks/task-soc-31-handoff.md) | Hand a Making card to a named editor | M | The card record |
| [`soc-32`](./Tasks/task-soc-32-review-message.md) | A message about a moment or a stretch | M | soc-31 |
| [`soc-33`](./Tasks/task-soc-33-review-screen.md) | Draft and Review | L | soc-31, soc-32 |
| [`soc-34`](./Tasks/task-soc-34-making-badge.md) | The Making badge | S | soc-31 |
| [`soc-35`](./Tasks/task-soc-35-phase-12-gate.md) | Phase 12 gate | S | soc-31…34 |

---

## Acceptance gate

- [ ] A Making card can be handed to a name. The note is not stored on that handoff.
- [ ] The doctor can send one instruction pinned to a moment, or to a start and an end, and can point it at one Resource. The file that posts does not change.
- [ ] Review shows the player and the thread. Draft stays the composer. **Mark ready** still moves a finished card the way it does today.
- [ ] The Making card shows who has it. Leaving Making clears the handoff.
- [ ] Nothing is sent to an editor, and nothing is sent to Instagram.
- [ ] The message text and the editor’s name are not logged.
