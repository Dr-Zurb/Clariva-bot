# Halo Aid — legal pages polish

> **Status:** ✅ Complete (2026-07-21).
> **One-line intent:** Wrap `/privacy`, `/terms`, `/data-deletion` in shared Halo Aid chrome (logo, mist, semantic tokens) without changing legal copy or the data-deletion form behavior.

---

## Decision lock

| ID | Decision |
|---|---|
| **HAL-D1** | Shared `LegalShell` for all three pages. |
| **HAL-D2** | Copy + `DataDeletionClient` behavior unchanged. |
| **HAL-D3** | Semantic tokens + Halo mist; no new legal claims. |

## Shipped

- `frontend/components/legal/LegalShell.tsx`
- Restyled `app/privacy|terms|data-deletion/page.tsx`

## Acceptance

- [x] All three pages HTTP 200 with Halo logo + legal nav + mist.
- [x] Legal copy + DataDeletionClient unchanged in behavior.
- [x] Slice eslint clean.

**Created:** 2026-07-21. **Shipped:** 2026-07-21.
