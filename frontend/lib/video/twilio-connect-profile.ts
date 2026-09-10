/**
 * Connect-time Twilio Video options for 1:1 / small-group consults.
 *
 * Structural types instead of `twilio-video` imports, for the same reason
 * `twilio-stats-parse.ts` avoids them: these helpers stay unit-testable
 * without a Twilio mock.
 */

/**
 * H.264 first so phones (especially iOS Safari) use the hardware encoder
 * instead of VP8 software — the main encode-delay source even on a fast
 * link. VP8 stays as fallback with simulcast off (Decision §23: two-party
 * calls don't benefit from three encode layers, and H.264 can't simulcast
 * anyway).
 */
export const CONSULT_PREFERRED_VIDEO_CODECS: Array<
  "H264" | { codec: "VP8"; simulcast: false }
> = ["H264", { codec: "VP8", simulcast: false }];

/** Default Auto publish — 720p30. Hard 640×480@24 looked soft in Consult. */
export const AUTO_PUBLISH_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
} as const;

/**
 * `mode: 'grid'` — every track gets equal priority. Under `'collaboration'`
 * the dominant speaker is favoured, so the patient's video was downgraded
 * for as long as the doctor was talking, which reads as stutter/lag exactly
 * when the doctor is describing what they want to look at.
 *
 * `contentPreferencesMode: 'manual'` — the default `'auto'` sizes the
 * requested resolution to the attached `<video>` element, so a small
 * Consult pane made Twilio ask the sender for a low-res stream. That is
 * unrecoverable when the doctor zooms in on a lesion. Manual mode with no
 * per-track override means "send what you publish" (still bounded by
 * `maxSubscriptionBitrate`). Note the sibling `renderDimensions` option is
 * deprecated in the SDK — per-track content preferences replaced it.
 *
 * `clientTrackSwitchOffControl: 'manual'` — auto switch-off unsubscribes
 * the remote camera when the element is briefly 0×0 during cockpit layout,
 * then resubscribes (freeze).
 */
export function consultVideoBandwidthProfile(maxSubscriptionBitrate: number) {
  return {
    video: {
      mode: "grid" as const,
      maxSubscriptionBitrate,
      contentPreferencesMode: "manual" as const,
      clientTrackSwitchOffControl: "manual" as const,
    },
  };
}

/**
 * Minimal shape of the bits of `RemoteVideoTrack` we drive. All optional so
 * older SDKs (or the screen-share path's loosely-typed tracks) degrade to
 * no-ops rather than throwing.
 */
export interface RemoteVideoQualityTarget {
  kind?: string;
  switchOn?: () => unknown;
  setPriority?: (priority: "low" | "standard" | "high") => unknown;
}

/**
 * Pin an incoming video track to full quality. Required because
 * `clientTrackSwitchOffControl` and `contentPreferencesMode` are both
 * `'manual'` — the SDK no longer manages either for us.
 */
export function pinRemoteVideoQuality(track: RemoteVideoQualityTarget): void {
  if (track.kind !== undefined && track.kind !== "video") return;
  try {
    track.switchOn?.();
  } catch {
    // Older SDKs throw when the track is already on; harmless.
  }
  try {
    track.setPriority?.("high");
  } catch {
    // Priority is advisory; losing it must not break the call.
  }
}
