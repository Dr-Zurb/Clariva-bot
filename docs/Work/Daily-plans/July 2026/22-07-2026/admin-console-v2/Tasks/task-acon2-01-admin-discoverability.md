# Task acon2-01: Admin-only entry point

> **Links:** batch [`../plan-admin-console-v2-batch.md`](../plan-admin-console-v2-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v2.md`](./EXECUTION-ORDER-admin-console-v2.md)

---

## 📋 Task Overview

Add an **"Admin console"** item to the header profile dropdown, visible **only** to admins, linking to `/admin/verifications`. No more typing the URL.

**Status:** ✅ DONE (2026-07-22). **Change Type:** Frontend prop plumbing + one dropdown item. No backend.

**Current State:**
- ✅ `/admin` shell exists + server-gated (`requireAdminAuth`).
- ✅ Dashboard layout has `user`; `HeaderProfileMenu` renders the dropdown (Settings / Theme / Log out).
- ❌ No link into `/admin`; the client doesn't know the user's role.

**Scope Guard:** thread `isAdmin` + add one dropdown item. Do not add to the sidebar, do not gate anything new server-side (already gated), do not show to non-admins.

---

## ✅ Task Breakdown

### 1. isAdmin plumbing
- [x] 1.1 `app/dashboard/layout.tsx`: compute `isAdmin = user.app_metadata?.role === 'admin'`; pass to `DashboardShell`.
- [x] 1.2 `DashboardShell` → `Header` → `HeaderProfileMenu`: forward `isAdmin` (optional prop, default false).

### 2. Dropdown item
- [x] 2.1 In `HeaderProfileMenu`, when `isAdmin`, render an "Admin console" `DropdownMenuItem` (`ShieldCheck`) → `/admin/verifications`, above Log out.
- [x] 2.2 Non-admin: item absent. (Belt-and-suspenders: server gate already blocks `/admin`.)

### 3. Verification
- [x] 3.1 Admin account: item visible, one click reaches the console. (owner dogfood)
- [x] 3.2 Non-admin account: item absent; manual `/admin` still redirects to `/dashboard`.
- [x] 3.3 No role value logged; eslint clean on touched files.

---

## 🌍 Global Safety Gate

- **Data touched?** None (reads role claim already on the session for display).
- **PHI in logs?** No.
- **External API/AI?** No.
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] Admins get a one-click "Admin console" entry; non-admins never see it.
- [ ] Pure visibility — access still enforced server-side.

**Created:** 2026-07-22.
