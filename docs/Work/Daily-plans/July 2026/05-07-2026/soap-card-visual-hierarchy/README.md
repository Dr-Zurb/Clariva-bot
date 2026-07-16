# SOAP card visual hierarchy — 05 Jul 2026 program

> **Why this exists.** The subjective and objective tabs nest collapsible cards 3–4 levels deep (section → cluster → card → entry). Until now every level below the top rendered on the same white surface (`--card` = `--background`), separated only by a 1px border, so a doctor scrolling a deep, all-open section loses track of "where am I / which card owns this field". Sticky headers help, but on their own the boundaries still dissolve.
>
> **What shipped already (proof of concept, DONE 2026-07-05).** Social / personal history now uses an **opt-in depth-tone system**: levels alternate a recessed tint (`bg-muted/30`) and a raised card (`bg-card`), each nested card gets a neutral left accent rail, and pinned headers stay opaque. Implemented as a `CollapsibleDepth` React context consumed by `CollapsibleContainer` + `CollapsibleEntryCard` (`frontend/components/ui/sticky-stack.tsx`), enabled with a single `depthTone` prop on the section root. It landed well; this program extends the same visual language to the rest of both tabs and unifies the surfaces so the whole SOAP form reads as one system.

---

## The one-sentence goal

> **Extend the opt-in depth-tone + left-rail cue to every nested area of the subjective and objective tabs (chief complaints, PMH/allergies/family, custom subsections, and — deliberately scoped — the exam systems), unify the drifting muted-tint tokens and hand-rolled sticky-header treatments into one shared surface language, and layer optional category color / section icons on top — all view-only, no palette change, no behaviour/scroll/derivation change, tests + parity green.**

---

## Decision lock (freezes on promotion)

- **VH-D1 — View-only, no palette change.** Purely presentational (surface tone, rail, spacing, optional icon/color-accent). No data, no logic, no scroll/derivation change. Honors the locked palette (`globals.css` UI-D3): **status colors stay in chips/banners, never as a card background**.
- **VH-D2 — Tonal alternation + neutral rail is the core cue.** Depth alternates recessed tint ↔ raised card; each nested card carries a neutral `border-l-primary/30` rail. This is the primary "where am I" signal and ships before any hue work. Category color is **additive and L1-only** (Phase 4), never the base mechanism.
- **VH-D3 — Opt-in via context, never a forced global flip.** The `CollapsibleDepth` context stays `null` (off) by default. A section root opts in (`depthTone` on `CollapsibleContainer`, or an explicit call to a shared surface hook in a bespoke card). Unrelated surfaces are untouched unless a task lists them.
- **VH-D4 — One canonical tint ladder + one shared surface helper.** Replace the drifting `bg-muted/10 · /15 · /20 · /25 · /30` values with a single ladder, and extract the tone/rail decision into a shared hook (e.g. `useDepthToneSurface()`) so bespoke cards opt in with one line instead of duplicating class logic.
- **VH-D5 — Accessibility: never color-only.** Distinction is always conveyed by more than hue (tone + rail + shadow/elevation), matching the existing cockpit "active state is not color-only" decision. Both light and dark themes must hold (all surfaces are tokenised).
- **VH-D6 — Parity: no visual regression outside opted-in areas; no test/behaviour change.** Existing collapse/scroll/sticky behaviour and all snapshot/parity suites stay green. Exam derivation + layout parity are invariants.

---

## Canonical depth-tone ladder (vh-01)

Downstream tasks must use **only** these values (exported from `frontend/components/ui/sticky-stack.tsx`):

| Role | Class | Notes |
|---|---|---|
| Recessed well (even depth) | `bg-muted/30` | `DEPTH_TONE_RECESSED_SURFACE` |
| Raised card (odd depth) | `bg-card` | `DEPTH_TONE_RAISED_SURFACE` |
| Left accent rail (depth ≥ 1) | `border-l-2 border-l-primary/30` | `DEPTH_TONE_RAIL` |

**Section-root baseline:** depth tone is **not** applied at the tab wrapper (`SubjectiveSection` / `ObjectiveSection`). Each major field opts in on its own root `CollapsibleContainer` via `depthTone` (Social History already does). Later tasks (vh-02 chief complaints, vh-03 exam) opt in the same way.

