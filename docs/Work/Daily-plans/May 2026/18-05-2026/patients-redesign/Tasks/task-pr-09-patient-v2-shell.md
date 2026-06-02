# Task pr-09: `PatientV2Shell` — identity strip + dot breadcrumb + 7-tab framework

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 4, Lane α step 0 — **M, ~5h**

---

## Task overview

Land the entire detail-page shell at `/dashboard/patients-v2/[id]`. After this task ships, the page renders:

1. **Identity strip** (DL-7) — avatar, name, demographics chip, condition / allergy pill row (≤ 3 visible, "+N more" overflow), MRN row, Book-consult `SplitStartButton` (reused from the cockpit header), kebab with Edit / Merge / Audit log / Export PDF / Delete.
2. **6-visit dot breadcrumb** (DL-8) — six dots colored by status with modality icon overlay, click jumps to `?tab=visits&visit=<id>`, hover surfaces date + status + modality + chief complaint.
3. **Tab framework** (DL-2, DL-3) — mounts the recursive `<PatientProfileShell>` from cv2-01 with a `PaneDefinition[]` of 7 tabs (Overview, Visits, Conversations, Rx, Vitals, Files, Audit). Each tab's `render` initially returns a `<TabPlaceholder>` — Wave 5 fills them.
4. **URL-backed tab state** via `?tab=…`.
5. **Per-patient layout storage key** `patient-v2/<patientId>/layout`.

The identity strip primitives come from the cockpit-header's `PatientProfileHeader.tsx` (cp-09). DL-7 forbids importing the header itself (it's appointment-scoped and renders the queue rail), but allows factoring `SplitStartButton` + the demographics-formatting helpers + the kebab pattern into shared utilities (or copying the small parts inline — task picks).

This is the largest task in the batch outside pr-03. Most of the LOC is composition + JSX; no novel architecture.

**Estimated time:** ~5h (1h identity strip + 30min dot breadcrumb + 1h tab framework + 30min URL state + 1h `SplitStartButton` factoring + 30min storage / page-state wiring + 30min verification).

**Status:** Done.

**Hard deps:** pr-01 (types), pr-04 (`getPatientOverview` for the six-visit strip + condition / allergy chip pills), ppr-03 (the shell foundation), cv2-01 (the recursive shell — though this task only consumes the flat `PaneDefinition[]` shape).

