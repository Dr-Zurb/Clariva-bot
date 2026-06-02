/**
 * Sub-batch B · task-video-B9 (with task-voice-B4) — boosted audio router.
 *
 * Routes a remote `<audio>` element through a Web Audio `GainNode` so
 * the call UI can amplify the remote stream beyond the OS volume cap
 * (× 1.5 max in v1; decision §5 in voice B4 caps at 150 % "above
 * 150 % we get audible distortion").
 *
 * Volume mapping (single source of truth — slider hands a single
 * 0–150 integer to `setVolume`):
 *
 *   0..100   → `audioElement.volume = percent/100`, gain stays 1.0
 *              (uses the OS-volume axis; mixer responds normally).
 *   100..150 → `audioElement.volume = 1.0`, gain = `percent/100`
 *              (1.0–1.5; OS mixer pinned at max, GainNode does the
 *              extra dB lift).
 *
 * Important constraint (voice B4 acceptance §"Important"):
 *   Once `MediaElementAudioSourceNode` is created on an element, the
 *   browser routes its audio through the AudioContext graph EXCLUSIVELY.
 *   The element's `volume` setter still works (still controlled by the
 *   gain stage internally), but OS-level volume mixers no longer see
 *   the audio AS coming from the element — it appears under the tab's
 *   AudioContext output. Surface this to QA so they don't think OS
 *   volume is "broken" when the slider sits in the boost band.
 *
 * Lifecycle:
 *   - `createBoostedAudioRouter(audioElement)` — wraps the element.
 *     Returns `{ setVolume, dispose }`. Caller MUST `dispose()` on
 *     unmount or before re-wrapping a different element; `dispose()`
 *     is idempotent so double-calls are safe.
 *   - iOS Safari quirk: `AudioContext` starts in `suspended` state
 *     until the first user gesture. The router will attempt to
 *     `resume()` on construction (will succeed if a gesture has
 *     already fired) and again on every `setVolume` call (which is
 *     itself a side-effect of a slider drag — a user gesture).
 *
 * ⚠ ONE-SHOT CONSTRAINT (READ THIS BEFORE CALLING `dispose()`):
 *   `createMediaElementSource(audioEl)` may only be called ONCE per
 *   HTMLMediaElement, for the LIFETIME of that element in the DOM.
 *   The browser permanently claims the element for that source node;
 *   the claim survives `source.disconnect()`, `gain.disconnect()`,
 *   and `audioContext.close()`. A second
 *   `createMediaElementSource(sameAudioEl)` will ALWAYS throw
 *   `InvalidStateError: HTMLMediaElement already connected previously
 *   to a different MediaElementSourceNode`. This is a Web Audio spec
 *   guarantee, not a browser quirk — it has no workaround. Callers
 *   that hold a stable `<audio>` element across many call lifecycles
 *   (e.g. the `<VideoRoom>` remote-audio sink, which only unmounts
 *   when the whole room component unmounts) MUST treat the router as
 *   "create once, dispose once with the element". Disposing mid-call
 *   and trying to re-wrap will crash on the next subscribe — and on
 *   Twilio Video specifically, the throw propagates inside
 *   `RemoteParticipant._addTrack` and disconnects the room on BOTH
 *   peers. See `frontend/components/consultation/VideoRoom.tsx`
 *   `wireRemoteAudioTrack` / `unwireRemoteAudioTrack` for the
 *   reference single-dispose pattern.
 *
 * Modality-agnostic: voice B4 will import this verbatim when it
 * picks up the slider. Lives in `lib/audio/` next to A7's
 * `mic-meter.ts` so the audio-helper neighborhood stays cohesive.
 */

export interface BoostedAudioRouter {
  /**
   * Set the playback volume.
   *   percent ∈ [0, 150]
   *   0   → silent
   *   100 → original level
   *   150 → × 1.5 boost above the OS max
   * Out-of-range values are clamped (defensive — the slider is the
   * only call site today and it already clamps, but we don't want a
   * stray buggy caller to set `gain.value = -3` or `1e9`).
   */
  setVolume: (percent: number) => void;
  /**
   * Disconnect all nodes and close the underlying AudioContext.
   * Idempotent — the second call is a no-op. Call this on element
   * unmount OR when re-wrapping a different element (otherwise the
   * old `MediaElementAudioSourceNode` keeps the element pinned to
   * the closed-over context, which prevents a fresh wrap from
   * working).
   */
  dispose: () => void;
}