**Off-state surfaces** (when depth context is `null`) stay as-is per component — e.g. top-level sections use `bg-muted/20`, subsections use `bg-card`, entry cards use `bg-background`. These are not part of the depth ladder.

---

## What this program does NOT do (deferred)

| Item | Why / where it lands |
|---|---|
| Any change to the locked palette tokens in `globals.css` | VH-D1 — presentational reuse of existing tokens only. |
| Saturated colored card backgrounds | VH-D1 / UI-D3 — status color stays in chips/banners. |
| New collapse / scroll / sticky behaviour | VH-D6 — behaviour is frozen; this is surface-only. |
| Exam derivation / layout / data-model changes | VH-D6 — parity invariant (mirrors the teleconsult-exam parity gate). |
| Rich category theming beyond L1 rail + count pill | Phase 4 keeps color minimal + meaningful; deeper theming is a follow-up if desired. |

---

## Phase / batch

Single batch — [`plan-soap-card-visual-hierarchy-batch.md`](./plan-soap-card-visual-hierarchy-batch.md) · exec order [`Tasks/EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./Tasks/EXECUTION-ORDER-soap-card-visual-hierarchy.md).

| Task | Title | Size | Model |
|---|---|---|---|
| `vh-01` | Consistency pass: canonical tint ladder + shared `useDepthToneSurface()` helper; reconcile top-level SOAP section roots | S–M | Sonnet |
| `vh-02` | Chief-complaints depth cue (`ComplaintList` → `ComplaintCard` → associated cards read the depth context) | M | Sonnet |
| `vh-03` | Exam depth cue across the bespoke exam cards (`ExamSystemCard` → `ExamSubsectionCollapsible` → finding cards) | M–L | **Opus** (5+ file bespoke refactor) |
| `vh-04` | Orthogonal enhancements: L1-only category color + section icons + depth-aware sticky-stack shadow | S–M | Sonnet |
| `vh-05` | Close gate: light/dark visual QA + a11y (not color-only) + `tsc`/lint/test parity | S | Sonnet |

**Model note (agent contract):** `vh-03` trips the "5+ file refactor" rule (it edits every bespoke exam card) → **Opus**. No migration, no PHI, no RLS ⇒ no schema/data escalation. ≤1 Opus in the batch.

---

## Where it will be built (current code)

- **Depth-tone engine (already built):** `frontend/components/ui/sticky-stack.tsx` (`CollapsibleDepthContext`, `useCollapsibleDepth`, `CollapsibleDepthProvider`); consumers `frontend/components/ui/CollapsibleContainer.tsx`, `frontend/components/cockpit/rx/inputs/CollapsibleEntryCard.tsx`.
- **Proof of concept (reference):** `frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx` (`depthTone` on the root).
- **Chief complaints (vh-02):** `frontend/components/cockpit/rx/subjective/ComplaintList.tsx`, `ComplaintCard.tsx`, `AssociatedComplaintsPanel.tsx`.
- **Exam (vh-03):** `frontend/components/cockpit/rx/inputs/ExamSystemCard.tsx`, `ExamSubsectionCollapsible.tsx`, the finding cards (`ExamCvsFindingCard.tsx`, `ExamCnsFindingCard.tsx`, `ExamRespFindingCard.tsx`, `ExamAbdFindingCard.tsx`, `ExamGeneralFindingCard.tsx`) + chip-group cards.
- **Section chrome / icons (vh-04):** `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx`, `ObjectiveSection.tsx`.
- **Tokens:** `frontend/app/globals.css` (read-only reference — no edits per VH-D1).

---

## Promotion note

If promoted to a formal program, register under `docs/Work/Product plans/ehr/` alongside the objective-tab / subjective-tab plans and cross-link. Until then this daily-plan batch is the source of truth.

---

**Created:** 2026-07-05. **Status:** vh-01..05 implemented — batch close gate green (2026-07-05). **Pattern:** opt-in depth-tone context over the shared collapsible components + a consistency pass over bespoke card surfaces.
