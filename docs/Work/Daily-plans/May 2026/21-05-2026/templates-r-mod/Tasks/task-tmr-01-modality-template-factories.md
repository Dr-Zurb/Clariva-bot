# tmr-01 · Modality template factories

> **Wave 1** of the [templates-r-mod batch](../plan-templates-r-mod-batch.md). Add three new exported template factories beside the existing `getTelemedVideoTemplate`, plus shared helpers so columns aren't duplicated.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (one file modified, +~250 LOC additions; one helper extraction) |
| **Model** | **Auto** — straightforward extension of an existing factory pattern; no architectural decisions; no security surface |
| **Wave** | 1 |
| **Depends on** | csf-02 (factory pattern shipped); cce-04 (Snapshot + History leaves wired into the existing factory) |
| **Blocks** | tmr-02 (dispatcher returns these factory ids), tmr-04 (production page consumes them) |

---

## Goal

In `frontend/lib/patient-profile/templates.tsx`, add three new exported factories:

- `getTelemedVoiceTemplate(ctx: TelemedVideoContext): PaneDefinition[]`
- `getTelemedTextTemplate(ctx: TelemedVideoContext): PaneDefinition[]`
- `getReviewTemplate(ctx: TelemedVideoContext): PaneDefinition[]`

All three share the same `TelemedVideoContext` (rename the type to `CockpitTemplateContext` if the task picks that polish — strictly optional; backward compat preserved via a re-export). The only diff between factories is:

1. The Body leaf's `naturalSizePct` (50 video / 15 voice / 40 text / 0 review).
2. The Body leaf's `render` function (template-aware Body content — see DL-2 of the batch plan: same `ConsultationBodyPane` component, but the ctx flags drive which sub-surface it shows).
3. The middle-column bottom row's `naturalSizePct` (42 video / 75 voice / 50 text / 90 review).
4. (Review only) Whether the Body leaf is `hidden: true` from the start.

Everything else — left column (Snapshot + History), right column (Subjective + Objective), Investigations + Plan in the bottom row, column widths (22 / 56 / 22) — is identical across the four templates.

---

## What to do

### 1. Extract shared helpers

Refactor the current `getTelemedVideoTemplate` into three exported helpers that all factories share:

```ts
function makeLeftColumn(ctx: TelemedVideoContext): PaneDefinition {
  // Snapshot + History (unchanged from cce-04)
  const appointment = ctx.appointment as PaneAppointment;
  return {
    id: 'left-column',
    title: 'Patient',
    render: () => null,
    children: [
      {
        id: 'snapshot',
        title: 'Snapshot',
        icon: Heart,
        render: () => <SnapshotPane appointment={appointment} token={ctx.token} hideHeader />,
        naturalSizePct: 40,
        minSizePx: 200,
      },
      {
        id: 'history',
        title: 'History',
        icon: Clock,
        render: () => <HistoryPane appointment={appointment} token={ctx.token} hideHeader />,
        naturalSizePct: 60,
        minSizePx: 240,
      },
    ],
    naturalSizePct: 22,
    minSizePx: 240,
  };
}

function makeRightColumn(ctx: TelemedVideoContext): PaneDefinition {
  // Subjective + Objective (unchanged from csf-03)
  return {
    id: 'right-column',
    title: 'Notes',
    render: () => null,
    children: [
      {
        id: 'subjective',
        title: 'Subjective',
        icon: MessageSquare,
        render: () => <SubjectivePane hideHeader />,
        naturalSizePct: 50,
        minSizePx: 220,
      },
      {
        id: 'objective',
        title: 'Objective',
        icon: Activity,
        render: () => <ObjectivePane hideHeader />,
        naturalSizePct: 50,
        minSizePx: 220,
      },
    ],
    naturalSizePct: 22,
    minSizePx: 240,
  };
}

function makeMiddleBottomRow(ctx: TelemedVideoContext, planSizePct: number, bottomRowSizePct: number): PaneDefinition {
  // Investigations + Plan (unchanged; the bottom-row size varies per template)
  // ...
}
```

After extraction, `getTelemedVideoTemplate` becomes:

```ts
export function getTelemedVideoTemplate(ctx: TelemedVideoContext): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, { bodyHeight: 50, bottomRowHeight: 42, bodyVariant: 'video' }),
    makeRightColumn(ctx),
  ];
}
```

The other three factories follow the same pattern.

### 2. Add the three new factories

**`getTelemedVoiceTemplate(ctx)`** — Body shrinks to 15%, Plan expands to 75%:

```ts
export function getTelemedVoiceTemplate(ctx: TelemedVideoContext): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, { bodyHeight: 15, bottomRowHeight: 75, bodyVariant: 'voice' }),
    makeRightColumn(ctx),
  ];
}
```

The `bodyVariant` flag flows into the Body leaf's render path. `ConsultationBodyPane` already handles voice mode (it renders the mute / end / timer strip when `appointment.consultation_type === 'voice'`); the template doesn't need to render a different component, it just gives the Body leaf less room.

**`getTelemedTextTemplate(ctx)`** — Body becomes a chat thread at 40%, Plan ~50%:

```ts
export function getTelemedTextTemplate(ctx: TelemedVideoContext): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, { bodyHeight: 40, bottomRowHeight: 50, bodyVariant: 'text' }),
    makeRightColumn(ctx),
  ];
}
```

Again — `ConsultationBodyPane` already renders a chat thread for text consults; the template just sizes accordingly.

**`getReviewTemplate(ctx)`** — Body hidden, Plan + S/O become the main content:

