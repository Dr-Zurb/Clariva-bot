# Plan p8 — Social: the studio

## 15 Oct 2026 — Batch `social-assist` / `p8-studio` (`soc-25..30`)

> **Status:** Gate recorded 2026-10-15. A signed-in walk took one dummy card from a thought to a time. Nothing was sent.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-19…26)
> **Program:** [`../README.md`](../README.md) · Prior phase [`../p7-week/`](../p7-week/)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p8-social-assist-studio.md`](./Tasks/EXECUTION-ORDER-p8-social-assist-studio.md)

---

## Why this phase

A thought is a rough note. Chosen is the shortlist of those notes. Making is where the post is written. Today, opening a card in Chosen or Making leaves the notebook behind, and saving a new format drops the words of the old one.

This phase keeps one card. Chosen uses the notebook. Making and Ready use one composer, with the thought still on the left. The doctor does not copy the idea into a second post.

---

## Decision lock

Inherit DL-1…18. This phase adds DL-19…26. DL-5 was revised on 15 Oct 2026: the format is chosen when the card leaves Chosen. Do not re-litigate the earlier lock.

---

## What already exists (inspected 2026-10-15)

- Thoughts and a custom column open the notebook: a note, a resources bar, and tags. Chosen, Making, and Ready open the older editor.
- The notebook’s right side is empty. Files on a thought are references. Up to ten of each kind. Links have no count cap.
- Making, Ready, and Posted already store a format and words: caption, first comment, hook, script, cover line, up to three shots, and a story line. The note is kept with those words.
- Saving a format keeps only that format’s fields. A caption is limited to 2000 characters.
- A drag onto Ready already refuses a card with no file, a file that cannot post, or no format. Removing the Ready file sends the card back to Making.
- A time already lives on the Ready card. Schedule shows that time. This phase does not change the week.
- A stage move sends the stage only.
- No content-publishing call exists in the card service.

---

## Scope Guard — DO NOT TOUCH

- Any call that publishes a file to Instagram. The review already in progress stays basic and messages.
- Stickers, music, product tags, collaborators, an AI-generated switch, and an assistant tab.
- Carousel slides. The media slot stays one file.
- The notebook’s size, the left-expand resources bar, and the empty right side of a thought.
- The week calendar. Schedule does not become the editor.
- Video editing. A reel is words plus one video.
- `soc-02`, `soc-19`, `soc-22`, and `soc-24`. Leave those gates as they are.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-25`](./Tasks/task-soc-25-chosen-notebook.md) | Chosen uses the notebook | M | The thought sheet |
| [`soc-26`](./Tasks/task-soc-26-composer-shell.md) | The composer | L | soc-25 |
| [`soc-27`](./Tasks/task-soc-27-keep-words.md) | Words survive a format change | S | soc-26 |
| [`soc-28`](./Tasks/task-soc-28-lift-into-fields.md) | Move a line or a file into the post | M | soc-26 |
| [`soc-29`](./Tasks/task-soc-29-mark-ready.md) | Mark ready and schedule | M | soc-26, soc-28 |
| [`soc-30`](./Tasks/task-soc-30-phase-8-gate.md) | Phase 8 gate | S | soc-25…29 |

---

## Acceptance gate

- [x] A Chosen card opens the notebook. **Start making** asks Post, Reel, or Story, then the card is in Making. — 2026-10-15
- [x] Making and Ready open the composer. The thought is on the left. The post is in the middle. A preview is on the right. — 2026-10-15
- [x] A card that reaches Making with no format sees the three choices before the fields. — 2026-10-15
- [x] Switching format and saving keeps the other format’s words. A caption may be 2200 characters. — 2026-10-15
- [x] Selected text, or a dragged line, lands in a field. A file dragged from the resources bar becomes the file that posts. The reference remains. — 2026-10-15
- [x] **Mark ready** stays off until the card would be allowed onto Ready. **Schedule** sets the time the week already shows. — 2026-10-15
- [x] Nothing is sent to Instagram. — 2026-10-15
- [x] Lint and the social card tests that this phase touches are green. — 2026-10-15
