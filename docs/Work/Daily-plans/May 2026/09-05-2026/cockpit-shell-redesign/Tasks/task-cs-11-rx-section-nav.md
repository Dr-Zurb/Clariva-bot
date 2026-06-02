# Task cs-11: Sticky section-nav chip strip at the top of `<RxWorkspace>`

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase C, Lane γ — **M, ~2.5h**

---

## Task overview

After [`cs-07`](./task-cs-07-cockpit-shell-fixed-height.md) makes the Rx column scroll independently, navigating a long prescription form within that column becomes the doctor's frequent action — they're typing in Symptoms, then jumping to Medicines, then back to Vitals. With the body column staying anchored on the patient (cs-07's win), the only friction is *scrolling* the Rx column itself.

cs-11 adds a sticky chip strip at the top of `<RxWorkspace>`:

```
[Symptoms] [Vitals] [Diagnosis] [Medicines (2)] [Tests] [Notes]
```

- Click a chip → the Rx column scrolls to that section's anchor.
- The active chip (the section currently in view) is visually emphasized.
- The strip is sticky to the top of the Rx column's scroll region — always visible while scrolling.
- Each chip shows a count when applicable (e.g. `Medicines (2)` if the Rx has 2 medicines).

This is a small but high-impact UX win — the kind of nav doctors expect from EHRs but didn't have here yet.

**Estimated time:** ~2.5h.

**Status:** Pending.

**Hard deps:** [`cs-07`](./task-cs-07-cockpit-shell-fixed-height.md) — needs the per-column scroll context to be the right place for the sticky.

**Source:** [plan-cockpit-shell-redesign-batch.md § Phase C](../plan-cockpit-shell-redesign-batch.md#phase-c--polish-3-tasks-3h-3-parallel-lanes).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (the wrapper of `<PrescriptionForm>`).
- `frontend/components/consultation/PrescriptionForm.tsx` (the section structure — read enough to see how sections are delineated. Likely `<section>` tags or `<div>` regions per logical block).
- `frontend/components/consultation/cockpit/__tests__/RxWorkspace.test.tsx` (if present).

**Estimated turns:** 3 turns.

---

## Acceptance criteria

### Section anchors in `<PrescriptionForm>`

- [ ] In `<PrescriptionForm>`, ensure each logical section has an `id` on its outer wrapper:
  ```tsx
  <section id="rx-symptoms" aria-label="Symptoms">…</section>
  <section id="rx-vitals" aria-label="Vitals">…</section>
  <section id="rx-diagnosis" aria-label="Diagnosis">…</section>
  <section id="rx-medicines" aria-label="Medicines">…</section>
  <section id="rx-tests" aria-label="Tests">…</section>
  <section id="rx-notes" aria-label="Notes">…</section>
  ```
  - **If the sections already have ids, reuse them.** Just confirm the convention is `rx-<sectionname>`.
  - **If the form has different sections than this list,** match what's actually rendered. The chip list must mirror the form's actual structure.

### Chip strip component

- [ ] Create `frontend/components/consultation/cockpit/RxSectionNav.tsx`:

  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { cn } from '@/lib/utils';

  type Section = { id: string; label: string; count?: number };

  export function RxSectionNav({
    sections,
    scrollContainerRef,
  }: {
    sections: Section[];
    scrollContainerRef: React.RefObject<HTMLElement | null>;
  }) {
    const [activeId, setActiveId] = useState(sections[0]?.id);

    // IntersectionObserver to track which section is in view
    useEffect(() => {
      const root = scrollContainerRef.current;
      if (!root) return;
      const observer = new IntersectionObserver(
        (entries) => {
          // Pick the most-visible section in the viewport
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0]) setActiveId(visible[0].target.id);
        },
        { root, threshold: [0.1, 0.5, 0.9], rootMargin: '-40px 0px -40% 0px' },
      );
      sections.forEach(({ id }) => {
        const el = root.querySelector(`#${id}`);
        if (el) observer.observe(el);
      });
      return () => observer.disconnect();
    }, [sections, scrollContainerRef]);

    const handleClick = (id: string) => {
      const root = scrollContainerRef.current;
      if (!root) return;
      const target = root.querySelector(`#${id}`) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
      <nav
        className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-background px-3 py-2"
        aria-label="Prescription sections"
      >
        {sections.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleClick(id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeId === id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted',
            )}
          >
            {label}{typeof count === 'number' ? ` (${count})` : ''}
          </button>
        ))}
      </nav>
    );
  }
  ```

  - **`scrollContainerRef`** is a ref to the scrolling `<aside>` from cs-07. The `IntersectionObserver` watches sections relative to that scroll context, not the page.
  - **`rootMargin: '-40px 0px -40% 0px'`** biases the active-section detection toward "the section the doctor is reading" rather than "the section that's barely in view at the bottom".
  - **Smooth scroll** for the click handler. Reduced-motion users get instant scroll via `prefers-reduced-motion` (the browser handles this when `behavior: 'smooth'`).

### Wire into `<RxWorkspace>`

- [ ] In `<RxWorkspace>`:
  ```tsx
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // pass scrollRef to the parent <aside> via a forwarded ref OR use a
  // wrapper div inside <RxWorkspace> that itself becomes the scroll root.
  ```
  - **Trade-off:** the cs-07 shell makes the `<aside>` (the column) the scroll container. To get a ref to it, either:
    - Forward `scrollRef` up to `<ConsultationCockpit>` (clean but more plumbing).
    - Or wrap the Rx workspace's content in a dedicated scroll div inside `<RxWorkspace>` and put the ref on that. The outer aside is still part of the column flex but doesn't scroll itself; the inner div does.
  - **Recommendation:** the wrapper-inside approach. Less prop-drilling. Refactor cs-07's shell so that the column `<aside>` is `flex flex-col h-full` (no `overflow-y-auto`), and `<RxWorkspace>` contains a top-level `<div ref={scrollRef} className="flex-1 overflow-y-auto">…</div>`. The chip strip is sibling to that scroll div, sticky outside.

  Actually re-think: the chip strip should be **sticky inside** the column scroll, so it stays visible *as the column scrolls*. So the structure is:

  ```tsx
  <aside className="flex flex-col h-full">
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <RxSectionNav sections={…} scrollContainerRef={scrollRef} />
      <PrescriptionForm … />
    </div>
  </aside>
  ```

  The `<RxSectionNav>` is `sticky top-0` *within* the scroll div — it stays at the top of the column as the form scrolls below it.

### Section list with counts

- [ ] Compute counts from the form state. Likely `<RxWorkspace>` has access to the `prescription` object (medicines count, tests count). Pass:
  ```tsx
  <RxSectionNav
    scrollContainerRef={scrollRef}
    sections={[
      { id: 'rx-symptoms', label: 'Symptoms' },
      { id: 'rx-vitals', label: 'Vitals' },
      { id: 'rx-diagnosis', label: 'Diagnosis' },
      { id: 'rx-medicines', label: 'Medicines', count: prescription.medicines?.length },
      { id: 'rx-tests', label: 'Tests', count: prescription.tests?.length },
      { id: 'rx-notes', label: 'Notes' },
    ]}
  />
  ```
  - Counts on Medicines and Tests; the others are single-instance sections.
  - Skip the `count: 0` display (chip just shows "Medicines" if length is 0). Don't show "Medicines (0)".

### A11y

- [ ] `<nav aria-label="Prescription sections">` — landmark for screen reader nav.
- [ ] Each chip is a focusable button; keyboard nav (Tab + Enter) works.
- [ ] When a chip is clicked, focus stays on the chip (don't shift focus into the section content) — the doctor may want to chip-click again after a quick scan.

### Tests

- [ ] Add `frontend/components/consultation/cockpit/__tests__/RxSectionNav.test.tsx`:
  - Renders a nav with one button per section.
  - Click a button → calls `scrollIntoView` on the corresponding section. Mock `scrollIntoView`.
  - Active section visually highlighted (assert `bg-primary` class or the equivalent).
- [ ] If `RxWorkspace.test.tsx` exists, add a smoke that the nav is rendered.

### Manual verification

- [ ] Open the cockpit in `inCall` state. The Rx column shows the chip strip at the top.
- [ ] Type into Symptoms. Confirm the strip stays visible as you scroll the form.
- [ ] Click `Medicines`. The Rx column smooth-scrolls to the medicines section.
- [ ] Add 2 medicines manually. The chip updates to `Medicines (2)`.

---

## Out of scope

- **Per-section subtle visual treatments** (icons next to each chip, color coding) — keep the chips text-only for v1.
- **Drag-to-reorder sections** — sections are fixed order.
- **Persisting the active chip** — it's derived state from scroll position.
- **A "back to top" affordance** at the bottom of the form — separate task; possibly not needed if the chip strip is always visible.
- **Chart-rail section nav** — the chart rail's content already has its own structure (Vitals / Allergies / Recent / etc.); cs-11 is Rx-only.

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/RxSectionNav.tsx` (~80 LOC).
- `frontend/components/consultation/cockpit/__tests__/RxSectionNav.test.tsx` (~50 LOC).

