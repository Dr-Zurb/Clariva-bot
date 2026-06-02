"use client";

import { createContext, useContext } from "react";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";

const PrescriptionFormShellContext = createContext<RxFormProviderSetup | null>(null);

export function PrescriptionFormShellProvider({
  value,
  children,
}: {
  value: RxFormProviderSetup;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <PrescriptionFormShellContext.Provider value={value}>
      {children}
    </PrescriptionFormShellContext.Provider>
  );
}

/** Present when `PrescriptionForm` is mounted under the patient-profile shell (csf-01). */
export function usePrescriptionFormShell(): RxFormProviderSetup | null {
  return useContext(PrescriptionFormShellContext);
}
