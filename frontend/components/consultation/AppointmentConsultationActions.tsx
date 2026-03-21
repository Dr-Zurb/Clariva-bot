"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startConsultation, getConsultationToken } from "@/lib/api";
import type { Appointment } from "@/types/appointment";
import VideoRoom from "./VideoRoom";
import PatientJoinLink from "./PatientJoinLink";
import MarkCompletedForm from "./MarkCompletedForm";

interface AppointmentConsultationActionsProps {
  appointment: Appointment;
  token: string;
}

interface ConsultationData {
  doctorToken: string;
  roomName: string;
  patientJoinUrl: string;
}

/**
 * Client component: Start consultation, video room, patient link, mark completed.
 * @see e-task-6
 */
export default function AppointmentConsultationActions({
  appointment,
  token,
}: AppointmentConsultationActionsProps) {
  const router = useRouter();
  const [consultationData, setConsultationData] = useState<ConsultationData | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const canStartConsultation =
    (appointment.status === "pending" || appointment.status === "confirmed") &&
    !appointment.consultation_room_sid;

  const consultationStarted = !!(
    consultationData || appointment.consultation_room_sid
  );

  // When room already exists (e.g. page refresh), fetch token to join
  useEffect(() => {
    if (
      appointment.consultation_room_sid &&
      !consultationData &&
      (appointment.status === "pending" || appointment.status === "confirmed")
    ) {
      const fetchToken = async () => {
        try {
          const res = await startConsultation(token, appointment.id);
          setConsultationData({
            doctorToken: res.data.doctorToken,
            roomName: res.data.roomName,
            patientJoinUrl: res.data.patientJoinUrl,
          });
        } catch {
          // Fallback: try getConsultationToken (doctor path)
          try {
            const tokenRes = await getConsultationToken(token, appointment.id);
            setConsultationData({
              doctorToken: tokenRes.data.token,
              roomName: tokenRes.data.roomName,
              patientJoinUrl: "", // Will show config message
            });
          } catch {
            // Ignore
          }
        }
      };
      fetchToken();
    }
  }, [appointment.consultation_room_sid, appointment.id, appointment.status, consultationData, token]);

  const handleStartConsultation = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const res = await startConsultation(token, appointment.id);
      setConsultationData({
        doctorToken: res.data.doctorToken,
        roomName: res.data.roomName,
        patientJoinUrl: res.data.patientJoinUrl,
      });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start consultation");
    } finally {
      setStarting(false);
    }
  };

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Start consultation button */}
      {canStartConsultation && !consultationData && (
        <div>
          <button
            type="button"
            onClick={handleStartConsultation}
            disabled={starting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            {starting ? "Starting…" : "Start consultation"}
          </button>
          {startError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {startError}
            </p>
          )}
        </div>
      )}

      {/* Video room + patient link when consultation started */}
      {consultationData && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Video call</h2>
            <VideoRoom
              accessToken={consultationData.doctorToken}
              roomName={consultationData.roomName}
              onDisconnect={handleRefresh}
            />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Patient join link</h2>
            <PatientJoinLink patientJoinUrl={consultationData.patientJoinUrl} />
          </div>
        </>
      )}

      {/* Mark as completed - show when consultation started or for in-clinic */}
      {(consultationStarted || appointment.status !== "completed") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Mark as completed</h2>
          <MarkCompletedForm
            appointmentId={appointment.id}
            token={token}
            onSuccess={handleRefresh}
          />
        </div>
      )}
    </div>
  );
}
