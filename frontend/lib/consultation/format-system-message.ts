/**

 * Plan 06 companion-chat system-row copy helpers.

 *

 * voice T1.8 / task-voice-A7 — `mute_changed` rows carry third-person

 * body text from the backend plus `metadata` for self-vs-other copy.

 *

 * voice T2.11 / task-voice-B3 — `hold_changed` rows use the same pattern.

 */



export interface MuteChangedMetadata {

  actor_id?: string;

  actor_role?: string;

  muted?: boolean;

  actor_name?: string;

}



export interface HoldChangedMetadata {

  actor_id?: string;

  actor_role?: string;

  on_hold?: boolean;

  actor_name?: string;

}



function asMuteChangedMetadata(

  metadata: Record<string, unknown> | null | undefined,

): MuteChangedMetadata | null {

  if (!metadata || typeof metadata !== "object") return null;

  return metadata as MuteChangedMetadata;

}



function asHoldChangedMetadata(

  metadata: Record<string, unknown> | null | undefined,

): HoldChangedMetadata | null {

  if (!metadata || typeof metadata !== "object") return null;

  return metadata as HoldChangedMetadata;

}



function formatMuteChangedBody(

  body: string,

  metadata: Record<string, unknown> | null | undefined,

  currentUserId: string,

): string {

  const meta = asMuteChangedMetadata(metadata);

  if (!meta || typeof meta.muted !== "boolean") {

    return body;

  }



  const isSelf =

    typeof meta.actor_id === "string" && meta.actor_id === currentUserId;



  if (isSelf) {

    return meta.muted

      ? "You muted your microphone"

      : "You unmuted your microphone";

  }



  const fallbackName =

    meta.actor_role === "doctor" ? "Doctor" : "Patient";

  const name =

    typeof meta.actor_name === "string" && meta.actor_name.trim().length > 0

      ? meta.actor_name.trim()

      : fallbackName;



  return meta.muted

    ? `${name} muted their microphone`

    : `${name} unmuted their microphone`;

}



function formatHoldChangedBody(

  body: string,

  metadata: Record<string, unknown> | null | undefined,

  currentUserId: string,

): string {

  const meta = asHoldChangedMetadata(metadata);

  if (!meta || typeof meta.on_hold !== "boolean") {

    return body;

  }



  const isSelf =

    typeof meta.actor_id === "string" && meta.actor_id === currentUserId;



  if (isSelf) {

    return meta.on_hold

      ? "You put the call on hold"

      : "You resumed the call";

  }



  const fallbackName =

    meta.actor_role === "doctor" ? "Doctor" : "Patient";

  const name =

    typeof meta.actor_name === "string" && meta.actor_name.trim().length > 0

      ? meta.actor_name.trim()

      : fallbackName;



  return meta.on_hold

    ? `${name} put the call on hold`

    : `${name} resumed the call`;

}



/**

 * Returns the display string for a system row. For `mute_changed` /

 * `hold_changed`, swaps to "You …" when `metadata.actor_id` matches

 * `currentUserId`.

 */

export function formatSystemMessageBody(options: {

  body: string;

  systemEvent?: string | null;

  metadata?: Record<string, unknown> | null;

  currentUserId: string;

}): string {

  const { body, systemEvent, metadata, currentUserId } = options;

  if (systemEvent === "mute_changed") {

    return formatMuteChangedBody(body, metadata, currentUserId);

  }

  if (systemEvent === "hold_changed") {

    return formatHoldChangedBody(body, metadata, currentUserId);

  }

  return body;

}

