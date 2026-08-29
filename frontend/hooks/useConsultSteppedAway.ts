"use client";

import { useEffect, useState } from "react";
import {
  CONSULT_STEPPED_AWAY_EVENT,
  isConsultSteppedAway,
} from "@/lib/cockpit/consult-stepped-away";

/** Reactive read of the client-local stepped-away flag for an appointment. */
export function useConsultSteppedAway(appointmentId: string): boolean {
  const [away, setAway] = useState(() => isConsultSteppedAway(appointmentId));

  useEffect(() => {
    const sync = () => setAway(isConsultSteppedAway(appointmentId));
    sync();

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ appointmentId?: string }>).detail;
      if (detail?.appointmentId && detail.appointmentId !== appointmentId) return;
      sync();
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key != null &&
        !event.key.endsWith(appointmentId) &&
        !event.key.includes(appointmentId)
      ) {
        return;
      }
      sync();
    };

    window.addEventListener(CONSULT_STEPPED_AWAY_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CONSULT_STEPPED_AWAY_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [appointmentId]);

  return away;
}
