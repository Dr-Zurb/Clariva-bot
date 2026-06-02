# Video T5 — Reliability / safety / scale (7 items, ~12 days)

## Adaptive bitrate, audio fallback, multi-tab kick, crash-recovery, push, QoS, cellular warning

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T5 is the heaviest tier — bandwidth management (adaptive bitrate + audio-only fallback) is unique to video and is the **single largest reliability lever** for the modality. Other items inherit from voice T5.

---

## Goal

Make video calls **survive bad networks** (the most common failure mode for video — bandwidth collapses; voice fails far less often) and **survive operational scale** (multi-tab kick, crash-recovery, push, QoS telemetry). Video-specific items: T5.31 adaptive bitrate, T5.32 audio fallback, T5.36 video-specific QoS table, T5.37 cellular-data warning. The rest are siblings of voice T5.

**~12 dev-days.** Largely backend + new schema + WebRTC plumbing.

---

## Status

`Drafted` — **`[SELECTED 2026-04-29]`** — **full tier** (all 7 items).

---

## What's in scope (7 items)

> Every row below is **`[SELECTED 2026-04-29]`**.

| # | Item | Effort | Dep |
|---|------|--------|-----|
| T5.31 | **`[SELECTED 2026-04-29]`** **Adaptive bitrate / simulcast** — Twilio Video automatically degrades video quality when bandwidth drops, but doesn't surface it. T5.31 wires the existing Twilio adaptive-bitrate config + adds UI feedback ("Video quality reduced due to network"). Optional: enable Twilio simulcast for multi-stream sender. | M (~3 days) | none. |
| T5.32 | **`[SELECTED 2026-04-29]`** **Auto-degrade to audio-only on bandwidth catastrophe** — when network quality drops to 0/1 for >10s, automatically disable local video track, post a system message, surface a banner: "Switched to audio-only — your network is too slow for video. [Try video again]". | M (~2 days) | T5.31. |
| T5.33 | **`[SELECTED 2026-04-29]`** **Multi-tab kick** — newest wins; same as voice T5.29 / C4. Reuse the `useTabPresenceClaim` hook. | M (~3 days) | none. |
| T5.34 | **`[SELECTED 2026-04-29]`** **Crash-recovery rejoin** — sessionStorage token cache; same as voice T5.30 / C5. Video adds: re-acquire camera permission on rejoin. | M (~3 days) | none. |
| T5.35 | **`[SELECTED 2026-04-29]`** **Browser push when remote joins** — sibling of voice T5.32 / C3 + text D6a. Shared `push-notification-service.ts`. | S (~2 days) | text D6a or voice C3 (whichever ships first). |
| T5.36 | **`[SELECTED 2026-04-29]`** **QoS health metrics — `video_call_quality` table** — extends voice's pattern with video-specific columns: `resolution_width`, `resolution_height`, `fps_avg`, `frames_dropped_pct`, `bitrate_kbps_send`, `bitrate_kbps_receive`. 30s sampling cadence (decision §13 from voice). | M (~3 days) | none. |
| T5.37 | **`[SELECTED 2026-04-29]`** **Cellular-data warning** — on patient's first video session over cellular (detected via `navigator.connection.type === 'cellular'`), show a one-time prompt: "You're on mobile data — video uses ~XX MB per minute. Continue? [Continue / Switch to audio-only]". | S (~3h) | none. |

---

## Non-goals (explicitly NOT in T5)

- **End-to-end encryption** beyond Twilio's default. Out of scope.
- **Cross-device call handoff** (start on phone, finish on laptop). Out of scope.
- **Background-job recording resumption.** Plan 07 owns.
- **Server-side bandwidth simulation** for QA. Out of scope.

---

## Why each item is in T5

