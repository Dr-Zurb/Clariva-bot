"use client";

/**
 * Bridges cockpit-level Rx commit handlers (`useRxCommitActions` /
 * `CockpitRxActionDock`) to PlanSection shortcuts and legacy consumers.
 * Registration lives at the page root — not the Plan pane lifecycle.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface RxFormActionsRegistration {
  sendAndFinish: () => void;
  sending: boolean;
  finishSending: boolean;
  openTemplates?: () => void;
  openPreview?: () => void;
  canSend?: boolean;
}

type RegisterFn = (actions: RxFormActionsRegistration | null) => void;

const RxFormActionsRegisterContext = createContext<RegisterFn>(() => {});
const RxFormActionsContext = createContext<RxFormActionsRegistration | null>(
  null,
);

export function RxFormActionsBridgeProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [actions, setActions] = useState<RxFormActionsRegistration | null>(
    null,
  );
  const register = useCallback((next: RxFormActionsRegistration | null) => {
    setActions(next);
  }, []);

  return (
    <RxFormActionsRegisterContext.Provider value={register}>
      <RxFormActionsContext.Provider value={actions}>
        {children}
      </RxFormActionsContext.Provider>
    </RxFormActionsRegisterContext.Provider>
  );
}

/** `useRxCommitActions` registers at the cockpit page root. */
export function useRegisterRxFormActions(): RegisterFn {
  return useContext(RxFormActionsRegisterContext);
}

/** PlanActionFooter reads the live send handlers from PrescriptionForm. */
export function useRxFormActions(): RxFormActionsRegistration | null {
  return useContext(RxFormActionsContext);
}
