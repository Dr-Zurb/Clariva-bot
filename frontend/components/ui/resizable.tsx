'use client';

import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';

import { cn } from '@/lib/utils';

// react-resizable-panels v4 renamed PanelGroup → Group and PanelResizeHandle → Separator.
// The public component names (ResizablePanelGroup, ResizablePanel, ResizableHandle) are
// kept identical to the shadcn canonical interface so call-sites need no changes when
// shadcn updates their snippet to match v4.

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    className={cn(
      'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
      className,
    )}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

/**
 * `orientation` is the parent panel GROUP's direction (matching `CascadeHandle`):
 *   - "horizontal" → columns side-by-side → the handle is a VERTICAL line.
 *   - "vertical"   → rows stacked        → the handle is a HORIZONTAL line.
 *
 * react-resizable-panels v4 no longer emits `data-panel-group-direction` (it sets
 * `data-group` + an inline `flex-direction` instead — see node_modules dist), so
 * the old `data-[panel-group-direction=vertical]:…` selectors silently failed and
 * horizontal separators collapsed to a 1px sliver in the corner. We drive the
 * orientation explicitly instead. Each branch keeps a full-extent 4px `after`
 * hit-area so the whole line is grabbable, not just the grip.
 */
const ResizableHandle = ({
  withHandle,
  orientation = 'horizontal',
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
  orientation?: 'horizontal' | 'vertical';
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      // Calm at rest: a faint 1px seam, no persistent grip. The whole line
      // (full-extent 4px `after` hit-area) tints on hover/drag/keyboard-focus and
      // reveals the grip, so doctors get a discoverable cue exactly when they
      // reach for a seam without the cluttered always-on dots at every crossing.
      // `data-separator` is set by react-resizable-panels v4 (inactive|hover|drag|
      // active|focus); `group/handle` lets the grip key off the parent's state.
      'group/handle relative flex items-center justify-center bg-border/60 transition-colors',
      'hover:bg-primary/40 data-[separator=drag]:bg-primary/60 data-[separator=active]:bg-primary/60',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
      orientation === 'horizontal'
        ? // vertical line between columns: 1px wide, full height, 4px-wide hit-area
          'w-px after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2'
        : // horizontal line between stacked rows: 1px tall, full width, 4px-tall hit-area
          'h-px w-full after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div
        className={cn(
          'z-10 flex items-center justify-center rounded-sm border bg-background text-muted-foreground opacity-0 transition-opacity',
          'group-hover/handle:opacity-100 group-data-[separator=drag]/handle:opacity-100 group-data-[separator=active]/handle:opacity-100 group-data-[separator=focus]/handle:opacity-100',
          orientation === 'horizontal' ? 'h-4 w-3' : 'h-3 w-4',
        )}
      >
        <GripVertical
          className={cn('h-2.5 w-2.5', orientation === 'vertical' && 'rotate-90')}
        />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
