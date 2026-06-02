"use client";

import { createContext, useContext } from "react";
import {
  useRxSafetySurface,
  type RxSafetySurfaceValue,
  type UseRxSafetySurfaceArgs,
} from "@/lib/ehr/use-rx-safety-surface";

const RxSafetyContext = createContext<RxSafetySurfaceValue | null>(null);

export function RxSafetyProvider({
  token,
  patientId,
  children,
}: UseRxSafetySurfaceArgs & { children: React.ReactNode }): JSX.Element {
  const value = useRxSafetySurface({ token, patientId });
  return (
    <RxSafetyContext.Provider value={value}>{children}</RxSafetyContext.Provider>
  );
}

/** Present under `<RxSafetyProvider>` (patient profile shell or standalone form). */
export function useRxSafety(): RxSafetySurfaceValue {
  const ctx = useContext(RxSafetyContext);
  if (ctx == null) {
    throw new Error("useRxSafety must be used within <RxSafetyProvider>");
  }
  return ctx;
}

/** Optional consumer for surfaces that may mount outside the provider (tests). */
export function useOptionalRxSafety(): RxSafetySurfaceValue | null {
  return useContext(RxSafetyContext);
}
