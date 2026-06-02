# brr-01 — Reskin shell: header, tabs, banners, loading, empty states + `ConfidenceBadge`

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 1 — reskin + SLA](../plan-p1-booking-review-redesign-batch.md) |
| **Wave** | 1 (Lane A — first, alone) |
| **Depends on** | — |
| **Blocks** | brr-02, brr-03, brr-04 |
| **Size** | **M–L** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-1, BR-DL-2, BR-DL-5, P1-BRR-1, P1-BRR-2, P1-BRR-4 |

---

## Objective

Reskin the **chrome** of the Booking-review inbox onto the shipped design system, and introduce the shared `ConfidenceBadge` atom — without changing any behaviour. Specifically, in [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx):

- **Header** → title + subtitle + a `Button` (`variant="outline"`) Refresh with a `lucide-react` icon (`RefreshCw`), plus a compact **summary row**: a **Pending** count and a **Due < 1h** placeholder slot (filled by brr-03).
- **Status tabs** → `Tabs` / `TabsList` / `TabsTrigger` (replace the hand-rolled pill buttons), with a count `Badge` on the **Pending** trigger (from loaded pending rows, P1-BRR-4).
- **Banners** → `Alert` (`variant="default"` for ok, `variant="destructive"` for error) with a lucide icon (`CheckCircle2` / `AlertTriangle`).
- **Loading** → `Skeleton` rows (replace the bare spinner block).
- **Empty states** → `Card` + muted copy + a `Button` (`variant="link"`/`asChild`) for "Open services catalog".
- **New atom `ConfidenceBadge`** (P1-BRR-1) → maps the confidence string to a `Badge` variant + a 3-segment meter; replaces `confidenceClass()`.

The **rows' cell internals and the Reassign/Cancel dialogs are brr-02** — in this task they can keep their current markup (just compile against the new tab/loading state). The goal is the surrounding shell + the shared confidence atom.

## Why this task

The shell is the frame every row renders inside and the first thing that reads as "generic V0." Swapping it to primitives fixes the bulk of the "too basic" complaint immediately and gives brr-02 a clean, tokenised surface to drop reskinned rows into. `ConfidenceBadge` is extracted here (not in brr-02) because both the row cell *and* any later summary use it, and `badge.tsx` explicitly forbids per-page chip styles (BR-DL-1) — so the replacement for `confidenceClass()` must be a shared atom, defined once.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — replace header / tabs / banner / loading / empty-state markup with primitives; delete `confidenceClass()`; wire the summary row (Pending now, Due<1h slot for brr-03). Keep `runAction`, `loadTab`, `selectTab`, state, and the row/dialog code as-is (brr-02 reskins those). |
| `frontend/components/service-reviews/ConfidenceBadge.tsx` | **New** — `ConfidenceBadge` atom: confidence string → `Badge` variant + 3-segment meter (P1-BRR-1). |
| `frontend/components/service-reviews/__tests__/ConfidenceBadge.test.tsx` | **New** — maps high/medium/low/unknown → expected variant + filled-segment count; case-insensitive; never crashes on unknown. |

> **Reuse discipline:** import primitives from `@/components/ui/*` and icons from `lucide-react`. Do not add new colour literals — use token classes (`text-foreground` / `text-muted-foreground`) and `Badge` variants only (BR-DL-1).

## Implementation sketch

### `ConfidenceBadge` — the atom (replaces `confidenceClass`)

```tsx
// frontend/components/service-reviews/ConfidenceBadge.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Level = "high" | "medium" | "low" | "unknown";

function levelOf(confidence: string): Level {
  const c = confidence.trim().toLowerCase();
  if (c === "high") return "high";
  if (c === "medium") return "medium";
  if (c === "low") return "low";
  return "unknown";
}

const META: Record<Level, { variant: "success" | "warning" | "destructive" | "info"; filled: number }> = {
  high:    { variant: "success",     filled: 3 },
  medium:  { variant: "warning",     filled: 2 },
  low:     { variant: "destructive", filled: 1 },
  unknown: { variant: "info",        filled: 0 },
};

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const level = levelOf(confidence);
  const { variant, filled } = META[level];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={variant} className="capitalize">{confidence || "unknown"}</Badge>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1.5 w-3 rounded-sm", i < filled ? "bg-current opacity-80" : "bg-muted")} />
        ))}
      </span>
    </span>
  );
}
```

> Confidence is a **free-form string** in the contract — map case-insensitively and give unknown a safe fallback (never blank/crash). The meter gives a non-colour signal for a11y (BR-Q1 → P1-BRR-1).

### Tabs (replace the pill `<button>` list, lines ~211–232)

