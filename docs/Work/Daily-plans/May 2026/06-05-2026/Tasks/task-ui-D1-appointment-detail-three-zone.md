# Task ui-D1: Appointment detail — 3-zone layout + Tabs (Overview / Consult / Prescriptions / Artifacts)

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch D (Reference page redesigns) — **L item, ~6h**

---

## Task overview

Today's [`frontend/app/dashboard/appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/%5Bid%5D/page.tsx) is ~280 lines of imperative JSX: a chart rail on the left, a stacked column on the right with a `<dl>` of patient info, status pill, OPD slot actions, modality launcher, optional post-call summary, optional artifacts panel, optional chat-history link — all rendered top-to-bottom regardless of which one the doctor needs at this moment.

This task restructures the page into a 3-zone layout that respects the doctor's actual mental model: **chart on the left (already correct), tabbed work area in the center, context column on the right at `xl+`**. It also extracts the work-area content into 4 tabs that map to the doctor's intent: `Overview` (basic info + OPD actions), `Consult` (modality launcher / live state), `Prescriptions` (Rx form + previous Rx), `Artifacts` (post-call summary + recordings + chat history).

D1 is the **architectural template** for inner detail pages. Once it ships, D2 (patient detail) inherits the pattern; future detail pages do too.

**Estimated time:** ~6h. ~1h for the design call (Opus), ~5h impl (Sonnet).

**Status:** Design locked (2026-05-06, Opus). Ready for Sonnet impl chat. See `## Implementation spec (locked 2026-05-06 by Opus design pass)` below.

**Hard deps:** A2 close (`Tabs`, `Card`, `Button`, `Badge` primitives) — **verified shipped 2026-05-06** (all primitives present in `frontend/components/ui/`, A1 tokens live in `globals.css` + `tailwind.config.ts`).

