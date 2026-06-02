# Task text-C3: Voice-to-text dictation (Web Speech API; locale-aware; partials local-only)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Patients on mobile typing one-handed during a consult is friction. Doctors dictating clinical observations between patient turns also benefit. Web Speech API's `SpeechRecognition` covers Android Chrome, iOS Safari (iOS 14.5+), desktop Chrome, and Edge. This task adds a microphone button to the composer that toggles dictation; partial transcripts appear styled as gray italic in the textarea; final transcripts replace the gray with normal text.

**Critical PHI hygiene constraint:** Web Speech API in browsers like Chrome routes audio to Google's cloud for transcription. We can't change that — it's the API contract. What we CAN guarantee:

1. **Partial transcripts NEVER leave the device beyond the browser's own pipeline.** They never INSERT to DB, never broadcast, never log to console / Sentry / analytics.
2. **Final transcripts only land in DB when the user taps Send.** Same as typed text — the user controls when the words become a persistent message.
3. **The mic button has clear "Recording" state.** Visible red dot + waveform animation + tooltip explaining "Audio is processed by your browser; we don't store it.".
4. **Auto-stop after 30 s of silence** to prevent runaway recordings.
5. **Locale auto-detect** — `navigator.language` for default, but allow doctor-side to override per-consult (e.g. patient is Marathi-speaking but `navigator.language === 'en-IN'`).

**Estimated time:** ~6 hours.

**Status:** Done.

**Depends on:** None hard. Independent of every other Sub-batch C task.

**Source plan:** [T6 §T6.40](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **Feature detection** — `'webkitSpeechRecognition' in window || 'SpeechRecognition' in window`. If absent (older Firefox, certain WebViews), the mic button doesn't render.
- [x] **`useSpeechRecognition` hook** at `frontend/lib/text/use-speech-recognition.ts`:
  ```ts
  interface UseSpeechRecognitionOptions {
    locale?: string;                       // defaults to navigator.language
    onPartial: (text: string) => void;     // called on interim results — local-only
    onFinal: (text: string) => void;       // called when a final result lands
    onError: (err: SpeechRecognitionError) => void;
    silenceTimeoutMs?: number;             // defaults to 30_000
  }
  // Returns { isListening, start, stop }
  ```
  Internally instantiates `SpeechRecognition`, sets `continuous = true`, `interimResults = true`, `lang = locale`. Resets a silence-timer on each result; stops on timeout.
- [x] **Mic button in composer**:
  ```tsx
  <button
    type="button"
    onClick={() => isListening ? stop() : start()}
    aria-pressed={isListening}
    aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
    className={`p-2 rounded-full ${isListening ? 'bg-red-100 animate-pulse' : 'hover:bg-gray-100'}`}
    title={isListening ? 'Recording — tap to stop' : 'Dictate (audio processed by your browser; not stored)'}
  >
    🎙
  </button>
  ```
  Recording state shows a small red dot + pulse animation; not over-engineered.
- [x] **Partial-render in textarea** — local state `partialTranscript: string`; rendered as a gray-italic suffix to the existing `composerBody`. The textarea VALUE remains `composerBody`; the partial overlay is rendered ABOVE the textarea via absolute positioning to avoid mutating the textarea state on every partial.
  - Alternative simpler approach: append partials directly to `composerBody`, then on next-partial / final, replace the previous partial. Trade-off: simpler code, but caret position jumps on every interim. Pick the overlay approach for production-grade UX.
- [x] **Final result appends** to `composerBody` (with a leading space if `composerBody` is non-empty and doesn't already end in whitespace).
- [x] **Auto-stop on send** — when the user taps Send (or Enter-to-send), `stop()` is called even if the user forgot to tap the mic.
- [x] **30 s silence timeout** — auto-stop and toast `Stopped recording after 30s silence.`.
- [x] **Locale handling** — default `navigator.language`; allow override via a small select beside the mic button (e.g. dropdown with `en-IN` / `mr-IN` / `hi-IN`). The option list is hard-coded to the project's supported locales for v1.
- [x] **PHI hygiene assertions** — test file at `frontend/lib/text/__tests__/use-speech-recognition.test.ts` asserts that `onPartial` calls never trigger DB INSERTs (mock the supabase client; assert never called during dictation).
- [x] **Three-host parity** — mic button visible in all three layouts. In `panel` (narrow), locale select shows compact locale codes (`en-IN`, etc.) instead of full labels to save horizontal space.
- [x] **`mode='readonly'`** — composer hidden; mic never reachable.
- [x] **Permission handling** — first tap of the mic prompts the OS for microphone permission; on denial, toast `Microphone permission denied. Enable in browser settings.` and don't keep prompting (track via state).
- [x] Frontend type-check + lint clean. Manual smoke (Chrome desktop): tap mic, speak, see gray partials in real-time, pause 1 s, see final text replace the gray, type more, tap Send. (Mobile Chrome): same flow, verify auto-stop on send.

---

## Out of scope

- **Voice-message persistence** (audio file as attachment). Killed by Plan 06's MIME exclusion.
- **Server-side transcription / on-device transcription via WebAssembly.** Browser-API only; no model bundling.
- **Multi-language detection within a single utterance.** Locale is per-session.
- **Custom medical vocabulary** ("dexamethasone" → less likely mis-transcribed). Out of scope; rely on the browser's general model.
- **Read-back of received messages.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/use-speech-recognition.ts` — **new** (~80 LOC).
- `frontend/lib/text/__tests__/use-speech-recognition.test.ts` — **new** (~50 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mic button + locale select; partial overlay; wire `onFinal` to `setComposerBody`; wire to `handleSend` for auto-stop).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why overlay-on-textarea instead of append-to-state** — appending interim results to `composerBody` then constantly replacing them causes textarea caret jumps and React re-render storms. Overlay isolation is cleaner.
2. **Locale options** — `en-IN` / `en-US` / `hi-IN` / `mr-IN` covers initial deployment. Easy to add more later.
3. **Why `webkitSpeechRecognition` first** — the WebKit-prefixed name has wider support (Safari uses it); the unprefixed `SpeechRecognition` is the spec name. Try `SpeechRecognition` first, fall back to `webkit`.
4. **Auto-stop on tab-hidden** — when `document.visibilityState !== 'visible'`, stop recording. Avoids runaway recording when the user switches apps mid-dictation.
5. **No "always-on" mode.** Each session of dictation is explicitly user-triggered.
6. **PHI in browser pipeline** — document this clearly in the in-app tooltip + in the patient-facing privacy doc (not in scope here, but flag the doc PR for the privacy doc owner).
7. **Why 30 s silence and not 10 s** — clinical dictation has natural pauses (looking at notes, considering wording). 30 s is forgiving enough to not interrupt a real session but short enough to catch "user walked away".

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.40](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **PHI hygiene reference:** existing `<TextConsultRoom>` console-log policy (no body in logs).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
