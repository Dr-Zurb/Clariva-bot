# Cockpit tab Peek (~½) — Phase 3 batch plan (17 Jul 2026)

> **Gated on p2.** Ship only if Primary still feels too wide/narrow and product wants a third named intent. Prefer **cancel** if Primary + drag covers the need.
>
> **One-line intent:** Add **Peek** (~50 / 50 with one neighbour) to the same chrome menu — still no free fraction picker.
>
> **Program index:** [`../README.md`](../README.md) (`CTF-D12`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-cockpit-tab-peek.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-tab-peek.md).

---

## Why this phase (optional)

Primary (~⅔) is “almost alone.” Peek is “side-by-side compare” — e.g. Subjective | Objective at half width each — without leaving the temporary session model.

---

## Decision lock (additive)

- **CTF-D12 — Peek ≈ 50 / 50.** Same neighbour resolver as Primary (**CTF-D9b**); sizes 50/50 at the separating split; other siblings hidden.
- **CTF-D10 applies.** Peek ↔ Primary ↔ Focus always recompute from original prior.
- **CTF-D11 grows.** Idle menu: **Focus** · **Primary** · **Peek**. Active: **Restore** (+ switch intent).

---

## ⚠️ Scope guard

- **STOP** if p2 not shipped (or explicitly skipped with “jump to Peek” product note — rare; prefer ship p2 first).
- **DO NOT** add ¼ / ⅓ chips.
- Frontend-only.

---

## Cross-cutting acceptance gate

- [x] Menu includes Peek.
- [x] Peek ≈ 50/50 with neighbour; others hidden.
- [x] Mode switches from original prior.
- [x] Restore / Esc / drag / preset behaviours from p1–p2 hold.
- [x] Tests + lint + Focus-slice tsc green.

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `ctf-08` | `peekLeafInTree` + tests (reuse neighbour resolver) | S | Sonnet / Auto |
| `ctf-09` | Session mode `'peek'` + menu item | S–M | Sonnet |
| `ctf-10` | Close gate | S | Sonnet / Composer |

---

## Cost estimate

| Wave | Tasks | Wall-clock |
|---|---|---|
| W1 | `ctf-08` | ~1–2h |
| W2 | `ctf-09` | ~2–3h |
| W3 | `ctf-10` | ~1h |
| **Total** | **3** | **~4–7h** |

---

**Created:** 2026-07-17. **Status:** ✅ Complete 2026-07-17 (`ctf-08`…`10`).
