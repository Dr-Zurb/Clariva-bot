# clpm-02 · Tree API client + built-ins registry

> **Wave 2** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md). Frontend + backend plumbing for tree presets + built-in modality template registry.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | clpm-01 | **Blocks** | clpm-04 (uses LayoutNode type), clpm-05 (picker reads built-ins) |
| **Status** | ✅ Done (2026-05-24) |

---

## What to do

### 1. Backend route updates `backend/src/api/routes/cockpit-layout-presets.ts`

Accept `layout_tree` in POST + PUT payloads. Zod schema:

```ts
const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pane"), paneId: z.string(), collapsed: z.boolean().optional() }),
    z.object({
      kind: z.literal("split"),
      direction: z.enum(["horizontal", "vertical"]),
      children: z.array(layoutNodeSchema).min(1).max(10),
      sizes: z.array(z.number().min(5).max(95)),
    }),
  ]),
);

const presetSchema = z.object({
  name: z.string().min(1).max(60),
  sourceTemplateId: z.string().optional(),
  layout: legacyLayoutSchema.optional(),
  layout_tree: layoutNodeSchema.optional(),
}).refine((d) => d.layout || d.layout_tree, { message: "layout or layout_tree required" });
```

Tests in `backend/tests/unit/services/doctor-settings-cockpit-presets-tree.test.ts`:
- Save a tree preset → roundtrip preserves shape.
- Save with neither → 400.
- Save 6th preset → 400 (DL-8 max cap).
- Save preset with `sourceTemplateId` set → preserved.

### 2. Frontend API client `frontend/lib/api/cockpit-layout-presets-tree.ts`

```ts
import type { LayoutNode } from "@/lib/patient-profile/types"; // moved into types in clpm-04

export interface CockpitLayoutPresetTree {
  id: string;
  name: string;
  createdAt: string;
  sourceTemplateId?: string;
  layoutTree?: LayoutNode;
  layout?: LegacyPresetLayoutShape;
}

export async function listPresetsTree(token: string): Promise<CockpitLayoutPresetTree[]>;
export async function savePresetTree(token: string, payload: { name: string; sourceTemplateId?: string; layoutTree: LayoutNode }): Promise<CockpitLayoutPresetTree>;
export async function deletePreset(token: string, id: string): Promise<void>;
```

### 3. Built-in templates registry `frontend/lib/patient-profile/layout-presets-builtin.ts`

```ts
import type { LayoutNode } from "./types";
import { videoTemplate, voiceTemplate, textTemplate, reviewTemplate } from "./templates"; // existing factories

export interface BuiltInLayoutPreset {
  id: string;
  name: string;
  description: string;
  layoutTree: LayoutNode;
}

export const BUILT_IN_PRESETS: BuiltInLayoutPreset[] = [
  { id: "builtin-telemed-video", name: "Telemed (Video)", description: "Default 8-pane layout for video consults.", layoutTree: convertTemplateToTree(videoTemplate()) },
  { id: "builtin-telemed-voice", name: "Telemed (Voice)", description: "Audio-first layout with chart prominent.", layoutTree: convertTemplateToTree(voiceTemplate()) },
  { id: "builtin-telemed-text", name: "Telemed (Text)", description: "Chat-first layout for text consults.", layoutTree: convertTemplateToTree(textTemplate()) },
  { id: "builtin-review", name: "Read-only Review", description: "Single-column scroll for review consults.", layoutTree: convertTemplateToTree(reviewTemplate()) },
];

/**
 * Lift an existing PaneDefinition[] tree (from templates.tsx) into the LayoutNode shape.
 * Most templates today are flat row × col arrangements; this helper bridges them.
 */
export function convertTemplateToTree(template: PaneDefinition[]): LayoutNode {
  // template-specific conversion. Could be as simple as wrapping in a single split-vertical
  // with each pane as a child, OR nested splits matching the template's gridArea.
  // Detailed logic depends on the existing templates.tsx structure — see comments inline.
  // ...
}
```

The `convertTemplateToTree` impl is template-shape-dependent — read `frontend/lib/patient-profile/templates.tsx` carefully and translate each modality factory's layout into a tree. This is the "interesting" part of clpm-02; the API plumbing is mechanical.

### 4. Verify

```powershell
pnpm --filter backend test
pnpm --filter frontend tsc --noEmit && pnpm --filter frontend lint
```

---

## Acceptance gate

- [x] Backend Zod accepts tree shape; rejects neither.
- [x] Frontend client wrappers work.
- [x] BUILT_IN_PRESETS has 4 entries with valid layoutTree.

---

## Anti-goals

- ❌ Don't persist built-in presets to DB (DL-9).
- ❌ Don't add custom built-in templates per-doctor — DL-12.
- ❌ Don't allow renaming built-in presets — they're decoration.