**Source:** [plan-patients-redesign-batch.md § Wave 4](../plan-patients-redesign-batch.md#wave-4--detail-shell-1-task-5h-single-sequential-lane) + DL-2, DL-3, DL-7, DL-8.

---

## Model & execution guidance

**Recommended model:** Auto. Composition-heavy, reuse-heavy. The trickiest piece is the `SplitStartButton` factoring — the cockpit header's variant is appointment-scoped and the patient-page variant needs to be patient-scoped (no appointment yet). Factor the shared UI shell (the split-button + dropdown structure) into a reusable component; let each consumer supply its own action handlers.

**Per-message escalation rule:** Escalate to Opus only if the cockpit-header's `SplitStartButton` proves to have appointment-state coupling that resists factoring cleanly (e.g. it reads `appointment.status` from context). The task spec proposes copying the small parts inline as the safe fallback.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/components/patient-profile/Shell.tsx` (the shell this task mounts).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer pattern — read `<PatientProfileShell panes={…} storageKey={…} />` mount).
- `frontend/components/patient-profile/PatientProfileHeader.tsx` (DL-7 source — read `SplitStartButton` at ~line 963, `formatDemographics`, `KebabMenu` pattern).
- `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` contract).
- `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientOverview` for the six-visit strip).
- `frontend/types/patient.ts` (post-pr-01 — `PatientSixVisitStripEntry`).
- `frontend/components/patients/PatientCockpit.tsx` (v1 — visual reference for the rail / kebab structure being replaced; do not import).
- `frontend/components/ui/avatar.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `badge.tsx`.
- Source plan §DL-2, §DL-3, §DL-7, §DL-8.

**Estimated turns:** 5–7 turns.

---

## Acceptance criteria

### Step 1 — `<PatientIdentityStrip>` sub-component

- [x] **New file** `frontend/components/patients-v2/PatientIdentityStrip.tsx` (~250 LOC). Props:

  ```ts
  interface PatientIdentityStripProps {
    patient: Patient;
    overview: PatientOverviewData | null;       // null while loading
    onAction: (action: PatientHeaderAction) => void;
  }

  type PatientHeaderAction =
    | { type: 'book_consult'; modality: ConsultationModality }
    | { type: 'edit' }
    | { type: 'merge' }
    | { type: 'audit_log' }
    | { type: 'export_pdf' }
    | { type: 'delete' };
  ```

- [x] **Layout** — two-row layout matching the cockpit header pattern:
  - **Row 1** — Left: `<Avatar>` (initials), then name (`text-xl font-semibold`), then condition/allergy pill row (up to 3 chips + `"+N more"` overflow tooltip showing the rest). Right: `<SplitStartButton>` for Book consult (default: Video; dropdown: Voice / Text / In-clinic) + `<KebabMenu>` for the secondary actions.
  - **Row 2** — Left: `{demographics_chip} · MRN: {mrn} · Phone: {masked_phone}` (each separated by `·` dividers). Right: the 6-visit dot breadcrumb (next sub-component).

- [x] **Condition / allergy chip rules:**
  - Each chip = `<Badge variant="outline">{label}</Badge>`.
  - Allergies first (color: `border-destructive/40 text-destructive`), then chronic conditions (`border-amber-200 text-amber-800`), then active problems (`border-muted-foreground/40`).
  - Truncate `label` to 32 chars + `…`.
  - Cap visible at 3; render `"+N more"` chip at the end with a `<Tooltip>` showing the full list.

- [x] **`SplitStartButton`** — factor from the cockpit header OR copy inline. If factoring, create `frontend/components/patient-profile/SplitStartButton.tsx` as a generic component:
  ```tsx
  interface SplitStartButtonProps<TOption extends string> {
    primary: TOption;
    options: ReadonlyArray<{ value: TOption; label: string; icon?: React.ReactNode }>;
    onAction: (option: TOption) => void;
    label?: string;        // e.g. "Book consult" or "Start consult"
    disabled?: boolean;
  }
  ```
  Both consumers (cockpit header `Start consult` AND patient strip `Book consult`) supply their own option list. **Tradeoff:** factoring touches the cockpit header file (one more file modified, more review surface); inline-copying duplicates ~60 LOC. Task picks; favors factoring if the cockpit-header file is < 1,500 LOC, else inline.

- [x] **`KebabMenu`** — use `<DropdownMenu>` with `<DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical /></Button></DropdownMenuTrigger>`. Items: Edit / Merge / Audit log / Export PDF / Delete. Edit / Delete / Export PDF are Phase 2 wirings (in Phase 1 they show a toast "Coming soon"); Merge opens the existing `MergePatientsModal` with this patient pre-selected; Audit log opens the Audit tab in the tab strip.

### Step 2 — `<SixVisitDotBreadcrumb>` sub-component

- [x] **New file** `frontend/components/patients-v2/SixVisitDotBreadcrumb.tsx` (~120 LOC). Props:

  ```ts
  interface SixVisitDotBreadcrumbProps {
    visits: PatientSixVisitStripEntry[];     // newest first, max 6 (from overview.six_visit_strip)
    onVisitClick: (appointmentId: string) => void;
  }
  ```

- [x] **Layout** — horizontal row of 6 dots. Each dot is a `<button>` rendering:
  - Outer circle (12px) colored by status:
    - `completed` → `bg-success`
    - `confirmed` / `in_progress` → `bg-primary`
    - `cancelled` → `bg-muted-foreground/40`
    - `no_show` → `bg-destructive`
    - other → `bg-muted`
  - Inner modality icon (8px, white): `Video` / `Mic` / `MessageSquare` / `Phone` (in-clinic).
  - When `visits.length < 6`, render `6 - visits.length` placeholder hollow dots to the right (visual continuity).
- [x] **Tooltip on hover** — Radix `<Tooltip>` with content:
  - Line 1: relative date ("3 days ago", "2 months ago")
  - Line 2: `{modality} · {status}`
  - Line 3: chief complaint (truncated at 80 chars) or "—" when null
- [x] **Click** fires `onVisitClick(appointmentId)`. The shell's parent handler navigates to `?tab=visits&visit=<id>`.
- [x] **Keyboard**: Tab focuses each dot; Enter fires the click.

### Step 3 — `<PatientV2Shell>` main composition

- [x] **New file** `frontend/components/patients-v2/PatientV2Shell.tsx` (~250 LOC). Props:

  ```ts
  interface PatientV2ShellProps {
    patient: Patient;
    token: string;
    userId: string | undefined;
  }
  ```

- [x] **State**:
  - `overview: PatientOverviewData | null` — fetched via `getPatientOverview(token, patient.id)` on mount.
  - URL search params for `tab` and `visit` (via `useSearchParams` + `useRouter`).
  - Local `error` for the overview fetch.

- [x] **`PaneDefinition[]` builder** — declare the 7 tabs as a memoised value:

  ```ts
  const PATIENT_V2_TABS: ReadonlyArray<{ id: string; title: string; icon: React.ReactNode }> = [
    { id: 'overview',      title: 'Overview',      icon: <LayoutDashboard /> },
    { id: 'visits',        title: 'Visits',        icon: <CalendarDays /> },
    { id: 'conversations', title: 'Conversations', icon: <MessageCircle /> },
    { id: 'rx',            title: 'Rx',            icon: <Pill /> },
    { id: 'vitals',        title: 'Vitals',        icon: <Activity /> },
    { id: 'files',         title: 'Files',         icon: <FileText /> },
    { id: 'audit',         title: 'Audit',         icon: <ShieldCheck /> },
  ] as const;

  const panes: PaneDefinition[] = useMemo(() => PATIENT_V2_TABS.map(t => ({
    id: t.id,
    title: t.title,
    icon: t.icon,
    minSizePct: 25,                // each tab is full-width when active; minSize is academic for tabs
    naturalSizePct: 100 / PATIENT_V2_TABS.length,
    canCollapse: false,
    render: () => activeTab === t.id ? renderTabContent(t.id) : null,
    collapsedRender: () => null,
  })), [activeTab, overview, patient]);
  ```

  **`renderTabContent(tabId)` returns `<TabPlaceholder name={…} />` in this task.** Wave 5's pr-10 / pr-11 / pr-12 modify this function to render their real tab components.

- [x] **Mount `<PatientProfileShell>`** with the panes + the per-patient storage key:

  ```tsx
  <PatientProfileShell
    panes={panes}
    storageKey={`patient-v2/${patient.id}/layout`}
  />
  ```

  Tabs in Phase 1 are not the shell's primary axis — the shell renders all panes side-by-side and the doctor switches tabs via a row of tab triggers ABOVE the shell. The shell itself is rendered with only the active pane visible (the inactive panes render `null` via their `render`). This is a deliberate simplification: full tab-as-shell-pane would require the shell to know which pane to show, which is out of its content-agnostic mandate. Phase 2 may revisit.

- [x] **Tab triggers** — render a `<TabList>` row between the identity strip and the shell:
  ```tsx
  <div role="tablist" className="border-b flex gap-1 px-4">
    {PATIENT_V2_TABS.map(tab => (
      <button
        key={tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        onClick={() => setTab(tab.id)}
        className={cn(
          'px-3 py-2 text-sm font-medium border-b-2',
          activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )}
      >
        {tab.icon}<span className="ml-2">{tab.title}</span>
      </button>
    ))}
  </div>
  ```
  - Telemetry on tab click: `patients_v2.tab_opened` with `{tab_id, patient_id}`.

- [x] **`<TabPlaceholder>`** — new file `frontend/components/patients-v2/TabPlaceholder.tsx` (~30 LOC):
  ```tsx
  export function TabPlaceholder({ name }: { name: string }) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <p className="text-lg font-medium">{name} tab — coming soon</p>
        <p className="text-sm">Wave 5 lights this up.</p>
      </div>
    );
  }
  ```

### Step 4 — Mount the shell into `<PatientV2Page>`

- [x] **Replace** the placeholder in `frontend/components/patients-v2/PatientV2Page.tsx` (pr-01's empty island) with:

  ```tsx
  'use client';
  import { PatientV2Shell } from './PatientV2Shell';

  export function PatientV2Page({ patient, token, userId }: { patient: Patient; token: string; userId?: string }) {
    return <PatientV2Shell patient={patient} token={token} userId={userId} />;
  }
  ```

### Step 5 — URL-backed tab state

- [x] **Active tab source-of-truth = URL `?tab=`.** Default = `overview`. Invalid value falls back to default.
- [x] **Setting the tab** via the tab-trigger click uses `router.replace(`?tab=${tabId}`, { scroll: false })`.
- [x] **The `?visit=` param** (from the dot-breadcrumb click) is consumed by pr-11's Visits tab — this task just ensures the param is preserved when switching to Visits.

### Step 6 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `/dashboard/patients-v2/<patientId>` renders:
  - Identity strip with avatar, name, demographics, condition/allergy pills (verify a patient with ≥ 1 allergy + ≥ 1 condition shows ≤ 3 chips + `+N more` if there are more).
  - Book consult split button — clicking the primary Book consult should toast "Coming soon: Video consult" (Phase 2 wires actual booking); the dropdown reveals the 3 other modalities.
  - Kebab with 5 items; Merge opens `MergePatientsModal`; Audit log switches tab to `audit`.
  - 6 dots (or fewer + placeholder hollow dots), colored by status, modality icon visible. Hovering shows the tooltip.
  - 7 tab triggers; clicking any switches the active pane to a `<TabPlaceholder>`.
- [x] **URL syncs** with the active tab; deep-linking to `?tab=vitals` mounts the Vitals placeholder on first load.
- [x] **Per-patient storage key** — modify layout on Patient A's page → navigate to Patient B's page → Patient B's layout is independent. localStorage shows two distinct `patient-v2/<id>/layout` keys.
- [x] **Telemetry** — `patients_v2.tab_opened` fires once per tab click.

---

## Out of scope

- **Real tab content.** Wave 5 (pr-10, pr-11, pr-12).
- **Booking from the patient page.** Clicking Book consult shows a toast; Phase 2 wires the real `AddAppointmentModal`.
- **Edit patient inline.** Phase 2.
- **Delete patient.** Phase 2 (needs confirmation flow + audit + downstream cleanup — non-trivial).
- **Export PDF.** Phase 2 (needs a server-side PDF generation endpoint per patient).
- **Drag-to-reorder tabs.** Tab order is fixed in Phase 1.
- **Customisable per-patient tab visibility.** Phase 2.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/PatientV2Shell.tsx` (~250 LOC).
- `frontend/components/patients-v2/PatientIdentityStrip.tsx` (~250 LOC).
- `frontend/components/patients-v2/SixVisitDotBreadcrumb.tsx` (~120 LOC).
- `frontend/components/patients-v2/TabPlaceholder.tsx` (~30 LOC).
- Conditionally: `frontend/components/patient-profile/SplitStartButton.tsx` (~100 LOC — only if the factoring path is chosen).