**Soft deps:** B1 (Header `Start consult` CTA — D1's primary CTA can defer to it for global flows; D1 still has a page-level CTA for clarity).

**Source:** [U4.1](../../../../Product%20plans/plan-ui-system-redesign.md#u41--appointment-detail-3-zone-layout) + [U4.2](../../../../Product%20plans/plan-ui-system-redesign.md#u42--appointment-detail-tabs).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the design turn (tab routing, deep-link strategy, mode-aware Tabs visibility), then **Sonnet 4.6 Medium** for impl. Canonical Pattern B from the efficiency guide.

**Why split:** the page has 5 conditional render branches today (active session / ended session / no session / pending OPD slot / completed). Mapping those onto 4 tabs without breaking any flow takes one Opus turn of reasoning.

**New chat?** **Yes — split into two chats:**

1. **Opus design chat (~30 min):**
   - Pre-load: this task file + the full current `appointments/[id]/page.tsx` + a one-line description of each tab's intent.
   - Use **Plan Mode** so the agent can only read and propose, not edit.
   - Ask: "Map the current 5 conditional branches into the 4 tabs. Decide tab visibility rules (e.g., Artifacts hidden when no session row exists). Decide deep-link strategy (`?tab=consult`). Decide what stays at page-header level vs what's per-tab. Output a 1-page implementation spec."
   - Lock the spec before chat 2.

2. **Sonnet impl chat (~3-4h of usage):**
   - Pre-load: this task file + the locked spec from chat 1 + A2's `Tabs` primitive.
   - Implement the redesign + verify all existing flows still work.

**Estimated turns:** 1 Opus design + 4–6 Sonnet impl turns.

**Escalate the impl chat to Opus per-message** if Sonnet ships a Tab without preserving the existing post-call artifacts wiring (most likely failure mode). The implementation log section of the existing page is gold; preserve all the Plan-07 references.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Layout

- [ ] **3-zone grid on `xl+`:**
  - Left rail: existing [`<AppointmentChartRail>`](../../../../../frontend/components/ehr/AppointmentChartRail.tsx). Reskinned to new tokens but no behavior change.
  - Center work area: page header (described below) + `<Tabs>` content.
  - Right context column: `DoctorOpdSlotActions`, modality status / quick actions when applicable, `View conversation` link.
- [ ] **At `lg`:** drop the right context column; its contents move to the bottom of the relevant tab (or to a collapsible accordion inside the page header).
- [ ] **At `<lg`:** chart rail collapses to its existing accordion behavior; tabs become a horizontal scroll list at the top.
- [ ] **Grid columns:**
  ```
  xl+:    chart-3  | work-6  | context-3   (12-col)
  lg:     chart-3  | work-9               (no context column)
  <lg:    stacked
  ```

### Page header (above tabs)

- [ ] **Back link** "← Back to appointments" — preserved from current page.
- [ ] **Patient name** as `<h1 className="text-2xl font-semibold">`. Wraps in a Link to patient detail (D2) when patient_id is known.
- [ ] **Status `<Badge>`** next to the name. Same color mapping as today (confirmed=success, pending=warning, cancelled=muted, completed=info).
- [ ] **Primary action area** at the right of the header: modality-aware CTA (`Start consult` / `Resume` / `View summary`) — derived from `appointment.consultation_session?.status`. Reuses launcher.
- [ ] **One-line meta strip** under the name: `<phone> · <date+time> · <duration if any>` in muted text.

### Tabs

- [ ] **`<Tabs defaultValue="overview">`** with 4 triggers:
  - `Overview`
  - `Consult`
  - `Prescriptions`
  - `Artifacts`
- [ ] **Deep-linkable:** `defaultValue` reads from URL search param `?tab=` (one of the 4 ids); changing tab updates the URL via `router.replace` without scroll. Refresh / back / share preserves the tab.

### Tab content

- [ ] **Overview tab:**
  - The current `<dl>` of patient/phone/date/status/notes (preserved as-is).
  - `<DoctorOpdSlotActions>` if applicable.
  - That's it for V1. The "kitchen sink" Overview is intentional — it's the safe default for users who don't know which tab to pick.

- [ ] **Consult tab:**
  - `<AppointmentConsultationActions>` (existing component) for modality launcher / live state / live actions.
  - If session is `active`: a bold reminder "Active consult — work in this tab to keep the session in foreground."
  - If session is `ended`: empty state directing to Artifacts tab.

- [ ] **Prescriptions tab:**
  - `<PreviousPrescriptions>` (existing) — list of prior Rx for this appointment / patient.
  - Mount point for the prescription form ([`PrescriptionForm`](../../../../../frontend/components/consultation/PrescriptionForm.tsx)) when the doctor wants to write/edit one. The form's `mode` prop already supports the appointment-detail surface — preserve that contract.

- [ ] **Artifacts tab:**
  - `<CallPostCallSummary>` if the session is `ended`.
  - `<ConsultArtifactsPanel>` if the session is `ended` (replay, transcript).
  - "View conversation" link → chat history page.
  - **Empty state** if no session row exists: "No call artifacts yet."
- [ ] **Tab visibility rule:**
  - `Consult` tab: hidden if appointment is `cancelled` AND no session row exists (irrelevant).
  - `Artifacts` tab: hidden if no session row exists (irrelevant). Once a session row appears, tab unlocks.
  - All other tabs always visible.

### Right context column (xl+)

- [ ] Mounts: condensed appointment meta (date, modality), `<DoctorOpdSlotActions>` (compact mode if it has one; else default), modality controls if session is `active`, "View conversation" link.
- [ ] Sticky to top of the work area at `xl+` (`sticky top-20`).

### Chart rail reskin

- [ ] [`<AppointmentChartRail>`](../../../../../frontend/components/ehr/AppointmentChartRail.tsx) styling reads from new tokens (`bg-card`, `border-border`, etc.). No structural change.

### Behavior preservation

- [ ] Every existing render path still works:
  - 401 redirect to `/login` ✔
  - 403 / 404 / generic error states ✔
  - "Back to appointments" link ✔
  - Modality launcher ✔
  - Post-call summary surfaces when session ends ✔
  - Artifacts panel surfaces when session ends ✔
  - Chat history link surfaces when session row exists ✔
- [ ] Comments referencing `Plan 07 · Task X` etc. preserved (they document why specific surfaces exist).

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] All raw color classes replaced with tokens.
- [ ] Mobile breakpoints verified at 375 / 768 / 1024 / 1440 / 1920.
- [ ] **Re-test the full Rx round-trip from this page** (write Rx → save → send → patient receives at `/r/[id]?t=`) — D1 must not regress the prescription pipeline.

---

## Implementation spec (locked 2026-05-06 by Opus design pass)

This section supersedes any prose in `## Notes / open decisions` below where they conflict. The impl chat (Sonnet 4.6) should treat the locks here as **non-negotiable** unless explicitly escalated to Opus. Originally drafted in Opus design chat; verified against the current `appointments/[id]/page.tsx`, the existing Tabs primitive, A1 tokens, and the `Appointment` / `ConsultationSessionSummary` types.

### Architectural locks

1. **Page stays a server component.** Auth, `getAppointmentById`, error rendering, redirects, and the page header (back link, h1, status badge, meta strip) all stay server-rendered for fast first paint.
2. **All interactive surfaces below the page header live in one new client component**, [`frontend/components/consultation/AppointmentDetailWorkArea.tsx`](../../../../../frontend/components/consultation/AppointmentDetailWorkArea.tsx). It owns the `Tabs`, the URL `?tab=` deep-link, the page-CTA, the right context column, and all 4 tab contents. Single client island = minimal hydration cost; data dependency on `consultation_session.status` is naturally co-located.
3. **Bypass the existing `AppointmentConsultationActions` wrapper.** It's the only consumer in the repo (verified by grep), and its current internals already mix the modality launcher + Rx form + previous-Rx + mark-completed — none of which can mount whole into a single tab without duplicating into another. **Mount its children directly** in the new tabs:
   - `ConsultationLauncher` → **Consult** tab
   - `MarkCompletedForm` → **Consult** tab (it's a "wrap up the consult" CTA — semantically belongs with Consult, not Prescriptions)
   - `PreviousPrescriptions` → **Prescriptions** tab
   - `PrescriptionForm` → **Prescriptions** tab
   - Leave [`AppointmentConsultationActions.tsx`](../../../../../frontend/components/consultation/AppointmentConsultationActions.tsx) **untouched** apart from a 3-line deprecation JSDoc at the top: `@deprecated D1 — bypassed at use-site; safe to delete after D2 / D3 ship.` Do **not** delete it in this PR (out-of-scope blast radius).
4. **3-zone grid is split across two scopes.** The page renders the 2-column outer grid (`chart-3 | work-9` at `lg+`). The work area client component owns its **inner** 2-column split (`tabs-2/3 | context-1/3` at `xl+`) so the right column can react to `consultation_session.status` without going through props from a server tree.
5. **Page-header CTA** lives inside `AppointmentDetailWorkArea` as the first child of the tabs column, pulled up via `-mt-2 mb-4 xl:-mt-12 flex justify-end` so it visually attaches to the page header at `xl+`. Acceptable visual trade-off; impl chat may choose to fall back to a separate `DetailHeaderCTA` client island in the page if alignment looks off.
6. **`?tab=` URL state** is the source of truth: `useSearchParams` reads, `router.replace({ scroll: false })` writes. Tabs are **controlled** (`value={activeTab}`). Invalid / hidden tab names fall back to `overview`. `tab=overview` is omitted from the URL (cleaner default share links).
7. **Tab visibility rules:**
   - `overview` — always
   - `consult` — hidden if `appointment.status === "cancelled" && !appointment.consultation_session?.id`
   - `prescriptions` — always
   - `artifacts` — hidden if `!appointment.consultation_session?.id`
8. **Modality-aware page CTA derivation:**
   - `consultation_session?.status === "live"` → `Resume consult` → switches to `consult` tab
   - `consultation_session?.status === "ended"` → `View summary` → switches to `artifacts` tab
   - otherwise → `Start consult` → switches to `consult` tab
   - The CTA never bypasses the launcher itself; it's a tab-switching shortcut. The launcher inside the Consult tab is the actual session start engine.
9. **Status `<Badge>` token mapping** (using A1 semantic colors from `tailwind.config.ts`):

   ```ts
   const STATUS_CLASSES: Record<AppointmentStatus, string> = {
     confirmed: "border-transparent bg-success/15 text-success",
     pending:   "border-transparent bg-warning/20 text-warning-foreground",
     cancelled: "border-transparent bg-muted text-muted-foreground",
     completed: "border-transparent bg-info/15 text-info",
     no_show:   "border-transparent bg-destructive/15 text-destructive",
   };
   ```
   Used as `<Badge variant="outline" className={STATUS_CLASSES[appointment.status]}>{appointment.status}</Badge>`.

10. **Error-state UI** (401/403/404/500) is reskinned in this PR (per the `All raw color classes replaced with tokens` acceptance criterion):
    - `border-red-200 bg-red-50 text-red-800` → `border-destructive/30 bg-destructive/10 text-destructive`
    - `text-blue-600 hover:text-blue-800` → `text-primary hover:text-primary/80`
    - `focus:ring-blue-500` → `focus:ring-ring`

### File-level changes

| File | Change | Approx LOC |
|---|---|---|
| [`frontend/app/dashboard/appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/%5Bid%5D/page.tsx) | **Major rewrite** — auth + fetch + error states preserved verbatim; old single-column body replaced by 3-zone shell + page header + `<AppointmentDetailWorkArea>` mount | ~180 (down from 282) |
| `frontend/components/consultation/AppointmentDetailWorkArea.tsx` | **New client component** — owns Tabs state, URL deep-link, CTA, right context column, all 4 tab contents | ~330 |
| [`frontend/components/ehr/AppointmentChartRail.tsx`](../../../../../frontend/components/ehr/AppointmentChartRail.tsx) | **Reskin only** — token swaps below; no structural change | ~10 line edits |
| [`frontend/components/consultation/AppointmentConsultationActions.tsx`](../../../../../frontend/components/consultation/AppointmentConsultationActions.tsx) | Add 3-line deprecation JSDoc at top. No code change. | +3 |

No backend, no migrations, no tests (per task scope).

### Tab content composition (locked)

**Overview tab** — kitchen-sink default:

- Patient info `<dl>` (current 4-row layout: patient, phone, date+time, notes — **without** the status row, which has migrated to the page-header badge). Class swaps: `text-gray-500` → `text-muted-foreground`, `text-gray-900` → `text-foreground`.
- `<DoctorOpdSlotActions>` (component self-hides when not slot-mode + pending/confirmed).
- **Mirror of right-context-column content at `<xl`** — wrapped in `<div className="xl:hidden">…</div>` so the same `<ContextColumn>` renders here at `lg` / `<lg` and disappears at `xl+` where it lives in the right column. (This is how we satisfy the spec line "At lg: drop the right context column; its contents move to the bottom of the relevant tab.")

**Consult tab:**

- If `consultation_session?.status === "ended"` → render an `<EmptyState>` only: title `"This consultation has ended."`, body `"Recordings, transcripts, and post-call summary live in the Artifacts tab."`, action `<Button onClick={onJumpToArtifacts}>View artifacts</Button>`. **Do not mount the launcher in this state.**
- If `consultation_session?.status === "live"` → render a top banner `<div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">Active consult — work in this tab to keep the session in foreground.</div>` above the launcher.
- Otherwise:
  - `<ConsultationLauncher appointment={appointment} token={token} />`
  - `<MarkCompletedForm appointmentId={appointment.id} token={token} onSuccess={onRefresh} />` wrapped in the existing card shell (`rounded-lg border border-border bg-card p-4`), only rendered when `provider_session_id` set OR status is `pending` / `confirmed` / `completed` (matches today's gating).

**Prescriptions tab:**

- `<PreviousPrescriptions patientId={appointment.patient_id} appointmentId={appointment.id} token={token} limit={3} />` if `patient_id` present.
- `<PrescriptionForm appointmentId={appointment.id} patientId={appointment.patient_id ?? null} token={token} onSuccess={onRefresh} />` wrapped in the card shell, gated identically to today (`provider_session_id` OR `pending`/`confirmed`/`completed`).
- **Preserve the `mode` prop contract** — current `PrescriptionForm` does not take a `mode` prop in this surface; the appointment-detail mount stays the default mount. If a future task lands a `mode` prop, the impl chat does not need to set it for D1.

**Artifacts tab:**

- Empty state if no session row: title `"No call artifacts yet."`, body `"Recording, transcript, and chat history will appear here once a consult is started."`. (Tab is hidden in this case anyway by visibility rule, but render the empty state defensively in case the rule changes later.)
- If `session.status === "ended"`:
  - `<CallPostCallSummary sessionId={session.id} bearerJwt={token} mountContext="history-detail" />`
  - `<ConsultArtifactsPanel sessionId={session.id} token={token} callerRole="doctor" callerLabel="Doctor view" />`
- Always-on (when session row exists): `View conversation` link → `/dashboard/appointments/${id}/chat-history`, restyled with `border-border bg-card text-foreground hover:bg-muted focus:ring-ring`.

**Comment preservation — non-negotiable.** The three multi-line JSDoc comment blocks currently on the page MUST be carried verbatim into `ArtifactsTab`, immediately above the surface they document:

- `Sub-batch D · task-video-D1 — durable post-call summary.` block (currently above `<CallPostCallSummary>`)
- `Plan 07 · Task 29 — once the consult ends, surface the artifact panel...` block (currently above `<ConsultArtifactsPanel>`)
- `Plan 07 · Task 31 — "View conversation" link...` block (currently above the chat-history Link)

These document **why** those surfaces exist. The Sonnet impl chat must not summarize, paraphrase, or shorten them. Most likely failure mode for this task per the model-execution-guidance section above.

### Right ContextColumn (xl+ only) — composition

- Card 1 — "Visit details": modality icon + label, date+time, phone. Read directly from `appointment.consultation_type` (default to `"video"` per type comment), `appointment.appointment_date`, `appointment.patient_phone`.
- `<DoctorOpdSlotActions>` — self-hides when not slot-mode + pending/confirmed; safe to dual-mount alongside Overview tab.
- "View conversation" link if `consultation_session?.id` present.

Sticky at `xl+`: `xl:sticky xl:top-20 xl:self-start`. Hidden at `<xl` (its content lives in Overview tab via the `xl:hidden` mirror).

### Chart rail token reskin (locked diff)

In [`frontend/components/ehr/AppointmentChartRail.tsx`](../../../../../frontend/components/ehr/AppointmentChartRail.tsx), apply these substitutions only — **no structural change, no behavior change, no prop change**:

```
border-gray-200            → border-border
bg-white                   → bg-card
text-gray-400              → text-muted-foreground
text-gray-500              → text-muted-foreground
text-gray-700              → text-foreground
text-gray-900              → text-foreground
hover:bg-gray-100          → hover:bg-muted
hover:text-gray-700/900    → hover:text-foreground
```

Touched lines: ~90 (collapsed `<aside>`), ~92–98 (expand button), ~100–102 (vertical label), ~118–125 (collapse button). 4 visual elements; ~10 class swaps total.

### Skeleton: `AppointmentDetailWorkArea` (impl chat starts from here)

```tsx
"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/types/appointment";
import ConsultationLauncher from "./ConsultationLauncher";
import MarkCompletedForm from "./MarkCompletedForm";
import PrescriptionForm from "./PrescriptionForm";
import PreviousPrescriptions from "./PreviousPrescriptions";
import CallPostCallSummary from "./CallPostCallSummary";
import ConsultArtifactsPanel from "./ConsultArtifactsPanel";
import DoctorOpdSlotActions from "@/components/opd/DoctorOpdSlotActions";

type TabId = "overview" | "consult" | "prescriptions" | "artifacts";

interface Props {
  appointment: Appointment;
  token: string;
}

export default function AppointmentDetailWorkArea({ appointment, token }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const session = appointment.consultation_session ?? null;
  const hasSession = !!session?.id;
  const sessionEnded = session?.status === "ended";
  const sessionLive = session?.status === "live";

  const showConsult = !(appointment.status === "cancelled" && !hasSession);
  const showArtifacts = hasSession;

  const visibleTabs = useMemo<TabId[]>(() => {
    const all: TabId[] = ["overview", "consult", "prescriptions", "artifacts"];
    return all.filter((t) =>
      t === "consult" ? showConsult : t === "artifacts" ? showArtifacts : true,
    );
  }, [showConsult, showArtifacts]);

  const requested = searchParams.get("tab") as TabId | null;
  const activeTab: TabId =
    requested && visibleTabs.includes(requested) ? requested : "overview";

  const handleTabChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const onRefresh = () => router.refresh();

  // CTA derivation
  let ctaLabel = "Start consult";
  let ctaTab: TabId = "consult";
  if (sessionLive) { ctaLabel = "Resume consult"; ctaTab = "consult"; }
  else if (sessionEnded) { ctaLabel = "View summary"; ctaTab = "artifacts"; }
  const ctaShouldRender = visibleTabs.includes(ctaTab);

  return (
    <div className="xl:grid xl:grid-cols-3 xl:gap-6">
      <div className="xl:col-span-2">
        {ctaShouldRender && (
          <div className="-mt-2 mb-4 flex justify-end xl:-mt-12">
            <Button onClick={() => handleTabChange(ctaTab)}>{ctaLabel}</Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList
            className="grid w-full"
            style={{
              gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
            }}
          >
            {visibleTabs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t === "overview" ? "Overview"
                  : t === "consult" ? "Consult"
                  : t === "prescriptions" ? "Prescriptions"
                  : "Artifacts"}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-6">
            {/* Patient info <dl> + DoctorOpdSlotActions + ContextColumn (xl:hidden mirror) */}
          </TabsContent>

          <TabsContent value="consult" className="mt-4 space-y-6">
            {/* Live banner / ended empty state / launcher / mark-completed */}
          </TabsContent>

          <TabsContent value="prescriptions" className="mt-4 space-y-6">
            {/* PreviousPrescriptions + PrescriptionForm */}
          </TabsContent>

          <TabsContent value="artifacts" className="mt-4 space-y-6">
            {/* preserved Plan-07 comments + summary + artifacts panel + chat link */}
          </TabsContent>
        </Tabs>
      </div>

      <aside className="hidden xl:block xl:col-span-1 xl:sticky xl:top-20 xl:self-start">
        {/* ContextColumn */}
      </aside>
    </div>
  );
}
```

### Verification checklist (impl chat runs after coding)

1. `cd frontend && npx tsc --noEmit` clean.
2. `cd frontend && npx next lint` clean.
3. `cd frontend && npm run dev` — no console errors on page load.
4. Open `/dashboard/appointments/<live-session-appt>` — Consult tab is selected by URL? Refresh: tab persists.
5. Append `?tab=artifacts` — opens Artifacts directly. `?tab=garbage` → falls back to Overview.
6. Cancelled appointment with no session: Consult + Artifacts tabs absent from `<TabsList>`.
7. Tab change does not scroll to top (`router.replace({ scroll: false })`).
8. Click `Resume consult` CTA on live session → switches to Consult tab.
9. **Rx round-trip smoke** — open a `pending` appointment, switch to Prescriptions tab, write Rx, save, send → patient receives at `/r/[id]?t=`. **D1 must not regress this.** (Acceptance line 140.)
10. Old `/dashboard/appointments/<id>` deep links keep working (no tab param) → Overview default.
11. Chart rail collapsed/expanded state preserved across tab switches (localStorage key `ehr_chart_collapsed_v1`).
12. Mobile (`< 1024px`): chart accordion at top, tabs below, no context column.
13. `lg` (1024–1279px): chart-3 + tabs-9, no separate context column (its content lives at end of Overview tab).
14. `xl+` (≥1280px): chart-3 + tabs-6 + context-3, context sticky.
15. **Plan-07 / D1 / video-D1 comment blocks** present verbatim in `ArtifactsTab`. Diff-grep them — none should be missing.

### Failure modes pre-flagged for the impl chat

1. **Highest risk** — preserving the post-call surfaces and their comment blocks. The original `Plan 07 · Task 29`, `Plan 07 · Task 31`, and `Sub-batch D · task-video-D1` JSDoc blocks are gold and must be carried verbatim into `ArtifactsTab`.
2. **`MarkCompletedForm` belongs in Consult, not Prescriptions.** Easy to misplace since it currently sits below the Rx form in `AppointmentConsultationActions`.
3. **`?tab=` deep-link must use `router.replace({ scroll: false })`** — `push` would pollute back-button history.
4. **`<DoctorOpdSlotActions>` mounts in TWO places** (Overview tab + ContextColumn). It self-hides when not slot-mode + pending/confirmed; verify by signing in as a non-OPD doctor — neither location should render anything.
5. **Tabs primitive needs `"use client"`.** Putting Tabs directly in `page.tsx` will silently fail at build because the file is a server component (uses `await params`, `redirect`, server `createClient`).

### Status

- **Spec status:** locked 2026-05-06 by Opus design pass.
- **Impl status:** not started. Recommended model: Sonnet 4.6 Medium in a fresh chat. Prompt: *"Open `task-ui-D1-appointment-detail-three-zone.md`. Implement per the locked spec section. Do not summarize the preserved Plan-07 comments. Run the verification checklist before marking done."*

---

## Out of scope

- **Patient-detail page** — that's D2.
- **List page reskin** — that's D3.
- **Chart rail behavior changes** — token reskin only.
- **New artifact types in the Artifacts tab.** Use what's there.
- **Tab persistence across patients.** Each appointment has its own `?tab=` state; don't carry across navigation.
- **Refactoring `AppointmentConsultationActions`** — bypassed at use-site, kept as orphan with deprecation comment.
- **Status-Badge primitive variants.** A2 didn't ship `success` / `warning` / `info` Badge variants; D1 inlines token classes via `className` on `<Badge variant="outline">`. Adding variants is a separate primitive task.

---

## Files expected to touch

**Frontend:**
- `frontend/app/dashboard/appointments/[id]/page.tsx` — **major edit** (~300 LOC; restructure into 3-zone + tabs).
- `frontend/components/ehr/AppointmentChartRail.tsx` — **edit** (token reskin only).
- `frontend/components/consultation/AppointmentConsultationActions.tsx` — **probably no edit** (mounts inside Consult tab; verify it doesn't depend on parent layout).
- `frontend/components/consultation/CallPostCallSummary.tsx` — **probably no edit** (mounts inside Artifacts tab).
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — **probably no edit**.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Why Tabs over Accordion.** Doctors land on this page with one intent (start consult / write Rx / review artifacts). Tabs make the intent explicit; accordion lets users open multiple at once which dilutes focus. Lock decision: Tabs.
2. **Default tab.** `Overview` for safety. Once we have telemetry on which tab gets picked first, consider switching default to `Consult` for active or future sessions, `Artifacts` for ended sessions, `Prescriptions` for completed-no-Rx-yet. V1.1 enhancement.
3. **Tab deep-linking via search param vs path segment.** Search param keeps the route surface flat; doctors landing on `/dashboard/appointments/<id>` without a tab still get a sane default.
4. **Sticky context column.** `sticky top-20` only sticks within its scroll container; the cockpit-style layout already gives `<main>` `overflow-auto` so this works. Verify in dev.
5. **No new "Send Rx" surface from D1's header.** Rx send happens inside the Prescriptions tab. Don't replicate it elsewhere.
6. **All comments preserved.** The existing page has detailed Plan-07 references in JSDoc form. Carry them forward; they document WHY those surfaces exist.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch D](../plan-ui-system-redesign-batch.md#sub-batch-d--reference-page-redesigns-3-items-15-days)
- **Source items:** [U4.1](../../../../Product%20plans/plan-ui-system-redesign.md#u41--appointment-detail-3-zone-layout), [U4.2](../../../../Product%20plans/plan-ui-system-redesign.md#u42--appointment-detail-tabs)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** D2 (patient detail — inherits this pattern), D3 (list-page pattern)
- **Reuses:** [`AppointmentChartRail`](../../../../../frontend/components/ehr/AppointmentChartRail.tsx), [`AppointmentConsultationActions`](../../../../../frontend/components/consultation/AppointmentConsultationActions.tsx), [`CallPostCallSummary`](../../../../../frontend/components/consultation/CallPostCallSummary.tsx), [`ConsultArtifactsPanel`](../../../../../frontend/components/consultation/ConsultArtifactsPanel.tsx), [`PreviousPrescriptions`](../../../../../frontend/components/consultation/PreviousPrescriptions.tsx), [`PrescriptionForm`](../../../../../frontend/components/consultation/PrescriptionForm.tsx).
- **Cost-aware model strategy — Pattern B (split design / impl):** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § Pattern B](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-b-new-feature--no-spec-yet)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Design locked 2026-05-06 (Opus design pass). Impl pending — kick off a fresh Sonnet 4.6 chat with this file as the brief.