```tsx
<Tabs value={activeTab} onValueChange={(v) => selectTab(v as ServiceStaffReviewListQueryStatus)}>
  <TabsList>
    {INBOX_TABS.map((t) => (
      <TabsTrigger key={t.id} value={t.id}>
        {t.label}
        {t.id === "pending" && pendingCount > 0 && (
          <Badge variant="secondary" className="ml-2 tabular-nums">{pendingCount}</Badge>
        )}
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

- Keep the existing `selectTab` / `loadTab` flow exactly (out-of-order guard, `dataTab`, `loadGenRef`). `Tabs` is presentational here; the data still loads via `selectTab`.
- `pendingCount` = pending rows currently loaded (when `dataTab === "pending"`); otherwise omit. Full multi-tab counts are out of scope (P1-BRR-4).

### Banner → `Alert`

```tsx
{banner && (
  <Alert variant={banner.kind === "ok" ? "default" : "destructive"}>
    {banner.kind === "ok" ? <CheckCircle2 /> : <AlertTriangle />}
    <AlertDescription>{banner.text}</AlertDescription>
  </Alert>
)}
```

### Loading → `Skeleton`; empty → `Card`

- Replace the spinner block (`dataStale`) with 3–5 `Skeleton` rows in the table/list footprint (keep the `aria-busy` / `role="status"` semantics).
- Replace the empty-state `<div>`s with a `Card` containing the same copy; the "Open services catalog" link becomes `<Button asChild variant="link"><Link …/></Button>`.

### Summary row (header)

A compact flex row under the title: a "Pending {n}" stat and a **Due < 1h** stat rendered as `—` for now with a stable element id/structure brr-03 can populate. Use `tabular-nums` on the numbers.

## Tests (`ConfidenceBadge.test.tsx`)

- [x] `"high"` → `success` variant, 3 filled segments.
- [x] `"Medium"` (mixed case) → `warning`, 2 filled.
- [x] `"low"` → `destructive`, 1 filled.
- [x] `"weird"` / `""` → `info` fallback, 0 filled, renders without throwing.

## Acceptance criteria

- [x] Header, tabs, banners, loading, and empty states render via `Button` / `Tabs` / `Alert` / `Skeleton` / `Card` + `lucide-react` icons.
- [x] `confidenceClass()` is deleted; `rg "confidenceClass"` returns nothing; confidence renders via `ConfidenceBadge`.
- [x] The Pending tab shows a count `Badge`; the summary row shows Pending (and a Due<1h placeholder slot).
- [x] No raw `gray-*` / `blue-*` literals remain in the reskinned shell; numerics use `tabular-nums`.
- [x] `selectTab` / `loadTab` / `runAction` / state are unchanged; rows + dialogs still render (their reskin is brr-02).
- [x] `npx tsc --noEmit` + `npm run lint` clean; `ConfidenceBadge.test.tsx` green.
- [x] No edit to `page.tsx`, the backend, or `staff-review-match-explain.ts`.

## Out of scope (explicit)

- Row cell internals + action buttons + Reassign/Cancel dialogs (brr-02).
- SLA chip / Due<1h count value / pending sort (brr-03).
- Multi-tab count badges, drawer, mobile cards, optimistic/undo, filters (Phases 2–3).
- Renaming the component/file (P1-BRR-2).

## Decision log

- **`ConfidenceBadge` extracted now, not in brr-02:** it's a shared atom and the sanctioned replacement for the forbidden per-page chip (BR-DL-1); defining it once here keeps brr-02 a pure row reskin.
- **`Tabs` is presentational over the existing loader:** rewriting the data-load flow is needless risk; `Tabs` just restyles the trigger row while `selectTab` keeps its proven out-of-order guard.
- **Pending-only count badge:** honest count from loaded rows; full per-tab counts need extra fetches and are deferred (P1-BRR-4).

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — current shell (header ~191, tabs ~211, banner ~234, loading ~247, empty ~261); `confidenceClass` ~42.
- [`frontend/components/ui/tabs.tsx`](../../../../../../frontend/components/ui/tabs.tsx) · [`alert.tsx`](../../../../../../frontend/components/ui/alert.tsx) · [`button.tsx`](../../../../../../frontend/components/ui/button.tsx) · [`badge.tsx`](../../../../../../frontend/components/ui/badge.tsx) · [`card.tsx`](../../../../../../frontend/components/ui/card.tsx) · [`skeleton.tsx`](../../../../../../frontend/components/ui/skeleton.tsx).
- Batch: [`plan-p1-booking-review-redesign-batch.md`](../plan-p1-booking-review-redesign-batch.md) · Order: [`EXECUTION-ORDER-p1-booking-review-redesign.md`](./EXECUTION-ORDER-p1-booking-review-redesign.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
