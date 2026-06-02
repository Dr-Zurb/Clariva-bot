"use client";

/**
 * Bridges PrescriptionForm send handlers to sibling overlays (PlanActionFooter)
 * inside the cockpit middle bottom-row. cmr-06 wraps the bottom-row with
 * `<RxFormActionsBridgeProvider>` so footer + RxPane share one registration
 * surface without duplicating the send pipeline.
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

/** PrescriptionForm registers when `actionsInFooter` is true. */
export function useRegisterRxFormActions(): RegisterFn {
  return useContext(RxFormActionsRegisterContext);
}

/** PlanActionFooter reads the live send handlers from PrescriptionForm. */
export function useRxFormActions(): RxFormActionsRegistration | null {
  return useContext(RxFormActionsContext);
}
