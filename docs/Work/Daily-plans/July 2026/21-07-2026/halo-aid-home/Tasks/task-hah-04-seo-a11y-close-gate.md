# Task hah-04: SEO metadata/OG + responsive & a11y polish + close gate

> **Filename:** `task-hah-04-seo-a11y-close-gate.md`
> **Links:** batch [`../plan-halo-aid-home-batch.md`](../plan-halo-aid-home-batch.md) · exec [`./EXECUTION-ORDER-halo-aid-home.md`](./EXECUTION-ORDER-halo-aid-home.md)

---

## 📋 Task Overview

Finish the landing page: SEO/OG, a11y/responsive pass, OQ-1 placeholder, verification gate.

**Program / Batch:** halo-aid-home · Wave 4 (close)
**Estimated Time:** ~45 min–1 hour
**Status:** ✅ Done (2026-07-21). **Model: Sonnet/Composer.**

---

## ✅ Task Breakdown

### 1. SEO / OG
- [x] 1.1 Page-level `metadata` with `title.absolute` on `app/page.tsx`.
- [x] 1.2 `frontend/public/brand/halo-og.svg` (1200×630).
- [x] 1.3 Root layout defaults left for rename batch (HAH-D2 → shipped as `har-01`).

### 2. OQ-1
- [x] 2.1 Shipped `mailto:hello@haloaid.com` placeholder in `constants.ts`; parked in inbox for real destination.

### 3. Responsive + a11y
- [x] 3.1 Landmarks, heading hierarchy, decorative art `aria-hidden`, focusable CTAs.

### 4. Close gate
- [x] 4.1 Slice eslint clean.
- [x] 4.2 No home-page tests to break; typecheck clean for marketing slice.
- [x] 4.3 Runtime `/` HTTP 200, title + OG verified.
- [x] 4.4 Batch docs marked Complete; follow-ups in `capture/inbox.md`.

---

## ✅ Acceptance Criteria

- [x] `/` has Halo Aid SEO metadata + OG image.
- [x] Book a demo has a working mailto (pending real address).
- [x] Responsive + accessible; dashboard theme unaffected.
- [x] Slice lint/typecheck green; batch Complete.

---

**Created:** 2026-07-21. **Shipped:** 2026-07-21.
