# Halo Aid — blue app re-theme (batch spec)

> **Status:** ✅ Complete (2026-07-21). `hab-01`…`hab-02` shipped — global `--primary`/`--ring` are Halo royal blue; share-target teal leftovers cleaned.
> **Parent:** deferred from [`../halo-aid-rename/`](../halo-aid-rename/plan-halo-aid-rename-batch.md) (HAR-D1 / OQ-2).
> **One-line intent:** Point the global design-system `--primary` / `--ring` from teal to **Halo Aid royal blue**, so the whole dashboard (and every `bg-primary` / `text-primary` surface) matches the brand — without a per-component rewrite.

---

## Decision lock

| ID | Decision |
|---|---|
| **HAB-D1** | **Token swap only.** Change `:root` + `.dark` `--primary` / `--ring` (and comments). Keep amber `--accent` (completion/"Sent"), status colors, neutrals. |
| **HAB-D2** | **Primary = Halo royal** `223 79% 50%` (light). Dark: lighter `223 70% 58%` for contrast on dim surfaces. `--primary-foreground` stays white (light) / near-ink (dark). |
| **HAB-D3** | **Marketing `.halo` tokens stay** for gradients / navy / mist on the landing page. Landing CTAs that already use `--halo-blue` keep working; they now also match `--primary`. |
| **HAB-D4** | **No component redesign.** Sweep only clear brand leftover hardcoded `teal-*` classes that were acting as "primary" (e.g. share-target). Leave avatar rainbow colors (`bg-teal-500` in `actor-avatar`) alone. |
| **HAB-D5** | **Dogfood is the visual QA.** Spot-check dashboard header CTA, buttons, focus rings, login, landing — light mode (dark if easily toggled). |

---

## Scope guard

- Do NOT change amber accent / success / warning / destructive / info.
- Do NOT rewrite marketing components to use `primary` instead of `--halo-*` (optional later).
- Do NOT rename npm packages or Meta Page (still owner/external).

---

## Tasks

| Task | Title | Size |
|---|---|---|
| `hab-01` | Swap `:root` / `.dark` primary + ring tokens + docs comments | S |
| `hab-02` | Sweep brand teal leftovers + smoke + close gate | S |

---

## Acceptance gate

- [x] `--primary` / `--ring` are Halo blue in light + dark.
- [x] Dashboard primary buttons / focus rings read blue (token-driven; dogfood spot-check parked).
- [x] Amber accent + status colors unchanged.
- [x] share-target eslint clean; `/` + `/login` HTTP 200.

---

**Created:** 2026-07-21. **Shipped:** 2026-07-21.

