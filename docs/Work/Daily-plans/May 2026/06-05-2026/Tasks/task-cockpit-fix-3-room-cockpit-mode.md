# task-cockpit-fix-3 — `mode="cockpit"` on `VideoRoom` / `VoiceConsultRoom` (Opus-locked design)

**Lane:** H3 (Room compact) — runs alone in its lane.  
**Status:** Drafted.  
**Effort:** M (~3 hours).  
**Owner:** TBD.  
**Hard deps:** none — but if H1 ships first, this task is more pleasant to verify visually.

---

## Why

The screenshots from 2026-05-06 show the in-cockpit `<VideoRoom>` rendering 15+ controls in the toolbar (Pause recording, Start video recording, Mute, Camera off, Hold, Mirror off, quality slider, Gallery / Speaker / Sidebar, Background: Off / Blur / Strong blur, PIP / Share, Snapshot, Annotate, Other ▾, Leave call) **plus** a companion text-chat side panel **plus** a "Patient join link" section **plus** "Change modality". That density is fine on the standalone consult page. It is wrong inside a cockpit pane that is supposed to sit *between* a chart rail and an Rx workspace.

We're not refactoring the room. We're adding a `mode` prop and gating ~6–8 conditional renders.

Lock from the parent plan (K-H3, K-H4, K-H5):

> `mode="cockpit"` is a render-time prop, not a refactor. Single prop on `VideoRoom` and `VoiceConsultRoom`; default is `"default"` (current behaviour). In `mode="cockpit"`, only the **essential** controls are visible; the rest collapse into a `More ▾` dropdown. Companion chat panel is suppressed by default. Recording is one stateful pill, not two buttons.

---

## What you'll change

**Two files** (optionally a small shared util):

1. `frontend/components/consultation/VideoRoom.tsx` — add `mode?: "default" | "cockpit"` prop and gate the listed renders.
2. `frontend/components/consultation/VoiceConsultRoom.tsx` — same prop, narrower control set.
3. *(Optional, if it cleans up the diff)* `frontend/components/consultation/cockpit/RoomMoreMenu.tsx` — small new file holding the `More ▾` dropdown menu items (so the `VideoRoom` patch stays surgical). Use `@/components/ui/dropdown-menu` primitives that are already in the project.

Then update **two call sites** to pass `mode="cockpit"`:

4. `frontend/components/consultation/ConsultationLauncher.tsx` — wherever it mounts `<VideoRoom>` / `<VoiceConsultRoom>` for the live panel, pass `mode="cockpit"` (the launcher only mounts these inside the cockpit context — the patient-side `/consult/join` mounts `<VideoRoom>` directly without going through the launcher, so it stays default).
5. *(If fix-2 has not landed when you start this)* don't touch the launcher; do steps 1–3 first and pass the mode prop in a follow-up.

The patient-side mount (`frontend/app/consult/join/...`) stays on the default mode and is **not edited**.

---

## OPUS-LOCKED DESIGN — `mode="cockpit"` control map

The impl chat treats this map as canonical. Do **not** add controls. Do **not** remove controls without a fresh design pass.

### A. Always visible (4 surfaces)

| Surface | Why it stays | Notes |
|---|---|---|
| **Mute toggle** | Most-clicked control during a consult. | Existing button; render unchanged. |
| **Camera toggle** | Same — frequent toggle. | Existing button; render unchanged. |
| **Leave call** (red) | The single source of truth for ending the call. K-H2 says the cockpit header CTA is hidden during `live`, so this button is the only end-call surface. | Render unchanged. **Required.** |
| **Network bars indicator** | Passive read-out, no clicks. Doctor needs it to know if the patient's connection is degrading. | Existing component; render unchanged. |

### B. Compact-but-visible (3 surfaces)