**Modified:**
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~20 LOC — add the scroll ref + nav placement).
- `frontend/components/consultation/PrescriptionForm.tsx` (~10 LOC — confirm `id` attributes on each section's outer wrapper).
- `frontend/components/consultation/ConsultationCockpit.tsx` (only if cs-07's column scroll structure needs the small refactor outlined in "Wire into RxWorkspace" — likely none if RxWorkspace owns its own scroll div).

---

## Notes / open decisions

1. **Why `IntersectionObserver` and not a scroll listener?** Performance. `IntersectionObserver` is cheap, declarative, and matches the "highlight active section" pattern across modern docs sites. A scroll listener would fire too often and require manual debouncing.
2. **What if the form is shorter than the column height (no scrolling)?** All sections are simultaneously visible; the active chip stays on the topmost (Symptoms). Acceptable — there's nothing to "navigate" anyway.
3. **Why count only on Medicines / Tests?** They're the multi-row sections — counts give immediate feedback. Symptoms / Vitals / Diagnosis / Notes are single-instance. Adding counts to those would be confusing ("Notes (1)" — was there a note? Always 0 or 1?).
4. **Chip strip overflow on narrow Rx columns.** If the doctor collapses the chart rail and drags the body column to maximum, the Rx column shrinks. The chip strip uses `overflow-x-auto` so it scrolls horizontally if needed. Better than wrapping (which would make the strip take 2 lines and waste vertical space).
5. **Why not also show the chip strip in the chart rail?** The chart rail's content is shorter and structured differently (vitals / allergies / problem list / labs). The doctor's nav pattern there is "scan and read", not "jump-edit". Skip for now; revisit if requested.

---

## References

- **Affected files:**
  - `frontend/components/consultation/cockpit/RxWorkspace.tsx`
  - `frontend/components/consultation/PrescriptionForm.tsx`
- **Predecessor:** [`task-cs-07-cockpit-shell-fixed-height.md`](./task-cs-07-cockpit-shell-fixed-height.md) — independent column scroll is what makes the in-column nav meaningful.
- **shadcn-style chip styling:** existing precedent — see `<CockpitQueueRail>` chip styling for inspiration; reuse the same Tailwind shape so the cockpit feels coherent.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
