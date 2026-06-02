"use client";

import { useEffect, useRef } from "react";
import { trackPatientsV2DetailViewed } from "@/lib/patients-v2/telemetry";
import type { Patient } from "@/types/patient";
import { PatientV2Shell } from "./PatientV2Shell";

export interface PatientV2PageProps {
  patient: Patient;
  token: string;
  userId?: string;
}

export function PatientV2Page({ patient, token, userId }: PatientV2PageProps) {
  const detailTelemetrySent = useRef(false);

  useEffect(() => {
    if (detailTelemetrySent.current) return;
    detailTelemetrySent.current = true;
    trackPatientsV2DetailViewed(patient.id);
  }, [patient.id]);

  return <PatientV2Shell patient={patient} token={token} userId={userId} />;
}

export default PatientV2Page;
