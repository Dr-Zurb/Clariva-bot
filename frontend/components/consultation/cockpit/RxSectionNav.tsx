'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Section = { id: string; label: string; count?: number };

export function RxSectionNav({
  sections,
  scrollContainerRef,
}: {
  sections: Section[];
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  // IntersectionObserver to track which section is in view relative to the
  // scroll container. Watches sections within the Rx column's own scroll root
  // (not the page viewport) so it stays correct when the column is only a
  // fraction of the screen.
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible section in the scroll viewport.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // rootMargin biases toward "the section the doctor is reading" rather
      // than "a section that's barely peeking in from the bottom".
      { root, threshold: [0.1, 0.5, 0.9], rootMargin: '-40px 0px -40% 0px' },
    );
    sections.forEach(({ id }) => {
      const el = root.querySelector(`#${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections, scrollContainerRef]);

  const handleClick = (id: string) => {
    const root = scrollContainerRef.current;
    if (!root) return;
    const target = root.querySelector(`#${id}`) as HTMLElement | null;
    if (!target) return;
    // Smooth scroll in supporting browsers; reduced-motion browsers get
    // instant scroll automatically per the browser's prefers-reduced-motion
    // handling of `behavior: 'smooth'`.
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-background px-3 py-2"
      aria-label="Prescription sections"
    >
      {sections.map(({ id, label, count }) => (
        <button
          key={id}
          type="button"
          onClick={() => handleClick(id)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            activeId === id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {label}
          {typeof count === 'number' && count > 0 ? ` (${count})` : ''}
        </button>
      ))}
    </nav>
  );
}
