import { useCallback, useState } from "react";

export interface AccordionItemLike {
  id: string;
}

/** Accordion default: at most one item open — first match in registry order. */
export function pickAccordionOpenId<S extends AccordionItemLike>(
  items: readonly S[],
  candidateIds: Set<string>,
): Set<string> {
  if (candidateIds.size === 0) return candidateIds;
  for (const item of items) {
    if (candidateIds.has(item.id)) return new Set([item.id]);
  }
  return candidateIds;
}

export interface UseAccordionOpenStateOptions<S extends AccordionItemLike> {
  items: readonly S[];
  /** Ids with content / priority at mount — collapsed to one via {@link pickAccordionOpenId}. */
  initialOpenIds?: readonly string[];
  /** Used when `initialOpenIds` is empty (first id wins after pick). */
  fallbackOpenIds?: readonly string[];
  /** Called when an item opens (after accordion closes siblings). */
  onOpen?: (id: string) => void;
  /** Called when an item closes. */
  onClose?: (id: string) => void;
}

/**
 * Single-open accordion for nested SOAP cards (L2+). Manual open closes siblings;
 * {@link expandAll} / {@link collapseAll} support survey mode without scroll side effects.
 */
export function useAccordionOpenState<S extends AccordionItemLike>({
  items,
  initialOpenIds = [],
  fallbackOpenIds = [],
  onOpen,
  onClose,
}: UseAccordionOpenStateOptions<S>) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const id of initialOpenIds) initial.add(id);
    if (initial.size === 0) {
      for (const id of fallbackOpenIds) initial.add(id);
    }
    return pickAccordionOpenId(items, initial);
  });

  const isOpen = useCallback((id: string) => openIds.has(id), [openIds]);

  const setOpen = useCallback(
    (id: string, open: boolean) => {
      setOpenIds((prev) => {
        const wasOpen = prev.has(id);
        if (open === wasOpen) return prev;
        if (open) {
          onOpen?.(id);
          return new Set([id]);
        }
        const next = new Set(prev);
        next.delete(id);
        onClose?.(id);
        return next;
      });
    },
    [onClose, onOpen],
  );

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const willOpen = !prev.has(id);
        if (willOpen) {
          onOpen?.(id);
          return new Set([id]);
        }
        const next = new Set(prev);
        next.delete(id);
        onClose?.(id);
        return next;
      });
    },
    [onClose, onOpen],
  );

  const expandAll = useCallback(() => {
    setOpenIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const collapseAll = useCallback(() => {
    setOpenIds(new Set());
  }, []);

  return { isOpen, setOpen, toggle, expandAll, collapseAll, openIds };
}
