# Task hah-02: Marketing nav + hero + footer

> **Filename:** `task-hah-02-nav-hero-footer.md`
> **Links:** batch [`../plan-halo-aid-home-batch.md`](../plan-halo-aid-home-batch.md) · exec [`./EXECUTION-ORDER-halo-aid-home.md`](./EXECUTION-ORDER-halo-aid-home.md)

---

## 📋 Task Overview

Build the **page shell** for the Halo Aid landing page: sticky nav, hero, and footer.

**Program / Batch:** halo-aid-home · Wave 2
**Estimated Time:** ~1.5–2 hours
**Status:** ✅ Done (2026-07-21). **Model: Sonnet.**

---

## ✅ Task Breakdown

### 1. Page shell
- [x] 1.1 Rewrite `frontend/app/page.tsx` with `.halo` wrapper.
- [x] 1.2 Server Components where possible; mobile nav via `<details>`.

### 2. MarketingNav
- [x] 2.1 Sticky translucent nav + Halo logo.
- [x] 2.2 Sign in → `/login`, Get started → `/signup`.
- [x] 2.3 Mobile `<details>` disclosure.

### 3. Hero
- [x] 3.1 Headline + sub + dual CTAs.
- [x] 3.2 DM→booking mock visual.
- [x] 3.3 Book a demo → `mailto:` placeholder (OQ-1).

### 4. MarketingFooter
- [x] 4.1 Brand + Privacy / Terms / Data Deletion.
- [x] 4.2 Copyright © 2026 Halo Aid.

### 5. Verification
- [x] 5.1 `/` renders nav + hero + footer (HTTP 200).
- [x] 5.2 CTAs keyboard-accessible.
- [x] 5.3 Slice lint clean.

---

## ✅ Acceptance Criteria

- [x] Placeholder replaced; Halo Aid nav + hero + footer live.
- [x] CTAs route correctly; reusable `components/marketing/*` created.
- [x] Lint clean; dashboard theme unaffected.

---

**Created:** 2026-07-21. **Shipped:** 2026-07-21.
