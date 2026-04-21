"use client";

import type { ReactNode } from "react";
import type { Appointment } from "@/types/appointment";

/**
 * Modality-agnostic host that frames the active consultation.
 *
 * Plan 03 · Task 20 ships the slot-based shell; later plans fill the slots:
 *   - Plan 02 Task 27 → `bannerSlot` (`<SessionStartBanner>`)
 *   - Plan 07         → `recordingSlot` (`<RecordingControls>`)
 *   - Plan 09         → `modalitySwitchSlot` (`<ModalityChangeLauncher>`)
 *   - Plan 04         → text room (`<TextConsultRoom>`) replaces the placeholder
 *   - Plan 05         → voice room (`<VoiceConsultRoom>`) replaces the placeholder
 *
 * Layout order is deterministic: banner → recording → room → switch.
 *
 * NO STATE OF ITS OWN — pure composition. Session lifecycle (token, room SID,
 * in-room booleans) lives in `<ConsultationLauncher>` so the panel is reusable
 * across modalities without coordinating with a state machine.
 *
 * The room itself is supplied by the launcher via `roomSlot` (e.g. a configured
 * `<VideoRoom accessToken=… roomName=… onDisconnect=… />`). When `roomSlot` is
 * omitted, the panel falls back to a per-modality "Coming soon" placeholder
 * sourced from `modality`.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-20-consultation-launcher-and-live-panel.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-03-doctor-modality-launcher.md
 */
export interface LiveConsultPanelProps {
  appointment: Appointment;
  /** Doctor JWT — kept on the prop surface for forward-compatibility with
   *  Plans 04 / 05 / 07 which will need it for session-create / recording calls. */
  token: string;
  modality: "text" | "voice" | "video";
  /** Backend session id (`consultation_sessions.id`). Null pre-session. */
  sessionId?: string | null;
  /** Plan 02's session-start banner; rendered at the top when truthy. */
  bannerSlot?: ReactNode;
  /** Plan 07's recording controls; rendered just below the banner when truthy. */
  recordingSlot?: ReactNode;
  /** Plan 09's modality-switch launcher; rendered at the bottom when truthy. */
  modalitySwitchSlot?: ReactNode;
  /** The active room element. Launcher constructs and passes the right
   *  modality-specific child (e.g. `<VideoRoom .../>`). When omitted, the panel
   *  renders a per-modality placeholder. */
  roomSlot?: ReactNode;
}

export default function LiveConsultPanel({
  modality,
  bannerSlot,
  recordingSlot,
  modalitySwitchSlot,
  roomSlot,
}: LiveConsultPanelProps) {
  return (
    <div className="space-y-4">
      {bannerSlot ? <div data-slot="banner">{bannerSlot}</div> : null}
      {recordingSlot ? <div data-slot="recording">{recordingSlot}</div> : null}

      <div data-slot="room">
        {roomSlot ?? <RoomPlaceholder modality={modality} />}
      </div>

      {modalitySwitchSlot ? (
        <div data-slot="modality-switch">{modalitySwitchSlot}</div>
      ) : null}
    </div>
  );
}

function RoomPlaceholder({ modality }: { modality: "text" | "voice" | "video" }) {
  const copy =
    modality === "text"
      ? "Text consult room — Plan 04"
      : modality === "voice"
        ? "Voice consult room — Plan 05"
        : "Video consult room";
  return (
    <div
      role="status"
      className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600"
    >
      {copy}
    </div>
  );
}
