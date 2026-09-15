"use client";

import { useCallback, useState } from "react";

/** Controlled or uncontrolled open flag for a desk prep section. */
export function useDeskSectionOpen(
  openProp: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  initialOpen = true
): { open: boolean; setOpen: (next: boolean) => void; controlled: boolean } {
  const [internal, setInternal] = useState(initialOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internal;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternal(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );
  return { open, setOpen, controlled };
}
