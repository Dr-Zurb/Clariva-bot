"use client";

import { useEffect, useState } from "react";
import type { LocalParticipant, RemoteParticipant } from "twilio-video";

/**
 * Sub-batch A · task-video-A8 — Twilio Network Quality API wrapper.
 *
 * Twilio reports `participant.networkQualityLevel` as an integer in the
 * range 0–5 (or `null` until the SDK has enough samples). The value is
 * only populated when the room is connected with the
 * `networkQuality: { local, remote }` option — `<VideoRoom>` opts in.
 *
 *   level 0  → no signal / disconnected
 *   level 1  → very poor   (1 bar, red)
 *   level 2  → poor        (1 bar, red)
 *   level 3  → fair        (2 bars, yellow)
 *   level 4  → good        (3 bars, green)
 *   level 5  → excellent   (4 bars, green)
 *
 * The hook subscribes to the participant's `'networkQualityLevelChanged'`
 * event and tears down on unmount / participant change. The
 * `lastUpdated` field gives consumers a "freshness" signal — if the
 * room disconnects mid-call, the level stops updating but stays at the
 * last-known value, so rendering "Last seen 2m ago" is the consumer's
 * job (today's UI just renders the bars + a 30s-stale chip in the
 * tooltip; the hook just exposes the data).
 *
 * Canonical implementation for video A8 and voice A4. Kept
 * in `frontend/hooks/` (not `frontend/components/consultation/hooks/`)
 * so cross-modality reuse is a same-tree import.
 */
export interface NetworkQualityState {
  /**
   * Twilio's network quality level for this participant. `null` until
   * the SDK collects enough samples (~3-5s after connect) OR when the
   * room is mounted without the `networkQuality` connect option.
   */
  level: number | null;
  /**
   * `Date` of the last `networkQualityLevelChanged` event (or the
   * initial mount snapshot). Consumers use this to detect stale data
   * after a disconnect.
   */
  lastUpdated: Date | null;
}

/**
 * Subscribe to a Twilio participant's network quality level. Pass
 * `null` (e.g. before the remote participant joins) to get a stable
 * `{ level: null, lastUpdated: null }` placeholder; the hook handles
 * the participant arriving / leaving via the `participant` dep.
 */
export function useNetworkQuality(
  participant: LocalParticipant | RemoteParticipant | null,
): NetworkQualityState {
  const [state, setState] = useState<NetworkQualityState>(() => ({
    // Read the initial value synchronously if the participant is
    // already in a connected state by the time we mount — otherwise
    // wait for the first `'networkQualityLevelChanged'` event to seed.
    level:
      typeof participant?.networkQualityLevel === "number"
        ? participant.networkQualityLevel
        : null,
    lastUpdated:
      typeof participant?.networkQualityLevel === "number" ? new Date() : null,
  }));

  useEffect(() => {
    if (!participant) {
      // Reset state when the participant slot becomes empty (remote
      // disconnects before unmount). Avoids stale level lingering on
      // the UI until the next remote joins.
      setState({ level: null, lastUpdated: null });
      return;
    }

    // Re-seed on participant change — the previous closure may have
    // captured a stale participant if the parent swaps remotes (e.g.
    // multi-tab kick path in E3 returns the same room with a fresh
    // participant identity).
    setState({
      level:
        typeof participant.networkQualityLevel === "number"
          ? participant.networkQualityLevel
          : null,
      lastUpdated:
        typeof participant.networkQualityLevel === "number" ? new Date() : null,
    });

    const handler = (level: number | null) => {
      setState({
        level: typeof level === "number" ? level : null,
        lastUpdated: new Date(),
      });
    };

    participant.on("networkQualityLevelChanged", handler);
    return () => {
      participant.off("networkQualityLevelChanged", handler);
    };
  }, [participant]);

  return state;
}

/**
 * Map Twilio's 0-5 level to the number of "active" bars rendered
 * (out of 4). Centralized so `<NetworkBars>` AND any future caller
 * (E1's adaptive-bitrate trigger threshold check, E6's QoS sampler)
 * agree on the visual mapping.
 *
 *   level 0       → 0 bars (disconnected — pulse the placeholder)
 *   level 1 or 2  → 1 bar
 *   level 3       → 2 bars
 *   level 4       → 3 bars
 *   level 5       → 4 bars
 *
 * Returns 0 when level is `null` (no data yet); consumers can show a
 * "measuring…" placeholder for that case.
 */
export function networkLevelToBars(level: number | null): 0 | 1 | 2 | 3 | 4 {
  if (level == null) return 0;
  if (level <= 0) return 0;
  if (level <= 2) return 1;
  if (level === 3) return 2;
  if (level === 4) return 3;
  return 4;
}
