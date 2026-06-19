"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  fitAssociatedNamesText,
  formatComplaintDisplayName,
  measureTextWidth,
} from "@/lib/cockpit/complaint-display";

export interface ComplaintAssociatedNamesInlineProps {
  names: string[];
}

/** Associated names on row 1 — shows as many as fit; +N only when width runs out. */
export function ComplaintAssociatedNamesInline({ names }: ComplaintAssociatedNamesInlineProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const formattedAll = names.map(formatComplaintDisplayName);
  const title = formattedAll.join(", ");
  const [suffix, setSuffix] = useState(() => formattedAll.join(", "));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || names.length === 0) return;

    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const style = getComputedStyle(el);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const measure = (text: string) => measureTextWidth(text, font);
      setSuffix(fitAssociatedNamesText(names, width, measure));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [names]);

  if (names.length === 0) return null;

  return (
    <span
      ref={containerRef}
      className="min-w-0 flex-1 truncate font-normal text-muted-foreground"
      title={title}
    >
      {" · "}
      {suffix}
    </span>
  );
}