- **T5.31 adaptive bitrate** — the difference between "video works on 4G" and "video crashes on 4G". Twilio supports it; we need to wire the config + surface it in UI. Highest single-lever impact in the entire video roadmap.
- **T5.32 audio fallback** — when bandwidth dies completely, adaptive bitrate isn't enough. Drop to audio-only (which uses ~30 KB/s vs video's 500-2000 KB/s) AND tell the user it happened. Without T5.32, calls die silently when bandwidth goes to zero.
- **T5.33 multi-tab kick** — same as voice. Patient opens consult on phone + tablet; weird state.
- **T5.34 crash-recovery rejoin** — same as voice; video adds camera re-acquire on the rejoin path (camera permissions are sticky in the browser; usually no re-prompt).
- **T5.35 push** — same as voice. Doctor-only push when patient joins.
- **T5.36 QoS table** — same pattern as voice C2 / `voice_call_quality`; sibling video table. Ops needs to know "median fps for clinic X this month" to triage video-quality complaints.
- **T5.37 cellular warning** — patient on a 1 GB/month data plan running a 30-min video consult eats 30% of their plan. They'll be furious. One-time warning prevents the worst case.

---

## Implementation contract per item

### T5.31 — Adaptive bitrate / simulcast

```ts
// In VideoRoom.tsx, on connect:
const room = await connect(accessToken, {
  name: roomName,
  tracks: localTracks,
  // Adaptive bitrate is enabled by default; explicitly configure:
  bandwidthProfile: {
    video: {
      mode: 'collaboration',           // optimize for two-party calls (vs 'grid' for many)
      maxSubscriptionBitrate: 2_400_000, // upper cap
      contentPreferencesMode: 'auto',
    },
  },
  preferredVideoCodecs: ['VP8', 'H264'],
  // Optional: enable simulcast if backend supports it
  // simulcast: true,
});

// UI feedback:
// Subscribe to room.localParticipant.on('trackPublicationFailed') and
// to participant.on('networkQualityLevelChanged'); when network drops:
//   <CallerCardOverlay> recordingPill area shows: "Video quality reduced"
//   amber chip when bitrate has been clamped.

// When network recovers, chip auto-dismisses.
```

