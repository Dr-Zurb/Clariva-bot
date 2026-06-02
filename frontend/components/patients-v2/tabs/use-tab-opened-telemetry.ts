"use client";

import { useEffect, useRef } from "react";
import { trackPatientsV2TabOpened } from "@/lib/patients-v2/telemetry";

/**
 * Fires `patients_v2.tab_opened` exactly once per tab mount (pr-12).
 */
export function useTabOpenedTelemetry(tabId: string, patientId: string): void {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackPatientsV2TabOpened(tabId, patientId);
  }, [tabId, patientId]);
}
