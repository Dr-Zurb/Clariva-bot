# Cockpit tab Focus polish — Phase 4 batch plan (17 Jul 2026)

> **Optional, piece-cancellable.** Each wave can ship alone or be dropped after dogfood. Does **not** add new size intents.
>
> **One-line intent:** Affordances polish on the Focus program — optional `F` hotkey, optional stub siblings (instead of hide), optional mobile Focus.
>
> **Program index:** [`../README.md`](../README.md) (`CTF-D13`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-cockpit-tab-focus-polish.md`](./Tasks/EXECUTION-ORDER-p4-cockpit-tab-focus-polish.md).

---

## Why this phase

p1–p3 cover named intents. Polish is for friction found in dogfood — not a reason to invent a fraction picker.

---

## Decision lock

- **CTF-D13 — Pick independently.** Product checks which of hotkey / stubs / mobile to run; unchecked items stay cancelled in the program README.
- **Hotkey:** only if it does not collide with existing cockpit shortcuts (`useCockpitLayoutHotkeys`, Rx shortcuts). Prefer leaf-hover or “when leaf contains focus” scope — lock in `ctf-11` before coding.
- **Stub siblings:** if shipped, replace hide-with-strip only for off-path leaves **while session active**; Restore still exact prior. Do not change durable collapse semantics.
- **Mobile:** only if doctors use Focus on small screens; otherwise keep `CockpitMobileFallback` as-is.

---

## ⚠️ Scope guard

- **DO NOT** add Peek/Primary here if p2/p3 were cancelled — reopen those phases instead.
- **DO NOT** add free fractions.
- Frontend-only.

---

## Cross-cutting acceptance gate (for whichever pieces ship)

- [ ] Each shipped piece has its own smoke checklist ticked in its task.
- [ ] Unshipped pieces explicitly cancelled in program README.
- [ ] p1–p3 behaviours (as applicable) still green.
- [ ] Slice tests + lint clean.

---

## Tasks (all optional)

| Task | Title | Ship if… | Size | Model |
|---|---|---|---|---|
| `ctf-11` | Optional `F` / leaf hotkey | Dogfood asks for keyboard Focus | S | Sonnet |
| `ctf-12` | Stub siblings while session active | Hide feels too “gone” | M | Sonnet |
| `ctf-13` | Mobile Focus path | Mobile consults need Focus | M–L | Sonnet (Opus if 5+ files) |
| `ctf-14` | Close gate for shipped polish pieces | Any of 11–13 shipped | S | Composer |

---

## Cost estimate

| Piece | Wall-clock |
|---|---|
| Hotkey only | ~1–2h |
| Stubs | ~2–4h |
| Mobile | ~3–6h |
| Close | ~1h |

---

**Created:** 2026-07-17. **Status:** Planned — each piece gated on product pick after p1–p3 soak.