- **Decision:** simulcast adds backend cost (multiple streams); recommend **off in v1** (two-party calls don't benefit); revisit when group / 3-way (T3.26) lands.
- **Surface bitrate clamp** in caller card so users know "video looks bad because network is bad" not "the app is broken".

### T5.32 — Auto-degrade to audio-only on bandwidth catastrophe

```ts
// In VideoRoom.tsx, observe network quality:
useEffect(() => {
  if (!room) return;
  let stuckLow = 0;
  const interval = setInterval(() => {
    const lvl = room.localParticipant.networkQualityLevel ?? 5;
    if (lvl <= 1) stuckLow++;
    else stuckLow = 0;
    if (stuckLow >= 5) {  // 5 ticks of 2s each = 10s
      autoDowngradeToAudio();
      stuckLow = 0;
    }
  }, 2000);
  return () => clearInterval(interval);
}, [room]);

const autoDowngradeToAudio = async () => {
  const localVideoTrack = localTracksRef.current.find(t => t.kind === 'video');
  if (!localVideoTrack || (localVideoTrack as LocalVideoTrack).isEnabled === false) return;
  (localVideoTrack as LocalVideoTrack).disable();
  setBandwidthFallback({ active: true, atLevel: room.localParticipant.networkQualityLevel });
  emitSystemMessage({ system_subtype: 'auto_audio_fallback', metadata: { reason: 'bandwidth' } });
};

// Banner: "Switched to audio-only — your network is too slow for video.
//          [Try video again]"
// User-clicked "Try video again" re-enables track AND clears the fallback flag;
// auto-fallback won't re-fire for 60s (cooldown to prevent flapping).
```

- New Plan 06 enum value: `'auto_audio_fallback'`.
- Companion-chat row: "Video automatically disabled due to slow network."
- Both sides see the system message.

### T5.33 — Multi-tab kick

- Reuse voice C4 verbatim. Same `useTabPresenceClaim` hook; same patient-kick / doctor-warn role asymmetry; same coordination with T5.34 (cache contract).

### T5.34 — Crash-recovery rejoin

- Reuse voice C5 with one extension: on rejoin, re-call `getUserMedia({ audio: true, video: true })` to re-acquire camera permission (typically no prompt; just re-attaches the track).
- If camera permission was revoked between sessions, fall back to audio-only with a banner.

### T5.35 — Browser push when remote joins

- Reuse voice C3 verbatim. Doctor-only push (decision §12 from voice batch). Same `tag` convention `'${sessionId}:video'` for cross-modality dedup with text consult D6.

### T5.36 — QoS health metrics — `video_call_quality` table

```sql
CREATE TABLE IF NOT EXISTS video_call_quality (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  user_id               UUID         NOT NULL,
  role                  TEXT         NOT NULL CHECK (role IN ('doctor', 'patient')),
  sampled_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  network_quality_level INT          CHECK (network_quality_level BETWEEN 0 AND 5),
  rtt_ms                INT,
  jitter_ms             INT,
  packet_loss_pct       NUMERIC(5,2),

  -- Video-specific (vs voice_call_quality):
  resolution_width      INT,
  resolution_height     INT,
  fps_avg               NUMERIC(4,1),
  frames_dropped_pct    NUMERIC(5,2),
  bitrate_kbps_send     INT,
  bitrate_kbps_receive  INT,

  twilio_room_sid       TEXT,
  sample_seq            INT          NOT NULL
);

CREATE INDEX video_call_quality_session_idx ON video_call_quality(session_id, sampled_at);
CREATE INDEX video_call_quality_clinic_idx  ON video_call_quality(sampled_at)
  WHERE network_quality_level IS NOT NULL;

ALTER TABLE video_call_quality ENABLE ROW LEVEL SECURITY;
-- Same RLS pattern as voice_call_quality (Plan F04 safe_uuid_sub() invariant)
CREATE POLICY video_call_quality_insert_own ON video_call_quality
  FOR INSERT WITH CHECK (
    user_id = public.safe_uuid_sub()
    AND session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = public.safe_uuid_sub() OR patient_user_id = public.safe_uuid_sub()
    )
  );
CREATE POLICY video_call_quality_select_doctor ON video_call_quality
  FOR SELECT USING (
    session_id IN (SELECT id FROM consultation_sessions WHERE doctor_id = public.safe_uuid_sub())
  );
```

- Same sample cadence as voice (decision §13): 10s for first minute, then 30s.
- Same backend ingest pattern: batched POST every 60s OR on call end.
- Same frontend reporter: `frontend/lib/video/quality-reporter.ts` (sibling of voice's).

### T5.37 — Cellular-data warning

```ts
const isCellular = () => {
  const conn = (navigator as any).connection;
  return conn?.type === 'cellular' || conn?.effectiveType === '3g' || conn?.effectiveType === '4g';
};

// In <VideoConsultPreCall> (T1.7) OR before connect:
if (isCellular() && !localStorage.getItem('cellular-warning-dismissed')) {
  showCellularWarning({
    message: "You're on mobile data. Video uses ~50 MB per 10 minutes.",
    primary: { label: 'Continue with video', onClick: () => continueAsVideo() },
    secondary: { label: 'Switch to audio-only', onClick: () => switchToAudio() },
  });
}
```

- Persistence: localStorage `cellular-warning-dismissed-${date}` (re-prompt monthly is fine; daily would be annoying).
- Numbers conservative (50 MB/10 min ≈ 80 KB/s avg with adaptive bitrate); revisit with telemetry.
- iOS Safari: `navigator.connection` is not exposed; degrade silently (no warning). Not a critical UX gap.

---

## Acceptance criteria

- [ ] **T5.31** — adaptive bitrate active; UI surfaces "Video quality reduced" chip when bitrate clamps; auto-clears when network recovers.
- [ ] **T5.32** — sustained low bandwidth (10s at level ≤1) triggers automatic audio-only fallback; companion chat shows system row; user can re-enable video; 60s cooldown prevents flapping.
- [ ] **T5.33** — same as voice C4 (which see).
- [ ] **T5.34** — same as voice C5 + camera re-acquire on rejoin verified.
- [ ] **T5.35** — same as voice C3 (which see).
- [ ] **T5.36** — `video_call_quality` table populates within 30s of session start; "median fps by clinic this month" SQL runs in <1s; RLS verified; same `safe_uuid_sub()` invariant.
- [ ] **T5.37** — patient on cellular sees one-time warning before joining; choosing "Audio-only" disables video track for the call; choosing "Continue" never re-prompts in the next 30 days.
- [ ] No regression on existing video flow.
- [ ] Backend + frontend type-check + lint clean.
- [ ] Migration `0XX_video_call_quality.sql` forward + reverse cleanly.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VideoRoom.tsx` — every item touches.
- `frontend/components/consultation/BandwidthFallbackBanner.tsx` (**new**, T5.32).
- `frontend/components/consultation/CellularDataWarning.tsx` (**new**, T5.37).
- `frontend/hooks/useTabPresenceClaim.ts` — **reuse from voice C4**, T5.33.
- `frontend/hooks/useVoiceRejoinCache.ts` (**rename to `useCallRejoinCache`**, T5.34) — extends with camera re-acquire.
- `frontend/lib/video/quality-reporter.ts` — **new** (~150 LOC, mirrors voice's).
- `frontend/lib/api.ts` — extend with postVideoQuality.

**Backend:**

- `backend/src/services/video-call-quality-service.ts` (**new**, T5.36) — sibling of voice's.
- `backend/src/routes/api/v1/video-quality.ts` (**new**, T5.36) — sibling.
- (Plan 06 enum extension) — `'auto_audio_fallback'` for T5.32.
- (push-notification-service.ts shared with voice + text) — T5.35.

**Schema:**

- `backend/migrations/0XX_video_call_quality.sql` — **new**, T5.36.
- (Plan 06 enum migration) — `auto_audio_fallback`.

**No new vendor.** Twilio Video adaptive bitrate + simulcast + bandwidth profile are all in the existing SDK.

---

## Open questions / decisions

1. **Simulcast on/off for v1** — recommendation: off (two-party calls don't benefit; cost concern). Revisit for T3.26 three-way.
2. **Auto-fallback threshold** — 10s at level ≤1 recommended; calibrate after first month of telemetry.
3. **Auto-fallback cooldown** — 60s recommended; prevents flapping.
4. **Cellular warning copy specifics** — confirm with product / legal that "~50 MB per 10 min" is a defensible conservative estimate.
5. **`navigator.connection` availability** — iOS Safari doesn't expose; degrade silently. Document.
6. **QoS sample cadence parity with voice** — locked: 10s × 6 then 30s. Same caps storage at ~120 rows/30-min call.
7. **video_call_quality vs reusing voice_call_quality with a `modality` column** — separate tables recommended (different columns; cleaner ops queries). Same pattern as text consult D4 has its own table.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t5-voice-reliability-safety.md](../voice-consult/plan-t5-voice-reliability-safety.md) — siblings T5.29 / T5.30 / T5.32 / T5.33.
- Twilio Video JS SDK — `bandwidthProfile`, simulcast, `getStats()`.
- W3C Network Information API — `navigator.connection`.

---

**Owner:** TBD
**Created:** 2026-04-29
**Last updated:** 2026-04-29 — all T5 items **`[SELECTED 2026-04-29]`**.
**Status:** Drafted + **`[SELECTED 2026-04-29]`** — full tier (7 / 7 items).
