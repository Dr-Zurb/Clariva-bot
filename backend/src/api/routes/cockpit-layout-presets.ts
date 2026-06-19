/**
 * Cockpit layout preset Zod schemas (clpm-02 / R-LAYOUT-UX).
 *
 * Validates tree-shaped presets on PUT /api/v1/settings/doctor/cockpit-presets.
 * Legacy flat layouts and patients_list_view rows remain validated in
 * doctor-settings-service (DL-9 shared JSONB array).
 */

import { z } from 'zod';
import type { LayoutNode, LegacyPresetLayout } from '../../types/doctor-settings';
import { ValidationError } from '../../utils/errors';

const COLUMN_TYPES = ['chart', 'body', 'rx'] as const;

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('pane'),
      paneId: z.string().min(1),
      collapsed: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal('split'),
      direction: z.enum(['horizontal', 'vertical']),
      children: z.array(layoutNodeSchema).min(1).max(10),
      sizes: z.array(z.number().min(5).max(95)),
    }),
  ]),
) as z.ZodType<LayoutNode>;

/** Cockpit v3 {@link PaneTreeNode} — mirrors frontend `isValidTreeNode`. */
export const paneTreeV3Schema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      sizePct: z.number().min(0).max(100),
      hidden: z.boolean(),
      direction: z.enum(['horizontal', 'vertical']).optional(),
      children: z.array(paneTreeV3Schema).optional(),
      paneIds: z.array(z.string().min(1)).min(1).optional(),
      activeTabId: z.string().min(1).optional(),
    })
    .superRefine((node, ctx) => {
      if (node.paneIds != null && node.children != null && node.children.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'leaf cannot have both paneIds and children',
        });
      }
      if (
        node.paneIds != null &&
        node.activeTabId != null &&
        !node.paneIds.includes(node.activeTabId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'activeTabId must be included in paneIds',
        });
      }
    }),
) as z.ZodType<Record<string, unknown>>;

export const legacyLayoutSchema: z.ZodType<LegacyPresetLayout> = z.object({
  slots: z.tuple([
    z.enum(COLUMN_TYPES),
    z.enum(COLUMN_TYPES),
    z.enum(COLUMN_TYPES),
  ]),
  widths: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100)]),
  collapsed: z.object({
    chart: z.boolean(),
    rx: z.boolean(),
    body: z.boolean().optional(),
  }),
});

const patientsListViewLayoutSchema = z
  .object({
    kind: z.literal('patients_list_view'),
    filters: z.record(z.string(), z.unknown()).optional(),
    columns: z.array(z.string()).optional(),
    is_default: z.boolean().optional(),
  })
  .passthrough();

function isValidIsoDate(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10);
}

export const cockpitLayoutPresetSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    name: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1).max(60)),
    created_at: z.string().refine(isValidIsoDate, { message: 'created_at must be ISO-8601 string' }),
    sourceTemplateId: z.string().min(1).max(128).optional(),
    layout: z.union([legacyLayoutSchema, patientsListViewLayoutSchema]).optional(),
    layout_tree: layoutNodeSchema.optional(),
    pane_tree_v3: paneTreeV3Schema.optional(),
  })
  .refine((d) => d.layout != null || d.layout_tree != null || d.pane_tree_v3 != null, {
    message: 'must include layout, layout_tree, or pane_tree_v3',
  });

export const cockpitLayoutPresetsBodySchema = z
  .array(cockpitLayoutPresetSchema)
  .max(5, 'Maximum 5 cockpit layout presets allowed');

/** Parse a v3 pane tree; throws ValidationError on failure. */
export function parsePaneTreeV3(node: unknown, label = 'pane_tree_v3'): Record<string, unknown> {
  const result = paneTreeV3Schema.safeParse(node);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join('; ') || 'invalid pane tree';
    throw new ValidationError(`${label}: ${msg}`);
  }
  return result.data;
}

/** Parse a layout tree node; throws ValidationError on failure. */
export function parseLayoutTreeNode(node: unknown, label = 'layout_tree'): LayoutNode {
  if (node && typeof node === 'object' && (node as { kind?: string }).kind === 'split') {
    const split = node as { children?: unknown };
    if (!Array.isArray(split.children) || split.children.length < 2) {
      throw new ValidationError(`${label}.children must be an array with at least 2 nodes`);
    }
  }
  const splitSchema = layoutNodeSchema as z.ZodType<LayoutNode>;
  const result = splitSchema.safeParse(node);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join('; ') || 'invalid layout tree';
    throw new ValidationError(`${label}: ${msg}`);
  }
  const parsed = result.data;
  if (parsed.kind === 'split') {
    if (parsed.children.length < 2) {
      throw new ValidationError(`${label}.children must be an array with at least 2 nodes`);
    }
    if (parsed.sizes.length !== parsed.children.length) {
      throw new ValidationError(`${label}.sizes must match children length`);
    }
  }
  return parsed;
}

/** Parse full presets array for PUT body; throws ValidationError. */
export function parseCockpitLayoutPresets(presets: unknown): z.infer<typeof cockpitLayoutPresetSchema>[] {
  if (!Array.isArray(presets)) {
    throw new ValidationError('cockpit_layout_presets must be an array');
  }
  const result = cockpitLayoutPresetsBodySchema.safeParse(presets);
  if (!result.success) {
    const msg =
      result.error.issues.map((i) => i.message).join('; ') ||
      result.error.message ||
      'invalid cockpit layout presets';
    throw new ValidationError(msg);
  }
  const seenIds = new Set<string>();
  for (const preset of result.data) {
    if (seenIds.has(preset.id)) {
      throw new ValidationError(`Duplicate preset id: ${preset.id}`);
    }
    seenIds.add(preset.id);
    if (preset.layout_tree?.kind === 'split' && preset.layout_tree.children.length < 2) {
      throw new ValidationError('layout_tree.children must be an array with at least 2 nodes');
    }
    const layout = preset.layout;
    if (layout && 'slots' in layout && Array.isArray(layout.slots)) {
      if (new Set(layout.slots).size !== 3) {
        throw new ValidationError('layout.slots must contain each of chart/body/rx exactly once');
      }
    }
    if (layout && 'widths' in layout && Array.isArray(layout.widths)) {
      const sum = (layout.widths as number[]).reduce((a: number, b: number) => a + b, 0);
      if (Math.abs(sum - 100) > 5) {
        throw new ValidationError(`layout.widths must sum to ~100 (got ${sum})`);
      }
    }
  }
  return result.data;
}
