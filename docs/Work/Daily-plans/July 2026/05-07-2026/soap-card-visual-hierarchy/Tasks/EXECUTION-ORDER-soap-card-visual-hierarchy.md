# SOAP card visual hierarchy — execution order

> Sibling of [`plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** `vh-01` is the substrate — one canonical tint ladder + a shared `useDepthToneSurface()` helper, and a reconcile of the top-level SOAP section roots so tone starts consistently. `vh-02` opts chief complaints (already on the shared collapsibles) into the cue — cheap. `vh-03` threads the helper by hand through the **bespoke** exam cards (5+ files) and must prove exam parity → Opus. `vh-04` is optional additive polish (L1 category color + icons + depth-aware sticky shadow). `vh-05` closes the light/dark + a11y + verification gate. Mostly linear; `vh-04` is parallelisable/optional.

---

## Wave plan (5 waves)

```
Wave 1 (substrate — ~2–3h):
  vh-01 (canonical recessed/raised ladder; useDepthToneSurface() helper;
         reconcile subjective/objective section roots to a consistent baseline)
        │
        ▼
Wave 2 (~2–3h):
  vh-02 (chief complaints read the depth context: ComplaintList → ComplaintCard →
         AssociatedComplaintsPanel; verify collapse + scroll unchanged)
        │
        ▼
Wave 3 (~3–5h):
  vh-03 (exam depth cue across ExamSystemCard → ExamSubsectionCollapsible →
         finding/chip-group cards; prove exam derivation + layout parity)
        │
        ▼
Wave 4 (~2–3h, OPTIONAL / parallelisable after vh-01):
  vh-04 (L1-only category color accent + section icons + depth-aware sticky shadow)
        │
        ▼
Wave 5 (~1–2h):
  vh-05 (light/dark visual QA + a11y not-color-only + tsc/lint/test parity gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **vh-01** | S–M | Sonnet | `sticky-stack.tsx` (`useCollapsibleDepth`, `CollapsibleDepthProvider`); `CollapsibleContainer.tsx` + `CollapsibleEntryCard.tsx` (current tone logic); the `SocialHistoryField.tsx` reference; `globals.css` tint tokens; grep for `bg-muted/` in `rx/**` | Define the single recessed/raised ladder; extract `useDepthToneSurface()`; sweep the duplicated tone class logic out of the two collapsible consumers into the helper; audit which section roots should carry `depthTone`. **No behaviour change.** |
| W2.0 | vh-02 | M | Sonnet | vh-01 helper; `ComplaintList.tsx`, `ComplaintCard.tsx`, `AssociatedComplaintsPanel.tsx`; `complaint-card-scroll.ts` + its test | Opt chief complaints into the depth context / helper; confirm the collapse-scroll test + `ComplaintList.test.tsx` stay green. Low blast radius → Sonnet. |
| W3.0 | vh-03 | M–L | **Opus** | vh-01 helper; `ExamSystemCard.tsx`, `ExamSubsectionCollapsible.tsx`, the 5 `Exam*FindingCard.tsx`, the `Exam*ChipGroupCard.tsx`; `exam-card-scroll.ts`; `examDerivationParity` / `objectiveLayoutParity` / `ObjectiveSection` suites | Thread the tone/rail through the **bespoke** exam cards (they don't use the shared collapsibles). In-clinic + teleconsult exam **derivation and layout byte-identical**. Opus per the 5+ file rule. |
| W4.0 | vh-04 | S–M | Sonnet | vh-01 helper; `SubjectiveSection.tsx`, `ObjectiveSection.tsx`; `sticky-stack.tsx` (shadow/offset) | **Optional.** L1-only category color accent + section icon; depth-aware sticky-header shadow. Color never becomes a card background (VH-D1/UI-D3). Droppable without touching the core cue. |
| W5.0 | vh-05 | S | Sonnet | vh-01..04 output; existing subjective/objective suites | Light + dark screenshots; assert distinction survives with hue removed (not color-only); `tsc`/lint/test gate (FE). |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| vh-01 | S–M | Sonnet | Token consolidation + one small hook + a root audit; shared components already own the logic. Low blast radius. |
| vh-02 | M | Sonnet | Chief complaints already use the shared collapsibles; opting in is wiring + scroll verification. |
| vh-03 | M–L | **Opus** | Touches all 5 bespoke exam finding cards + the shared subsection wrapper + system card with new surface semantics, and must prove exam parity → the "5+ file refactor" escalation. |
| vh-04 | S–M | Sonnet | Additive, isolated polish (accent + icon + shadow); no parity risk. |
| vh-05 | S | Sonnet | QA + a11y + verification; blast radius low, correctness proven in vh-03. |

**Caps check:** ≤1 Opus per wave ✓. **Batch Opus count = 1** (vh-03). No migration / PHI / RLS ⇒ no schema escalation.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-soap-card-visual-hierarchy-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

## References

- Batch plan: [`plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`README.md`](../README.md).
- Tasks: [`task-vh-01-…`](./task-vh-01-tint-ladder-and-surface-helper.md) · [`task-vh-02-…`](./task-vh-02-chief-complaints-depth.md) · [`task-vh-03-…`](./task-vh-03-exam-depth.md) · [`task-vh-04-…`](./task-vh-04-category-color-and-icons.md) · [`task-vh-05-…`](./task-vh-05-close-gate.md).
- Process: `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`.

---

**Created:** 2026-07-05. **Status:** Committed — not yet implemented.
