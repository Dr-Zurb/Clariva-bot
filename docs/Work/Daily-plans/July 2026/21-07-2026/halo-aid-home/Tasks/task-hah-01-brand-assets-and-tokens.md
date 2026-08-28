# Task hah-01: Halo Aid brand assets + marketing-scoped blue tokens

> **Filename:** `task-hah-01-brand-assets-and-tokens.md`
> **Links:** batch [`../plan-halo-aid-home-batch.md`](../plan-halo-aid-home-batch.md) · exec [`./EXECUTION-ORDER-halo-aid-home.md`](./EXECUTION-ORDER-halo-aid-home.md)

---

## 📋 Task Overview

Lay the **visual foundation** for the Halo Aid landing page: transparent SVG brand assets + the marketing-scoped blue color tokens. No page sections yet.

**Program / Batch:** halo-aid-home · Wave 1
**Estimated Time:** ~30–45 min
**Status:** ✅ Done (2026-07-21). **Model: Sonnet/Composer** (static assets + scoped CSS; no PHI/migration/RLS).
**Change Type:** ✅ Add new brand assets + a marketing-scoped token block. **No global token edits.**

**Scope Guard:**
- Expected: 2–3 new files in `frontend/public/brand/` + one scoped CSS block (consumed by `app/page.tsx` in later tasks).
- **DO NOT** edit `globals.css` `:root`/`.dark` or `tailwind.config.ts` global palette (HAH-D1).
- **DO NOT** build any page sections (that's hah-02/03).
- Note: `logo.svg` / `logomark.svg` / `og.svg` were later replaced by `har-01` (rename batch); at ship time of hah-01 they were left untouched.

---

## ✅ Task Breakdown

### 1. Brand SVG assets
- [x] 1.1 `frontend/public/brand/halo-logomark.svg`
- [x] 1.2 `frontend/public/brand/halo-logo.svg`
- [x] 1.3 Gradient stops: royal `#1E56E0` → sky `#2E9BFF`; wordmark navy/sky.

### 2. Marketing-scoped blue tokens
- [x] 2.1 `.halo { … }` scoped vars in `globals.css` (not `:root`).
- [x] 2.2 Consuming pattern: `className="halo"` on landing wrapper.
- [x] 2.3 `.halo-gradient` helper.

### 3. Verification
- [x] 3.1 SVGs serve as `image/svg+xml`.
- [x] 3.2 Slice lint clean.
- [x] 3.3 `:root` teal untouched (HAH-D1).

---

## ✅ Acceptance Criteria

- [x] `halo-logo.svg` + `halo-logomark.svg` exist, transparent, on-brand.
- [x] `.halo` scoped token block defined; `:root`/global palette untouched.
- [x] Lint clean for the slice.

---

**Created:** 2026-07-21. **Shipped:** 2026-07-21.
