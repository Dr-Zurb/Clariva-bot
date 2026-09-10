"use client";

/**
 * Lets the appointment cockpit request a temporary "live focus" chrome
 * mode on the dashboard shell (collapse the nav sidebar) while a
 * teleconsult is in progress — without overwriting the doctor's
 * persisted sidebar preference.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface DashboardLiveFocusValue {
  liveFocus: boolean;
  setLiveFocus: (active: boolean) => void;
}

const DashboardLiveFocusContext = createContext<DashboardLiveFocusValue | null>(
  null,
);

export function DashboardLiveFocusProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [liveFocus, setLiveFocusState] = useState(false);
  const setLiveFocus = useCallback((active: boolean) => {
    setLiveFocusState(Boolean(active));
  }, []);
  const value = useMemo(
    () => ({ liveFocus, setLiveFocus }),
    [liveFocus, setLiveFocus],
  );
  return (
    <DashboardLiveFocusContext.Provider value={value}>
      {children}
    </DashboardLiveFocusContext.Provider>
  );
}

export function useDashboardLiveFocus(): DashboardLiveFocusValue {
  const ctx = useContext(DashboardLiveFocusContext);
  if (!ctx) {
    return {
      liveFocus: false,
      setLiveFocus: () => {
        /* no-op outside DashboardShell */
      },
    };
  }
  return ctx;
}
