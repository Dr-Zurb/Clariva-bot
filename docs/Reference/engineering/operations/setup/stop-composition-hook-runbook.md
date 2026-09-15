# Stop composition hook (cost-cut step 7)

> **Rollout sitting 2 done 12 Sep.** Local `.env` has both
> `VOICE_TRANSCRIPTION_USE_RAW_TRACKS=true` and
> `RECORDING_COMPOSE_ON_DEMAND=true`. Repo defaults stay off. The hook is
> still on. Do not disable it until a real consult transcribes cleanly.

Compositions are **not created in this repo**. There is no `compositions.create`.
Twilio bills `$0.01` / composed minute because of an **account-level Composition Hook**.

| | |
|---|---|
| SID | `HKbe336c348bce4c81907f6a3c55844a82` |
| Name | `haloaid-consult-audio` |
| Created | 2026-08-18 (rec-01) |

**Read paths stay.** Existing `recording_artifact_index` rows (`twilio-composition:CJ…`) still replay, erase, and archive.

## Why this is not a one-line ops flip: composition *is* the transcode

Twilio raw Recordings are **Matroska** — `.mka` for audio (OPUS / PCMU), `.mkv`
for video (VP8 / H264), served as `audio/x-matroska`. Twilio documents them as
"not directly compatible with most standard media players" and points at the
Composition API as the way to get a playable file.

That container is not consumable by anything downstream today:

| Consumer | Accepts Matroska? |
|---|---|
| Browser `<audio>` / `<video>` | No — Safari not at all, Chrome unreliably |
| Groq (`whisper-large-v3-turbo`) | No — flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm only |
| Deepgram Nova-3 | Undocumented — 100+ formats advertised, Matroska not among them |

So the `$0.01`/min is not a redundant convenience charge. It is the only thing
turning per-track media into a file the player and the STT vendor can read.
"Stop composing" therefore means "bring our own transcode".

## The chosen design

Transcode locally with `ffmpeg-static` (a plain npm dependency shipping a
prebuilt binary — no Dockerfile or Render infra change), and compose only when
a human actually asks to watch something:

1. Register raw `RT…` tracks per session at `room-ended`.
2. Transcription downloads the tracks, mixes and resamples them locally, and
   sends one 16 kHz mono file to Groq. One track per speaker also yields
   diarisation for free and removes the worker's wait-for-composition poll.
3. Replay composes **on demand** the first time someone presses play, registers
   the resulting `CJ…` exactly as the webhook does today, and caches it.

You then pay the composition meter only on consults that are actually replayed
rather than on all of them.

This reverses rec-01's "hook, not `compositions.create`" decision. That decision
was made for the always-compose case; on-demand is where code-created
compositions are the right tool.

## Prerequisites before the hook may be disabled

- [x] `twilio-recordings.ts` — list / fetch / mint / delete `RT…`
- [x] `twilio-recording:<RT…>` artifact kind registered, archived, and erased
- [x] Raw tracks registered at `room-ended` and re-swept by the worker
- [x] `ffmpeg-static` transcode in the transcription worker
- [x] On-demand `compositions.create` in the replay mint path
- [x] `patient-consult-timeline-service` counts track kinds as recordings

The code is complete. What remains is a **rollout**, in this order, because
each step is independently reversible and the last one is not:

1. `VOICE_TRANSCRIPTION_USE_RAW_TRACKS=true`, hook still on. Watch a few
   consults transcribe off raw tracks.
2. `RECORDING_COMPOSE_ON_DEMAND=true`, hook still on. This changes nothing
   observable yet — every session still has a hook-made composition, so the
   on-demand path is never reached. It is staged so the flag is already
   proven live when the hook goes off.
3. Disable the hook. From here, new consults compose only when replayed.

Known behaviour change after step 3: the **first** press of play on a consult
returns `409 artifact_not_ready` with "This recording is being prepared",
because composition is asynchronous. The client must retry. Replay of a
consult recorded before the flip is unaffected — its `CJ…` already exists.

## Enabling the raw-track transcription path

`VOICE_TRANSCRIPTION_USE_RAW_TRACKS` (default `false`) switches the worker from
`resolveComposition` to `resolveRawTracks`. Turn it on **before** touching the
hook, and leave the hook on while you watch it — that way both paths are
available and a bad mix is a rollback of one env var rather than an incident.

What to check on the first few consults:

- `voice-transcription-worker: audio lookup threw` should not appear
- `audio-transcode: tracks mixed` reports `trackCount` ≥ 2 for a two-party
  consult; a `trackCount` of 1 means one side's track never finalised
- transcript text covers **both** speakers — a one-sided transcript is the
  signature of a broken `adelay`/`amix` graph
- `audio-transcode: mixed output is close to the vendor upload cap` means a
  long consult is approaching Groq's 25 MB limit and the format needs
  revisiting before it starts failing

Roll back by setting the flag to `false`. Rows that already failed stay failed;
requeue them if you want them retried on the composition path.

## Enabling on-demand composition

`RECORDING_COMPOSE_ON_DEMAND` (default `false`) lets a replay request compose a
session that has raw tracks but no `CJ…`. It is the only switch in the codebase
that can start a billable job from a read endpoint, so it is guarded three ways:

- Twilio's own composition list is the idempotency key — a room that already
  has one enqueued, processing, or completed never gets a second
- a room with no completed raw tracks is refused rather than composed empty
- the whole path is skipped when an artifact already resolves normally

Watch for `compose-on-demand: composition requested at play time`. Its rate is
your real replay rate, and therefore your actual bill: the ₹5.7 saving assumes
roughly 10%. If that line appears on most consults, the economics of this whole
step need rechecking.

`compose-on-demand: composition already in flight` is healthy — it is the guard
working while a user retries.

## How to disable, once the list above is complete (do not delete)

Twilio Console → **Video → Composition Hooks** → `haloaid-consult-audio` → **Enabled = off**.

Or:

```
POST https://video.twilio.com/v1/CompositionHooks/HKbe336c348bce4c81907f6a3c55844a82
Enabled=false
```

Re-enable the same hook to restore always-compose. Because compositions and
recordings are independent Twilio resources, re-enabling never recovers a
consult whose room has already ended.

## Not in scope

- Does not move rooms to LiveKit (step 8, gated on the BAA tier — Scale at
  `$500`/mo exceeds the entire saving until roughly 1,600 consults/month)
- Does not write Cloudflare R2 (step 9, which does **not** depend on LiveKit
  and becomes cheap once a local transcode exists — but makes Cloudflare a PHI
  processor, so it needs a DPA first)
