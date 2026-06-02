# cpv-06 · Color token audit ✅

> **Wave 3 / Lane α step 1** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issues #18 + #19 — ad-hoc badge/button colors + inconsistent separators.

**Status:** Done (2026-05-26)

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (~120 LOC delta across many files) |
| **Model** | Auto |
| **Wave** | 3 |
| **Depends on** | cpv-05 (sync — same file region) |
| **Blocks** | cpv-08 (close-out) |

---

## Goal

Replace hex literals + ad-hoc Tailwind palette classes in cockpit + patient-profile components with semantic Tailwind tokens from `tailwind.config.ts`. Add up to 3 new tokens if needed. Fix PatientRibbon's mixed separators per DL-7.

---

## What to do

### 1. Audit existing hex literals

```powershell
rg "#[0-9a-fA-F]{3,8}\b" frontend/components/cockpit/ frontend/components/patient-profile/
rg "(bg|text|border)-(red|orange|yellow|green|blue|indigo|purple|pink|gray|slate)-[0-9]+" frontend/components/cockpit/ frontend/components/patient-profile/ | wc -l
```

The grep produces the working list. For each result, decide:

- **Keep** if it's documented (e.g., a category-specific color like BMI underweight blue).
- **Replace** with a semantic token if it's expressing a semantic concept (success / warning / destructive / muted / accent).

### 2. Inventory `tailwind.config.ts` semantic tokens

Open `frontend/tailwind.config.ts`. The existing token set likely includes:

- `background`, `foreground`, `card`, `popover`, `muted`, `accent`
- `primary`, `secondary`, `destructive`
- `border`, `input`, `ring`

If `success`, `warning`, `info` aren't present, add them (max 3 new tokens per DL-6):

```ts
// Inside theme.extend.colors:
success: {
  DEFAULT: "hsl(var(--success))",
  foreground: "hsl(var(--success-foreground))",
},
warning: {
  DEFAULT: "hsl(var(--warning))",
  foreground: "hsl(var(--warning-foreground))",
},
```

With matching CSS variables in `globals.css`:

```css
:root {
  --success: 142 71% 45%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
}
```

(If `globals.css` already has `--warning` / `--success` via shadcn/ui defaults, just reference them.)

### 3. Replacement map

Pattern-replace common literals:

| Before | After |
|---|---|
| `bg-yellow-100 text-yellow-800` | `bg-warning/15 text-warning` |
| `bg-red-100 text-red-800` | `bg-destructive/15 text-destructive` |
| `bg-green-100 text-green-800` | `bg-success/15 text-success` |
| `bg-blue-100 text-blue-800` | `bg-primary/15 text-primary` |
| `border-yellow-300` | `border-warning/40` |
| `text-gray-700` | `text-foreground/80` (or `text-muted-foreground` for clearly muted contexts) |
| `text-gray-500` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |
| `bg-gray-50` | `bg-muted/30` |

Exceptions to leave alone (per DL-6 scope rules):
- Files under `frontend/components/consultation/` (text/voice chat surfaces — out of scope).
- BMI badge category colors (cpv-03) — those are semantically specific; document instead.

### 4. PatientRibbon separator unification (DL-7)

In `frontend/components/patient-profile/PatientRibbon.tsx`, find the separator markup. Mixed today:

```tsx
<span>{name}</span> · <span>{age}</span> | <span>{treating}</span> | <span>{safety}</span>
```

Replace all separators with `·`:

```tsx
function Sep() {
  return <span className="text-muted-foreground/40" aria-hidden> · </span>;
}

<span>{name}</span><Sep /><span>{age}</span><Sep /><span>{treating}</span><Sep /><span>{safety}</span>
```

(Adjust to actual structure — the snippet is illustrative.)

### 5. Verify the audit is complete

```powershell
rg "#[0-9a-fA-F]{3,8}\b" frontend/components/cockpit/ frontend/components/patient-profile/
# Should return zero (or only documented exceptions in comments).

rg "(bg|text|border)-(red|orange|yellow|green|blue)-[0-9]+" frontend/components/cockpit/ frontend/components/patient-profile/
# Should return zero (or only the BMI badge category colors).
```

If hex literals remain, document each in a `frontend/lib/cockpit/__color-exceptions.md` (one-line note per literal).

### 6. Visual regression

Open `/dashboard/appointments/[id]` and confirm:

- Safety pill / banners use `bg-warning/15 text-warning` (or `bg-destructive/15` for severe).
- Send button uses `bg-primary text-primary-foreground`.
- "Live draft" badge from ccd-02 reads consistently in the new token system.
- All borders / muted text look subtle, not stark.

### 7. Tests

Most of the existing tests should pass unchanged — token swaps are a visual change. Run:

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

Any snapshot tests that compare className strings need updating — accept the new tokens in the snapshot.

### 8. Verify

Re-run the grep checks from step 5. Take a screenshot of the cockpit and compare to the pre-batch screenshot — look for color regressions.

---

## Acceptance gate

- [x] `rg "#[0-9a-fA-F]{3,8}\b" frontend/components/cockpit/ frontend/components/patient-profile/` returns zero (or only documented exceptions).
- [x] No `bg-yellow-N`, `bg-green-N`, etc. literals in cockpit + patient-profile components (except documented exceptions like BMI badge).
- [x] `tailwind.config.ts` semantic tokens are the source of truth.
- [x] At most 3 new tokens added if needed.
- [x] PatientRibbon separators are all `·`.
- [x] Visual regression smoke shows no color regressions.
- [x] All existing tests still pass.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't refactor consultation chat surfaces — out of scope.
- ❌ Don't introduce a custom palette beyond shadcn/ui tokens — stay with the existing system.
- ❌ Don't change BMI badge category colors (cpv-03 has its own semantic) — document instead.
- ❌ Don't fix dark-mode at the same time — capture-inbox; this batch is light-mode token audit.

---

## Notes

- This is the largest task in the batch by file count, smallest by per-file delta. Most changes are 1-3 lines per file (className swap).
- The grep + replace can be partly mechanical; eyeball each change for semantic correctness (yellow could mean warning OR a brand color OR a status — context matters).
- If a hex literal expresses a category that doesn't fit any semantic token (e.g., the BMI underweight blue), keep it but add an inline comment: `// BMI category color — intentionally not a semantic token`.
- After this task, future polish/theming work has a single source of truth (`tailwind.config.ts`). The cost of re-theming drops from ~30 file touches to 5 token edits.
