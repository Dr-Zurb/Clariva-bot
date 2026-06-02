# Task ppr-12: Flip `/v2` to default + `?v1=1` escape hatch

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 5 step 0 — **XS, ~30min**

---

## Task overview

The flip. Edit `frontend/app/dashboard/appointments/[id]/page.tsx` so the default render is `<PatientProfilePage>` and add a `?v1=1` query branch that falls back to the old `<ConsultationCockpit>`. Delete the `/v2/page.tsx` file (its content moves into the canonical route).

This task lands a single small diff that **swaps the doctor's daily experience** from v1 to v2.

**DO NOT START THIS TASK** until ppr-11's parity matrix is 100% green.

**Estimated time:** ~30min.

**Status:** Pending. Gated on ppr-11.

**Hard deps:** ppr-11 (parity green).

**Source:** R5.1 + R5.2 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast** or **Sonnet 4.6 Medium**. The diff is small and mechanical.

**New chat?** Fresh small chat. Pre-load:
- This task file.
- `frontend/app/dashboard/appointments/[id]/page.tsx` (the canonical route — what we edit).
- `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (ppr-01 output — content gets folded into the canonical route, file deleted).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Edit `frontend/app/dashboard/appointments/[id]/page.tsx`

- [ ] Replace the v1 render branch with a v2-default + `?v1=1`-escape branch:

  ```tsx
  import { Suspense } from "react";
  import { redirect } from "next/navigation";
  import { createClient } from "@/lib/supabase/server";
  import { getAppointmentById } from "@/lib/api/server-appointments";
  import PatientProfilePage from "@/components/patient-profile/PatientProfilePage";
  import ConsultationCockpit from "@/components/consultation/ConsultationCockpit";

  interface AppointmentDetailPageProps {
    params: { id: string };
    searchParams: { v1?: string };
  }

  /**
   * The canonical appointment detail route.
   *
   * Default: renders `<PatientProfilePage>` (v2 shell — plan-patient-profile-shell-rebuild).
   *
   * Escape hatch: `?v1=1` renders the legacy `<ConsultationCockpit>`. Kept in
   * place for one release window after the flip in case a parity gap surfaces
   * in prod that ppr-11 missed. Removed in ppr-14 along with
   * `<ConsultationCockpit>` itself.
   */
  export default async function AppointmentDetailPage({
    params,
    searchParams,
  }: AppointmentDetailPageProps) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { id } = params;
    const result = await getAppointmentById(id, supabase);

    if (!result.ok) {
      // ... existing error states (404 / 403 etc.) — unchanged ...
    }

    const { appointment, token } = result.value;

    if (searchParams.v1 === "1") {
      return (
        <Suspense fallback={<div className="p-4">Loading…</div>}>
          <ConsultationCockpit appointment={appointment} token={token} />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<div className="p-4">Loading…</div>}>
        <PatientProfilePage appointment={appointment} token={token} />
      </Suspense>
    );
  }
  ```

- [ ] Verify the auth + fetch + error-state portions are byte-identical to the pre-edit version. Only the FINAL render branch changes.

### Delete `frontend/app/dashboard/appointments/[id]/v2/page.tsx`

- [ ] `git rm frontend/app/dashboard/appointments/[id]/v2/page.tsx`. The `/v2` route 404s after this — intentional. ppr-13 / ppr-14 don't need it.
- [ ] If anything in the codebase still references `/v2` (e.g. a dev-mode link), update or remove it. Search `rg "/v2" frontend/`.

### Tests

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] Existing E2E / Playwright tests pointing at `/dashboard/appointments/[id]` should now hit the v2 shell. Update any test that relied on v1-specific DOM (e.g. CSS class names on `ConsultationCockpit`). Most shouldn't need changes (DOM is parity-identical per ppr-11).

### Manual smoke

- [ ] Open `/dashboard/appointments/[id]` — sees the v2 shell.
- [ ] Open `/dashboard/appointments/[id]?v1=1` — sees the v1 shell.
- [ ] Open `/dashboard/appointments/[id]/v2` — 404 (the route is gone).

### Telemetry (optional but recommended)

- [ ] If a frontend telemetry hook is available (Datadog RUM, Sentry breadcrumbs, etc.), instrument the `?v1=1` branch with a single event:

  ```ts
  // Inside the v1 branch, before render:
  console.warn("[patient-profile] v1 escape hatch hit", { appointmentId: id });
  ```

  This lets ppr-14 confirm "no `?v1=1` traffic in the last 7 days" before deleting.

---

## Out of scope

- **Renaming files.** ppr-13.
- **Deleting `ConsultationCockpit.tsx`.** ppr-14.
- **Removing the `?v1=1` branch.** ppr-14, after the release window.
- **Anything outside the appointment-detail page.** This task is one file edit + one file delete.

---

## Files expected to touch

**Modified:**
- `frontend/app/dashboard/appointments/[id]/page.tsx` (~15 LOC delta — adds the `?v1=1` branch).

**Deleted:**
- `frontend/app/dashboard/appointments/[id]/v2/page.tsx`.

**Tests:** any E2E referencing `/v2` updated.

---

## Notes / open decisions

1. **Why a query param (`?v1=1`) instead of a feature flag service?** Doctors hitting a parity bug need IMMEDIATE relief, not a flag-flip propagation delay. A query param is universal, requires no flag service infra, and disappears after ppr-14.
2. **Why a `Suspense` boundary?** Both `<PatientProfilePage>` and `<ConsultationCockpit>` are client components. The Suspense boundary mirrors the existing pattern in the v1 route and lets the page render a loading state during the client-hydration window. If the existing route doesn't have one today, keep ppr-12 changes minimal (don't add one).
3. **Why delete `/v2/page.tsx`?** Two routes to the same page is confusing for ops + crashes the URL pattern of `[id]` deep links. The route is dev-only scaffolding; once flipped, it has no purpose.

---

## References

- **Affected files:**
  - mod `frontend/app/dashboard/appointments/[id]/page.tsx`
  - del `frontend/app/dashboard/appointments/[id]/v2/page.tsx`
- **Source decision:** R5.1 + R5.2 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task (HOLD for release window):** [`task-ppr-13-rename-green-grade-files.md`](./task-ppr-13-rename-green-grade-files.md) — recommended ≥1 week of prod use before starting.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