**Modified:**

- `frontend/components/patients-v2/PatientV2Page.tsx` (~10 LOC delta — replace placeholder with the shell mount).
- Conditionally: `frontend/components/patient-profile/PatientProfileHeader.tsx` (~80 LOC delta — only if `SplitStartButton` is factored out).

**Read but do not modify in this task:**

- `frontend/components/patient-profile/Shell.tsx` (the shell being mounted; pure consumer).
- `frontend/lib/patient-profile/types.ts` (consumer).
- `frontend/components/patients/PatientCockpit.tsx` (v1 visual reference).

---

## Notes / open decisions

1. **Why mount tabs as panes that conditionally render `null`?** The shell is content-agnostic; it doesn't know what a tab is. Rendering all panes but having only the active one show its content is the cheapest way to bolt a tab UI on top without modifying the shell. Phase 2 may introduce a `<TabbedShell>` variant if the pattern gets repeated.

2. **Why URL-back the tab state?** Doctors share links ("review this patient's vitals"). The link should land on the right tab. Local-only tab state would require an in-tab JS handler to be useful.

3. **Why per-patient storage key?** A doctor might want to see a chronic-disease patient's Vitals tab by default but a new patient's Overview tab by default. Per-patient layout (and, in Phase 2, per-patient default tab) supports this.

