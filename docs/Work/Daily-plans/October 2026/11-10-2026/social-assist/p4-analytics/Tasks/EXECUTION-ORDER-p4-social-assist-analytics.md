# Execution order — p4 analytics

> Sibling document of [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md).

The user decides model switches. One high-care task: `soc-12`.

```
Wave 1 (Link — ~4h, single lane sequential):
  Lane α  ──── soc-10 (M, Sonnet)

Wave 2 (Posted list — ~4h, single lane sequential):
  Lane α  ──── soc-11 (M, Sonnet)

Wave 3 (Count and copy — ~8h wall, 2 parallel lanes — fully independent):
  Lane α  ──── soc-12 (L, Opus)                          [public booking]
  Lane β  ──── soc-13 (S, Sonnet)                        [card copy]

Wave 4 (Gate — ~2h, single lane sequential):
  Lane α  ──── (waits on soc-12 + soc-13) ──> soc-14 (M, Sonnet)
```

**Wall-clock:** ~18h (Wave 3 runs the count and the copy together).
**Agent-time:** ~22h.

**Bottleneck:** Wave 3 Lane α. A public booking must increment a number and must not copy the patient onto the card.

Lane test for Wave 3: after Wave 2, `soc-12` edits public checkout and the visit number. `soc-13` copies words into a new card. Neither reads the other’s in-flight work. They meet at `soc-14`.

### Wave 1 — Link

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-10 | M | Sonnet | `245_visit_page_links.sql`, `findVisitPageLink`, public slug | New durable code. Do not extend the one-hour table. |

### Wave 2 — Posted list

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-11 | M | Sonnet | soc-10 link, Schedule list | Paste URL. Show the coded link. Leave Insights alone. |

### Wave 3 — Count and copy

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0α | soc-12 | L | Opus | `public-clinic-checkout-service`, `COMPLIANCE.md` | Count only. No patient fields on the card. |
| 0β | soc-13 | S | Sonnet | Posted card from soc-11 | New card in Thoughts and ideas. No file, URL, or time. |

### Wave 4 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-14 | M | Sonnet | Phase 4 gate | Convergence. Not inside Wave 3. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-10 | M | Sonnet | A code on the doctor’s card. Not the chat-link table. |
| soc-11 | M | Sonnet | A URL field and a list. |
| soc-12 | L | Opus | Public checkout. The failure mode is writing a patient onto a marketing card. |
| soc-13 | S | Sonnet | Copy words and tags. |
| soc-14 | M | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [x] A card that leaves Ready has a code that still resolves the next day. — 2026-10-11
- [x] An expired `visit_page_links` code still expires. — 2026-10-11
- [x] The code is not logged. — 2026-10-11

### Wave 2

- [x] Pasting an Instagram URL shows the card on Analytics and removes it from Schedule. — 2026-10-11
- [x] The row shows title, format, topic, and the page link. Visit count may still be 0. — 2026-10-11

### Wave 3

- [x] A booking from the card link adds one visit. A booking without the code does not. — 2026-10-11
- [x] The card stores no patient name, phone, or id. — 2026-10-11
- [x] Use again creates a new Thoughts card and does not post. — 2026-10-11

### Wave 4

- [x] The phase gate in the batch plan is checked, with the date. — 2026-10-11
- [x] Insights post funnel is unchanged. — 2026-10-11
