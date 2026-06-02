'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PanePlaceholderProps {
  /** Pane title (also shown in the shell's pane header). */
  title: string;
  /** Optional Lucide icon shown above the title. */
  icon?: LucideIcon;
  /** Phase 2 / 3 R-item that will replace this placeholder. */
  futureRItem?: string;
  /** Tailwind classes for the wrapper (defaults to a muted card). */
  className?: string;
}

/**
 * Synthetic leaf used by the cv2-03 Telemed-Video template to prove the
 * shell tree without depending on Phase 2 content. Renders a centered
 * card with the pane's title + icon + a "Phase 2 will mount real content
 * here" line tagged with the responsible R-item.
 *
 * Retired by Phase 2: each pane's first content task imports the real
 * component and removes its PanePlaceholder leaf from templates.ts.
 */
export function PanePlaceholder({
  title,
  icon: Icon,
  futureRItem,
  className,
}: PanePlaceholderProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center',
        'bg-muted/20 text-muted-foreground',
        className,
      )}
      data-pane-placeholder={title}
    >
      {Icon && <Icon className="h-8 w-8" aria-hidden />}
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <p className="max-w-xs text-xs leading-relaxed">
        Phase 2 will mount real content here
        {futureRItem ? ` (${futureRItem})` : null}.
      </p>
    </div>
  );
}

export default PanePlaceholder;