4. **The SplitStartButton factoring — when to inline-copy instead?** If `frontend/components/patient-profile/PatientProfileHeader.tsx` is ≥ 1,500 LOC, modifying it to extract the split button risks merge conflicts with concurrent cv2 work. In that case, copy ~60 LOC inline into `PatientIdentityStrip.tsx` with a `// TODO(phase-2-factor):` comment.

5. **Why no `<RightRail>` like the v1 page?** The Overview tab (pr-10) absorbs the right-rail content into its right column. The right rail was duplicate of the in-cockpit chart panel; the Overview tab tells the story better.

6. **Why is the dot breadcrumb in the identity strip, not below the tab list?** Identity is "who is this patient"; visit history is part of who. Mixing it with the tab list (which is "what view do I want") confuses the two axes.

7. **The "+N more" condition / allergy chip overflow — interactive?** Phase 1 = tooltip (hover only). Phase 2 may make the overflow chip clickable to expand inline.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-2 (reuse shell)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-3 (tab inventory)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-7 (identity-strip reuse)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-8 (dot breadcrumb)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 4 gate](./EXECUTION-ORDER-patients-redesign.md#wave-4-gate-after-pr-09).
- **Predecessor batches:** [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild](../../../13-05-2026/patient-profile-shell-rebuild/) (the shell foundation), [Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/task-cp-09-cockpit-header-two-row-layout.md](../../../09-05-2026/cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md) (the cockpit-header two-row layout this strip mirrors).
- **Next task:** [`task-pr-10-patient-overview-tab.md`](./task-pr-10-patient-overview-tab.md) — Wave 5, Lane α step 0.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done