```ts
export function getReviewTemplate(ctx: TelemedVideoContext): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumnNoBody(ctx, { bottomRowHeight: 90, bodyVariant: 'review' }),
    makeRightColumn(ctx),
  ];
}
```

Or — preferred — pass `bodyHeight: 0, bodyHidden: true` to a generalized `makeMiddleColumn` that conditionally omits the Body child:

```ts
function makeMiddleColumn(
  ctx: TelemedVideoContext,
  opts: {
    bodyHeight: number;
    bottomRowHeight: number;
    bodyVariant: 'video' | 'voice' | 'text' | 'review';
  },
): PaneDefinition {
  const children: PaneDefinition[] = [];
  if (opts.bodyVariant !== 'review') {
    children.push({
      id: 'body',
      title: variantTitle(opts.bodyVariant),
      icon: variantIcon(opts.bodyVariant),
      render: () => (
        <ConsultationBodyPane
          state={ctx.state}
          appointment={ctx.appointment as PaneAppointment}
          token={ctx.token}
          launcherRef={ctx.launcherRef ?? FALLBACK_LAUNCHER_REF}
          onRxSent={ctx.onRxSent}
          onMarkNoShow={ctx.onMarkNoShow}
          hideHeader
        />
      ),
      naturalSizePct: opts.bodyHeight,
      minSizePx: opts.bodyVariant === 'voice' ? 120 : 280,
    });
  }
  children.push(makeMiddleBottomRow(ctx, opts.bottomRowHeight));
  return {
    id: 'middle-column',
    title: 'Consult',
    render: () => null,
    children,
    naturalSizePct: 56,
    minSizePx: 480,
  };
}
```

`variantTitle` / `variantIcon` are small lookup helpers that return `"Body (Video)"` + `Video` / `"Body (Voice)"` + `Phone` / `"Body (Text)"` + `MessageSquare` for the three Body variants. (Tip: lucide-react has `Phone` for voice — already in the import.)

### 3. Type-export `CockpitTemplate` ids

```ts
export type CockpitTemplate = 'telemed-video' | 'telemed-voice' | 'telemed-text' | 'review';
```

Use this in tmr-02's `mapStateToTemplate` return type. Add a `templateId` field on the `CockpitTemplateContext` if downstream needs it (deferred — tmr-04 picks).

### 4. Bytes-identical regression test (optional, recommended)

Before refactoring, snapshot the current `getTelemedVideoTemplate(ctx).map(serializePaneTree)` output and save it as a test fixture. After the helper extraction, the snapshot must match — the refactor MUST be byte-identical for the video case. If it isn't, the refactor introduced a bug; fix before adding new factories.

### 5. JSDoc comments on each new factory

Each factory gets a 5-line JSDoc block summarizing:
- What modality it serves
- Body height + Plan height
- Whether Body is hidden
- The corresponding `mapStateToTemplate` return (`'telemed-voice'` etc.)

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/templates.tsx` (~250 LOC additions; one helper extraction; no deletions).

That's the entire surface. No backend changes, no new files, no new packages.

---

## Acceptance gate

- [ ] `getTelemedVoiceTemplate(ctx)`, `getTelemedTextTemplate(ctx)`, `getReviewTemplate(ctx)` all exported from `templates.tsx` and return valid `PaneDefinition[]`.
- [ ] All four factories share `makeLeftColumn(ctx)`, `makeRightColumn(ctx)`, and `makeMiddleColumn(ctx, opts)` helpers.
- [ ] `getTelemedVideoTemplate` output is byte-identical to its pre-tmr-01 output (deep-equal snapshot test).
- [ ] Voice template Body leaf `naturalSizePct === 15`; bottom-row `naturalSizePct === 75`.
- [ ] Text template Body leaf `naturalSizePct === 40`; bottom-row `naturalSizePct === 50`.
- [ ] Review template Body leaf is omitted from `children` (or `hidden: true` if the task prefers — pick the simplest); bottom-row `naturalSizePct === 90`.
- [ ] `CockpitTemplate` type exported with the four string literals.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] No new packages installed.

---

## Anti-goals

- ❌ Don't add new files. All factories + helpers live in the single `templates.tsx`.
- ❌ Don't change `getTelemedVideoTemplate`'s output shape. Helper extraction must be byte-identical.
- ❌ Don't add the dispatcher (`mapStateToTemplate`) — that's tmr-02.
- ❌ Don't add new ConsultationBodyPane variants — the component already handles voice / text. Templates just size differently.
- ❌ Don't touch `state.ts` (dispatcher lives there but ships in tmr-02).
- ❌ Don't import `RxFormContext` directly in `templates.tsx` — leaves consume it via their own component subtree.

---

## Notes

- The helper extraction is the load-bearing decision. If `makeLeftColumn` / `makeRightColumn` aren't true single sources of truth, every later cockpit-v2 batch that tweaks the chart split / right-column split will fix it in three places instead of one.
- The `bodyVariant` flag is a soft contract — `ConsultationBodyPane` already does its own modality inference from `appointment.consultation_type`. The flag exists for future variants (e.g., dental cam, image-share modality) but Phase 2 doesn't use it for rendering.
- The Review template's omission of the Body leaf is the cleanest approach because the user's saved layout (cv2-02 migration) won't have a Body width for Review — it just gets a 2-child middle column. The shell's existing PanelGroup handles a 2-child middle column correctly.
- If the task wants to factor `makeMiddleBottomRow` out of `makeMiddleColumn` for symmetry with `makeLeftColumn` / `makeRightColumn`, fine — that's a polish call.
