# task-cockpit-fix-5 — Hide `<PatientJoinLink>` once patient has joined

**Lane:** H2 (Launcher cleanup) — runs after fix-2 (and ideally after fix-4).  
**Status:** Drafted.  
**Effort:** S (~30 minutes).  
**Owner:** TBD.  
**Hard deps:** fix-2 (so the launcher's render structure is settled).

---

## Why

The `<PatientJoinLink>` block (the "Patient join link / Copy / Open as patient" affordance) is rendered by `ConsultationLauncher.tsx` inside the live-panel JSX for video consults. It is shown **always**, even after the patient has connected to the call.

Mid-call, that block is noise — it eats cockpit pane height that should belong to the room or the Rx workspace. It's also potentially confusing ("is the patient not actually here?"). The redesign always intended for the link to disappear once the remote participant is present.

This task adds a `hasRemoteParticipant` signal from the room up to the launcher and gates the join link on it.

---

## What you'll change

**Two or three files:**

1. `frontend/components/consultation/VideoRoom.tsx` — add `onRemoteJoined?: () => void` and `onRemoteLeft?: () => void` callback props; fire them when the local `remoteParticipant` state transitions.
2. `frontend/components/consultation/VoiceConsultRoom.tsx` — same callbacks (voice consults also want the link hidden post-join).
3. `frontend/components/consultation/ConsultationLauncher.tsx` — hold local state `hasRemoteParticipant`, set/unset via the callbacks, gate the `<PatientJoinLink>` render on `!hasRemoteParticipant`.

---

## Locked design

### Callback contract

`VideoRoom.tsx` already has:

```ts
const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null);
```

(approximately at line 1044 — confirm before editing.)

Add a `useEffect` that watches `remoteParticipant` and fires the callbacks:

```tsx
useEffect(() => {
  if (remoteParticipant) {
    onRemoteJoined?.();
  } else {
    onRemoteLeft?.();
  }
}, [remoteParticipant, onRemoteJoined, onRemoteLeft]);
```

Add to the props interface:

```tsx
export interface VideoRoomProps {
  // …existing fields…
  onRemoteJoined?: () => void;
  onRemoteLeft?: () => void;
}
```

The same pattern goes in `VoiceConsultRoom.tsx`. The voice room may track presence differently (peer connection state vs. participant) — read the file and use whatever signal already exists for "remote audio is flowing"; **don't add new presence tracking**, just wire callbacks to existing state.

### Launcher gating

In `ConsultationLauncher.tsx`:

```tsx
const [hasRemoteParticipant, setHasRemoteParticipant] = useState(false);

// In the live-panel JSX, where <VideoRoom>/<VoiceConsultRoom> mounts:
<VideoRoom
  /* …existing props… */
  mode="cockpit"
  onRemoteJoined={() => setHasRemoteParticipant(true)}
  onRemoteLeft={() => setHasRemoteParticipant(false)}
/>

// And separately, where <PatientJoinLink> renders today:
{!hasRemoteParticipant && (
  <PatientJoinLink /* existing props */ />
)}
```

Reset `hasRemoteParticipant` to `false` whenever a fresh session starts (use the same effect that sets `liveSession` / `textSession` — when those become `null`, set this to `false` too).

### Don't touch

- The `<PatientJoinLink>` component itself — its internal copy-to-clipboard, "Open as patient" button, etc. are unchanged.
- The pre-call UI (already gated by fix-2 on `!sessionLive`).
- The room's other behaviour.

### Edge cases

- **Patient drops and rejoins.** `hasRemoteParticipant` flips back to `false` on `onRemoteLeft`, link reappears. Good — doctor needs the link to nudge.
- **Refresh during live with patient already in.** Room reconnects; the existing rehydrate path eventually calls `setRemoteParticipant`, which triggers `onRemoteJoined`, which sets `hasRemoteParticipant=true`. There may be a 200–500ms window where the link is briefly visible. Acceptable; do not over-engineer.
- **Voice consults.** `<PatientJoinLink>` may not render today for voice. If so, no-op for voice — but still wire the callbacks for symmetry.

---

## Acceptance

```
- [ ] VideoRoom.tsx accepts onRemoteJoined / onRemoteLeft callback props
      and fires them in a useEffect tracking remoteParticipant.
- [ ] VoiceConsultRoom.tsx same.
- [ ] ConsultationLauncher.tsx holds `hasRemoteParticipant` state, wires the
      callbacks, gates <PatientJoinLink> on !hasRemoteParticipant.
- [ ] On a fresh session start, hasRemoteParticipant resets to false.
- [ ] Smoke (video):
      * Open a video consult on doctor side. Patient join link is visible.
      * Open the patient consult on a second device/window. Once Twilio
        handshake completes, the link disappears on the doctor side.
      * Patient closes the tab. After the participant-disconnect event,
        the link reappears for the doctor.
- [ ] Smoke (voice): same flow, if PatientJoinLink renders for voice in
      this codebase. Otherwise just confirm callbacks fire (console log).
- [ ] cd frontend && npx tsc --noEmit clean.
- [ ] No new lint warnings.
```

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6**.

Three files, light state plumbing, careful with the `useEffect` dep array — Sonnet's sweet spot.

**Pre-load in the chat:**

1. This task file.
2. The full `frontend/components/consultation/ConsultationLauncher.tsx` (post-fix-2, post-fix-4).
3. The relevant section of `frontend/components/consultation/VideoRoom.tsx` (around `remoteParticipant`, ~line 1044).
4. `frontend/components/consultation/VoiceConsultRoom.tsx` (whatever the equivalent presence state is).

**Watch for:**

- Don't fire the callbacks **on mount** if `remoteParticipant` is `null` from the start — the `useEffect` will fire `onRemoteLeft` once unnecessarily. That's harmless (state is already `false`) but you can guard with a `prevRef.current === remoteParticipant` check if you want to be precise. Optional.
- If the launcher already has a `useEffect` for live-session lifecycle, fold the `setHasRemoteParticipant(false)` reset into the same effect rather than adding a new one.

---

## References

- Parent: [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md)
- Order: [EXECUTION-ORDER-cockpit-hardening.md](./EXECUTION-ORDER-cockpit-hardening.md)
- Surfaces: `ConsultationLauncher.tsx` (PatientJoinLink mount), `VideoRoom.tsx:1044` (remoteParticipant state)

---

**Status:** `Drafted` — ready to execute.
