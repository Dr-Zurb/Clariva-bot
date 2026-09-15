"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const FLASH_MS = 1000;

export const DESTINATION_FLASH_CLASS =
  "ring-2 ring-inset ring-primary/50 bg-primary/10";

interface DestinationFlashValue {
  flashingPaneIds: ReadonlySet<string>;
  flashPanes: (paneIds: readonly string[]) => void;
}

const DestinationFlashContext = createContext<DestinationFlashValue>({
  flashingPaneIds: new Set(),
  flashPanes: () => {},
});

export function DestinationFlashProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [flashingPaneIds, setFlashingPaneIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const timerRef = useRef<number | null>(null);

  const flashPanes = useCallback((paneIds: readonly string[]) => {
    const unique = Array.from(new Set(paneIds.filter(Boolean)));
    if (unique.length === 0) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setFlashingPaneIds(new Set(unique));
    timerRef.current = window.setTimeout(() => {
      setFlashingPaneIds(new Set());
      timerRef.current = null;
    }, FLASH_MS);
  }, []);

  const value = useMemo(
    () => ({ flashingPaneIds, flashPanes }),
    [flashingPaneIds, flashPanes],
  );

  return (
    <DestinationFlashContext.Provider value={value}>
      {children}
    </DestinationFlashContext.Provider>
  );
}

export function useDestinationFlash(): DestinationFlashValue {
  return useContext(DestinationFlashContext);
}
