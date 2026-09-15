import {
  createElement,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
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
  CheckCircle2,
  User,
  Stethoscope,
  ClipboardList,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

const SOAP_PANE_IDS = ['subjective', 'objective', 'assessment', 'plan'] as const;
export type SoapPaneId = (typeof SOAP_PANE_IDS)[number];

export function isSoapPaneId(paneId: string): paneId is SoapPaneId {
  return (SOAP_PANE_IDS as readonly string[]).includes(paneId);
}

/** Display-only titles + palette glyphs. Pane ids stay SOAP internally. */
export const SOAP_PANE_DISPLAY = {
  subjective: { title: 'Subjective', glyph: 'S' },
  objective: { title: 'Objective', glyph: 'O' },
  assessment: { title: 'Assessment', glyph: 'A' },
  plan: { title: 'Plan', glyph: 'P' },
} as const satisfies Record<SoapPaneId, { title: string; glyph: string }>;

/**
 * Fallback SVG glyph (menus / swap chips). Palette chips render the same
 * letters as real text so they stay readable at chip size.
 */
function createSoapInitialIcon(
  glyph: string,
): ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>> {
  const fontSize = glyph.length >= 3 ? 13 : glyph.length === 2 ? 16 : 18;
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function SoapGlyphIcon(
    { className, ...props },
    ref,
  ) {
    return createElement(
      'svg',
      {
        ref,
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className,
        'aria-hidden': true,
        ...props,
      },
      createElement(
        'text',
        {
          x: '12',
          y: '13',
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          fill: 'currentColor',
          fontSize,
          fontWeight: '700',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.04em',
        },
        glyph,
      ),
    );
  });
  Icon.displayName = `SoapGlyph${glyph.replace(/\W/g, '')}`;
  return Icon;
}

/** Palette-only clinical glyphs. Open tab chips use {@link PANE_ICONS}. */
export const SOAP_INITIAL_ICONS = {
  subjective: createSoapInitialIcon(SOAP_PANE_DISPLAY.subjective.glyph),
  objective: createSoapInitialIcon(SOAP_PANE_DISPLAY.objective.glyph),
  assessment: createSoapInitialIcon(SOAP_PANE_DISPLAY.assessment.glyph),
  plan: createSoapInitialIcon(SOAP_PANE_DISPLAY.plan.glyph),
} as const satisfies Record<SoapPaneId, LucideIcon>;

/**
 * Pane icons for open tab chips + section chrome (cpv-07 / DL-9).
 * Clinical panes keep the familiar pictorial glyphs; the palette overlays
 * {@link SOAP_INITIAL_ICONS} via {@link getPalettePaneIcon}.
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

/**
 * Icon for the cockpit palette strip: clinical panes use S · O · A · P;
 * everything else uses the pane's pictorial icon.
 */
export function getPalettePaneIcon(
  paneId: string,
  fallback?: LucideIcon,
): LucideIcon {
  if (isSoapPaneId(paneId)) return SOAP_INITIAL_ICONS[paneId];
  return getPaneIcon(paneId) ?? fallback ?? Heart;
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
