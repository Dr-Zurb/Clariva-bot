import {
  Heart,
  Clock,
  Beaker,
  Pill,
  MessageSquare,
  Activity,
  Video,
  Phone,
  Quote,
  Stethoscope,
  CheckCircle2,
  User,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for pane icons (cpv-07 / DL-9, 2026-05-26).
 * Templates.tsx + any future pane-rendering surface imports from here.
 *
 * csl-02 (2026-05-26): added `assessment` (was falling back to `LayoutGrid`
 * inside `<PaneToggleBar>`) and remapped `subjective` to `Quote` so it
 * doesn't collide with `BODY_VARIANT_ICONS.text` (both were `MessageSquare`).
 *
 * ecb-01 (2026-05-27): `BODY_VARIANT_ICONS.review` now resolves to
 * `CheckCircle2` so the toggle-bar icon for the body pane in the review
 * template semantically communicates "visit completed" rather than the
 * misleading camera icon it used to inherit from the video variant.
 */
export const PANE_ICONS: Record<string, LucideIcon> = {
  snapshot: Heart,
  history: Clock,
  body: Video,
  assessment: Stethoscope,
  'investigations-orders': Beaker,
  plan: Pill,
  subjective: Quote,
  objective: Activity,
  // Future extensions land here.
};

/** Top-level column icons for the toggle bar (layout-ux-01, 2026-05-28). */
export const COLUMN_ICONS: Record<string, LucideIcon> = {
  'left-column': User,
  'middle-column': Stethoscope,
  'right-column': ClipboardList,
};

export function getPaneIcon(paneId: string): LucideIcon | undefined {
  return PANE_ICONS[paneId];
}

// Variant icons for body pane:
export const BODY_VARIANT_ICONS: Record<
  'video' | 'voice' | 'text' | 'review',
  LucideIcon
> = {
  video: Video,
  voice: Phone,
  text: MessageSquare,
  review: CheckCircle2,
};