const MIN_PERCENT = 0;
const MAX_PERCENT = 150;
const BOOST_THRESHOLD = 100;

function clampPercent(percent: number): number {
  if (Number.isNaN(percent)) return 100;
  if (percent < MIN_PERCENT) return MIN_PERCENT;
  if (percent > MAX_PERCENT) return MAX_PERCENT;
  // Round to the nearest integer — the slider is integer-valued and
  // floating-point fuzz on the GainNode side is just noise.
  return Math.round(percent);
}

/**
 * Resolve `window.AudioContext` with the legacy `webkitAudioContext`
 * fallback. Older Safari + some Android Chromium-derived browsers
 * still expose only the prefixed name. SSR returns `null`.
 */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createBoostedAudioRouter(
  audioElement: HTMLAudioElement,
): BoostedAudioRouter {
  const Ctor = getAudioContextCtor();
  // SSR / no-Web-Audio fallback: return a router that ONLY uses the
  // `<audio>` element's own volume setter and refuses the boost band
  // (clamps to 100). Prevents the call UI from crashing in
  // environments where Web Audio is unavailable; the slider just
  // can't go above 100 effectively.
  if (!Ctor) {
    let disposed = false;
    return {
      setVolume(percent) {
        if (disposed) return;
        const safe = Math.min(clampPercent(percent), BOOST_THRESHOLD);
        try {
          audioElement.volume = safe / 100;
        } catch {
          // some test environments throw when setting volume on a
          // mock element — swallow.
        }
      },
      dispose() {
        disposed = true;
      },
    };
  }

  const ctx = new Ctor();

  // Best-effort resume — succeeds if a user gesture already fired
  // (e.g. the user clicked the "Join call" button, which is the
  // gesture chain that mounted us). On iOS Safari pre-gesture this
  // throws / returns a rejected promise; we swallow because the next
  // `setVolume` call is itself a gesture and will resume cleanly.
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {
      // see comment above — pre-gesture resume failures are expected.
    });
  }

  // `createMediaElementSource` MUST run before the element starts
  // playback for some browsers; ours is constructed from a hot
  // `<audio>` element that Twilio is actively attaching to, but the
  // Web Audio spec accepts post-playback wraps too — the source node
  // just starts pulling samples on the next animation frame.
  const source = ctx.createMediaElementSource(audioElement);
  const gain = ctx.createGain();
  gain.gain.value = 1.0;

  source.connect(gain);
  gain.connect(ctx.destination);

  let disposed = false;

  const setVolume = (percent: number) => {
    if (disposed) return;
    const safe = clampPercent(percent);
    if (safe <= BOOST_THRESHOLD) {
      // OS-volume axis. Pin the gain at unity so the boost band is
      // strictly opt-in.
      try {
        audioElement.volume = safe / 100;
      } catch {
        // see SSR fallback comment.
      }
      gain.gain.value = 1.0;
    } else {
      // Boost band. Pin the element at OS-max and route the extra
      // dB through the GainNode.
      try {
        audioElement.volume = 1.0;
      } catch {
        // ditto.
      }
      gain.gain.value = safe / 100;
    }

    // Re-attempt resume on every volume call. This is the gesture
    // chain that finally wakes iOS Safari's suspended context.
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        // we're inside a user-gesture handler; resume should succeed
        // on a real device. Swallow on test environments.
      });
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      source.disconnect();
    } catch {
      // already disconnected.
    }
    try {
      gain.disconnect();
    } catch {
      // already disconnected.
    }
    if (ctx.state !== "closed") {
      void ctx.close().catch(() => {
        // best-effort — context may already be closing.
      });
    }
  };

  return { setVolume, dispose };
}
