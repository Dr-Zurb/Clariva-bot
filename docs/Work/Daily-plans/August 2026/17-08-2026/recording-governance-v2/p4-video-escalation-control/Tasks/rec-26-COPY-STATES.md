# rec-26 — proposed patient-facing wording

Founder owns the final words (task 5.5). These are the strings in the product today.

## Consent modal

**Title:** Your doctor would like to record video

**Reason:** doctor's sentence, verbatim, in quotes (unchanged)

1. Your doctor can already see you. This choice is only about whether we save the video.
2. If you say yes, we start saving now, for up to 2 minutes. Your doctor can add 2 more minutes once.
3. You can pause or stop saving at any moment. Pause is temporary — you can resume without being asked again. Stop ends saving and turns your camera off until you turn it back on.
4. If you say no, the video is not saved. The visit goes on. Your doctor can still see you, just like now.

No deletion / erasure language. No “escalation”, “composition”, or “Twilio”.

## Status surface matrix

| Audio | Video | Audio line | Video line |
|---|---|---|---|
| on | off | Audio is being saved | Video is not being saved |
| on | recording | Audio is being saved | Saving video · M:SS |
| on | paused | Audio is being saved | Video paused — you can resume |
| paused | recording | Audio recording paused | Saving video · M:SS |
| paused | paused | Audio recording paused | Video paused — you can resume |
| on | settling | Audio is being saved | Stopping video… |

## Controls

- Pause label: **Pause — you can resume**
- Pause aria: Pause video saving; you can resume without being asked again. Audio will continue.
- Stop aria (unchanged instinct): Stop video recording; audio will continue
- Stop confirm: Audio will continue. Your camera will turn off until you turn it back on.
- Offer: **Start saving video** / Your camera is already on. This only starts saving the video.
