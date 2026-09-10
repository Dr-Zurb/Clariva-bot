import { describe, it, expect, vi } from "vitest";
import {
  localAudioTracksDisagreeWithMute,
  republishLocalAudioTracks,
  setLocalAudioTracksMuted,
  unpublishLocalAudioTracks,
  type MuteableLocalAudioTrack,
} from "../mute-local-audio";

function makeTrack(initialEnabled = true): MuteableLocalAudioTrack & {
  _enabled: boolean;
  cloneTrack: { enabled: boolean };
  rtpTrack: { enabled: boolean };
} {
  const cloneTrack = { enabled: initialEnabled };
  const rtpTrack = { enabled: initialEnabled };
  const state = {
    _enabled: initialEnabled,
    cloneTrack,
    rtpTrack,
    isEnabled: initialEnabled,
    mediaStreamTrack: { enabled: initialEnabled } as MediaStreamTrack,
    _trackSender: {
      track: { enabled: initialEnabled } as MediaStreamTrack,
      _clones: new Set([{ track: cloneTrack }]),
      _senders: new Set([{ track: rtpTrack }]),
    },
    disable() {
      if (this._enabled) {
        this._enabled = false;
        this.isEnabled = false;
        (this.mediaStreamTrack as { enabled: boolean }).enabled = false;
      }
    },
    enable() {
      if (!this._enabled) {
        this._enabled = true;
        this.isEnabled = true;
        (this.mediaStreamTrack as { enabled: boolean }).enabled = true;
      }
    },
  };
  return state;
}

describe("setLocalAudioTracksMuted", () => {
  it("returns 0 for empty list", () => {
    expect(setLocalAudioTracksMuted([], true)).toBe(0);
  });

  it("disables track, clone, and RTCRtpSender.track when muting", () => {
    const track = makeTrack(true);
    expect(setLocalAudioTracksMuted([track], true)).toBe(1);
    expect(track.isEnabled).toBe(false);
    expect(track.cloneTrack.enabled).toBe(false);
    expect(track.rtpTrack.enabled).toBe(false);
  });

  it("enables track, clone, and RTCRtpSender.track when unmuting", () => {
    const track = makeTrack(false);
    track.cloneTrack.enabled = false;
    track.rtpTrack.enabled = false;
    expect(setLocalAudioTracksMuted([track], false)).toBe(1);
    expect(track.isEnabled).toBe(true);
    expect(track.cloneTrack.enabled).toBe(true);
    expect(track.rtpTrack.enabled).toBe(true);
  });
});

describe("unpublish / republish", () => {
  it("unpublishes every track on hard mute", () => {
    const track = makeTrack(true);
    const unpublishTrack = vi.fn();
    const participant = {
      audioTracks: { forEach: vi.fn() },
      unpublishTrack,
      publishTrack: vi.fn(),
    };
    unpublishLocalAudioTracks(participant, [track]);
    expect(unpublishTrack).toHaveBeenCalledWith(track);
  });

  it("republishes only tracks that are not already published", async () => {
    const track = makeTrack(false);
    const other = makeTrack(true);
    const publishTrack = vi.fn(async () => undefined);
    const participant = {
      audioTracks: {
        forEach: (cb: (p: { track?: MuteableLocalAudioTrack }) => void) => {
          cb({ track: other });
        },
      },
      unpublishTrack: vi.fn(),
      publishTrack,
    };
    await republishLocalAudioTracks(participant, [track, other]);
    expect(publishTrack).toHaveBeenCalledTimes(1);
    expect(publishTrack).toHaveBeenCalledWith(track);
    expect(track.isEnabled).toBe(true);
  });
});

describe("localAudioTracksDisagreeWithMute", () => {
  it("detects live track while muted intent", () => {
    const track = makeTrack(true);
    expect(localAudioTracksDisagreeWithMute([track], true)).toBe(true);
    setLocalAudioTracksMuted([track], true);
    expect(localAudioTracksDisagreeWithMute([track], true)).toBe(false);
  });
});
