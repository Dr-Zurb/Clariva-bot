/**
 * Hard-reliable local-mic mute for Twilio Video.
 *
 * Soft mute (`LocalAudioTrack.disable()`) depends on Twilio syncing a
 * published MediaStreamTrack **clone** onto RTCRtpSender. We've seen that
 * path leave audio live while the UI shows muted. This helper:
 *   1. Calls disable()/enable() (signals remote "muted" state).
 *   2. Forces every known clone + RTCRtpSender.track off/on.
 *   3. Optionally unpublishes (caller) so nothing is on the wire.
 */

export type MuteableLocalAudioTrack = {
  kind?: string;
  disable: () => unknown;
  enable: () => unknown;
  isEnabled?: boolean;
  mediaStreamTrack?: MediaStreamTrack;
  /** Twilio private — present on LocalMediaTrack. */
  _trackSender?: {
    track?: MediaStreamTrack;
    _clones?: Set<{ track?: MediaStreamTrack }> | { track?: MediaStreamTrack }[];
    _senders?: Set<{ track?: MediaStreamTrack | null }> | { track?: MediaStreamTrack | null }[];
  };
};

function forEachCloneOrSender(
  collection:
    | Set<{ track?: MediaStreamTrack | null }>
    | { track?: MediaStreamTrack | null }[]
    | undefined,
  fn: (mst: MediaStreamTrack) => void,
): void {
  if (!collection) return;
  const items = collection instanceof Set ? Array.from(collection) : collection;
  for (const item of items) {
    if (item?.track) fn(item.track);
  }
}

/**
 * Soft-mute every track + force Twilio's published clones / RTP senders.
 * @returns number of tracks updated
 */
export function setLocalAudioTracksMuted(
  tracks: readonly MuteableLocalAudioTrack[],
  muted: boolean,
): number {
  if (tracks.length === 0) return 0;

  for (const track of tracks) {
    try {
      if (muted) track.disable();
      else track.enable();
    } catch {
      /* stopped tracks throw — keep going */
    }

    // Source MST
    try {
      if (track.mediaStreamTrack) {
        track.mediaStreamTrack.enabled = !muted;
      }
    } catch {
      /* ignore */
    }

    const sender = track._trackSender;
    if (!sender) continue;

    try {
      if (sender.track) sender.track.enabled = !muted;
    } catch {
      /* ignore */
    }

    forEachCloneOrSender(sender._clones, (mst) => {
      mst.enabled = !muted;
    });
    // RTCRtpSender.track is what actually hits the wire.
    forEachCloneOrSender(sender._senders, (mst) => {
      mst.enabled = !muted;
    });
  }

  return tracks.length;
}

export function localAudioTracksDisagreeWithMute(
  tracks: readonly MuteableLocalAudioTrack[],
  muted: boolean,
): boolean {
  return tracks.some((t) => {
    if (typeof t.isEnabled === "boolean") {
      return t.isEnabled === muted;
    }
    if (t.mediaStreamTrack) {
      return t.mediaStreamTrack.enabled === muted;
    }
    return false;
  });
}

export type LocalParticipantAudioApi = {
  audioTracks: { forEach: (cb: (publication: { track?: MuteableLocalAudioTrack | null }) => void) => void };
  unpublishTrack: (track: MuteableLocalAudioTrack) => unknown;
  publishTrack: (track: MuteableLocalAudioTrack) => Promise<unknown> | unknown;
};

/**
 * Unpublish every local audio track (hard mute — nothing on the wire).
 * Tracks stay alive in memory for later republish.
 */
export function unpublishLocalAudioTracks(
  participant: LocalParticipantAudioApi | null | undefined,
  tracks: readonly MuteableLocalAudioTrack[],
): void {
  if (!participant) return;
  for (const track of tracks) {
    try {
      participant.unpublishTrack(track);
    } catch {
      /* already unpublished */
    }
  }
}

/**
 * Republish local audio tracks after hard mute. Skips tracks that are
 * already published.
 */
export async function republishLocalAudioTracks(
  participant: LocalParticipantAudioApi | null | undefined,
  tracks: readonly MuteableLocalAudioTrack[],
): Promise<void> {
  if (!participant) return;
  const published = new Set<MuteableLocalAudioTrack>();
  participant.audioTracks.forEach((publication) => {
    if (publication.track) published.add(publication.track);
  });
  for (const track of tracks) {
    if (published.has(track)) continue;
    try {
      track.enable();
      await Promise.resolve(participant.publishTrack(track));
    } catch {
      /* publish race — next toggle can retry */
    }
  }
}