| Surface | Why it stays | Notes |
|---|---|---|
| **Hold call** | Medical context — common for letting a patient grab a document, etc. Different from Leave. | Render as icon-only button with tooltip in cockpit mode; full label in default mode. |
| **Layout switcher** (Gallery / Speaker / Sidebar) | Doctor may want to make remote video bigger when patient is showing a rash. | Render as a single icon button that cycles through layouts in cockpit mode (or a compact 3-segment toggle if it's already that). Full button group in default mode. |
| **Modality switch** | Useful to drop video → voice if the patient's bandwidth is poor. | Existing component; render unchanged. |

### C. Collapsed into `More ▾` (everything else)

The following surfaces all live behind a single `More ▾` dropdown menu in cockpit mode. In default mode, they remain on the toolbar exactly as today.

| Surface | DropdownMenuItem label |
|---|---|
| Recording (combined Pause / Start / Stop) — see § D below | "Recording: ON ●" / "Recording: OFF ○" (stateful) |
| Mirror toggle | "Mirror video" with check ✓ |
| Background: Off / Blur / Strong blur | "Background ▸" with submenu |
| Quality slider / picker | "Connection quality ▸" with submenu |
| PIP | "Picture-in-picture" |
| Share screen | "Share screen" |
| Snapshot | "Save snapshot" |
| Annotate | "Annotate frame" |
| Companion chat toggle (see K-H4) | "Show in-call chat" |

The `More ▾` button is a single icon-button on the right of the toolbar in cockpit mode. Use the existing `@/components/ui/dropdown-menu` primitives.

### D. Recording: one pill (K-H5)

In cockpit mode, replace the pair of `Pause recording` / `Start video recording` buttons with **one** recording pill that reflects the current recording state and toggles on click:

- If currently recording: pill shows red dot + "REC" + small pause-icon, click pauses.
- If currently paused: pill shows orange + "Paused", click resumes.
- If not recording at all: pill is hidden from the toolbar; the `More ▾` item "Start recording" is the entry point.

The granular pause / stop / start controls all live in `More ▾` as a submenu.

### E. Removed in cockpit mode (K-H4)

- **Companion text-chat side panel** (the `companion` prop today) — completely hidden by default. The doctor uses the Rx pane for all writing. The "Show in-call chat" item in `More ▾` re-enables it as a small floating overlay (existing rendering, just different mount point if you can manage it without large refactor; if not, fall back to the existing companion render but mounted/unmounted via state).

### F. Patient join link

This is **not** a `VideoRoom` concern — `<PatientJoinLink>` is rendered by `ConsultationLauncher`, not by the room. fix-3 does **not** touch it. fix-5 owns gating it on remote-participant presence.

---

## Implementation patterns

### Add the prop

```tsx
// VideoRoom.tsx — top of props interface
export interface VideoRoomProps {
  // …existing fields…
  mode?: "default" | "cockpit"; // default: "default"
}
```

### Resolve once near the top of the component

```tsx
const isCockpit = mode === "cockpit";
```

### Gate, don't fork

Where today you render a button row, gate per-surface:

```tsx
// ✅ DO
{!isCockpit && <PauseRecordingButton ... />}
{!isCockpit && <StartRecordingButton ... />}
{isCockpit && <RecordingPill ... />}

// ❌ DON'T fork the entire toolbar into two huge JSX trees.
```

The "fork" anti-pattern would double the maintenance surface.

### Companion chat suppression

```tsx
{(!isCockpit || showInCallChat) && companion && (
  <CompanionChatPanel ... />
)}
```

Where `showInCallChat` is a new piece of local state defaulting to `false`, toggled by the `More ▾` item.

### `More ▾` menu — pseudocode

```tsx
{isCockpit && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label="More room controls">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      {/* Recording submenu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Recording</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={…}>Start</DropdownMenuItem>
          <DropdownMenuItem onClick={…}>Pause</DropdownMenuItem>
          <DropdownMenuItem onClick={…}>Resume</DropdownMenuItem>
          <DropdownMenuItem onClick={…}>Stop</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuItem onClick={() => setMirrored((v) => !v)}>
        {mirrored ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block w-4" />}
        Mirror video
      </DropdownMenuItem>

      {/* …Background submenu, Quality submenu, PIP, Share, Snapshot, Annotate… */}

      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setShowInCallChat((v) => !v)}>
        {showInCallChat ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block w-4" />}
        Show in-call chat
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

### `VoiceConsultRoom`

`VoiceConsultRoom` is a smaller surface. Apply the same pattern, but the always-visible set is just **Mute, Hold, Leave, Network bars**. Modality switch stays. `More ▾` holds Recording, Quality, "Show in-call chat".

### Default mode is byte-for-byte unchanged

Every gate must be `{!isCockpit && existing-render}` so that when `mode === "default"` (or `mode` is not passed), the room renders exactly as today. The smoke test is: visit `/consult/join/<token>` as a patient — the page must look identical to before.

### Where NOT to compact

- **The video tile itself.** Aspect ratio, layout, mirror, networks bars on the tile — unchanged.
- **The error / reconnecting overlays.** The `<VideoRoom>` reconnect / token-expired overlays are non-negotiable; render unchanged in both modes.
- **Permission-prompt UI.** Keep it.

---

## Acceptance

```
- [ ] VideoRoom.tsx accepts a new prop `mode?: "default" | "cockpit"` (default
      "default"). VoiceConsultRoom.tsx same.

- [ ] When `mode === "default"` (no prop), both rooms render byte-for-byte
      as before. Smoke /consult/join/<token> as a patient and confirm visually.

- [ ] When `mode === "cockpit"`:
      - Always-visible toolbar = Mute, Camera (video only), Hold, Layout switcher
        (video only), Modality switch, network bars, Leave (red), More ▾.
      - Recording is ONE stateful pill (or a More ▾ entry when not recording).
      - Companion chat panel is hidden by default.
      - All B-tier and C-tier surfaces are accessible somewhere — none deleted.

- [ ] ConsultationLauncher passes mode="cockpit" to <VideoRoom> / <VoiceConsultRoom>
      in the live-panel JSX.

- [ ] Patient-side /consult/join mount keeps default behaviour.

- [ ] No prop-drilling depth >2 from launcher → room.

- [ ] No hook moved inside a conditional — verify by reading the diff.

- [ ] All existing room-side e2e tests still pass (Twilio mock).

- [ ] Smoke: start a video consult from the dashboard. Cockpit pane shows the
      compact toolbar. More ▾ menu opens, all C-tier items work.

- [ ] Smoke: switch to voice modality mid-call. VoiceConsultRoom shows compact
      voice toolbar.

- [ ] No new lint warnings; cd frontend && npx tsc --noEmit clean.
```

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6** (or **Codex** as alternative). This is the longest task in the batch — but the design is fully locked above, so the impl is mechanical gating + one new dropdown.

**Don't use Opus.** The design pass already happened (this file). Using Opus to *implement* gated render forks is the textbook over-spend in [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

**Don't use Composer.** `VideoRoom.tsx` is 5676 lines; Composer cannot reliably hold the file in mind for the gated edits.

**Pre-load in the chat:**

1. This task file.
2. The full `frontend/components/consultation/VideoRoom.tsx`.
3. The full `frontend/components/consultation/VoiceConsultRoom.tsx`.
4. K-H3, K-H4, K-H5 from `plan-cockpit-hardening-batch.md`.
5. The current shadcn dropdown-menu file (`frontend/components/ui/dropdown-menu.tsx`) — for the `More ▾` patterns.

**Suggested chat workflow (3–4 turns):**

1. *Turn 1:* "Read the task file + both room files. Show me the per-surface gate plan as a table — which JSX blocks change, which stay the same. Don't write code yet."
2. *Turn 2:* "Apply the prop + gate the always-visible 4 + the compact-but-visible 3. Don't touch the More ▾ menu yet."
3. *Turn 3:* "Add the More ▾ dropdown with all C-tier items. Use the existing shadcn DropdownMenu primitives."
4. *Turn 4:* "Update ConsultationLauncher to pass mode='cockpit'. Run tsc + lint and report."

**Stop signal — re-design needed if:**

- Any A-tier or B-tier surface is missing in `mode="cockpit"`.
- The `mode="default"` render diverges visually from `main`.
- A hook had to move inside a conditional.
- The diff exceeds **+800 lines** in `VideoRoom.tsx` (signal that the file is being forked rather than gated).

In any of these, abort the chat and re-paste the locked design as the first message of a fresh chat.

---

## Hand-off / next steps

- After this ships, fix-2 / fix-4 still need to land in lane H2 to fully clean up the in-cockpit launcher render.
- A future task (not in this batch) can move the recording state up into a context so the cockpit header can show a recording indicator too. Capture the idea but do not implement here.

---

## References

- Parent: [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md) (locks K-H3, K-H4, K-H5)
- Order: [EXECUTION-ORDER-cockpit-hardening.md](./EXECUTION-ORDER-cockpit-hardening.md)
- Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- shadcn primitives: `frontend/components/ui/dropdown-menu.tsx`

---

**Status:** `Drafted` — ready to execute.
