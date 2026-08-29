import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lightweight guard — full `<VideoRoom>` mount needs Twilio + auth.
 */
describe("patient mobile chrome (source contract)", () => {
  const source = readFileSync(join(__dirname, "../VideoRoom.tsx"), "utf8");
  const chatRoom = readFileSync(
    join(__dirname, "../TextConsultRoom.tsx"),
    "utf8"
  );
  const joinPage = readFileSync(
    join(__dirname, "../../../app/consult/join/page.tsx"),
    "utf8"
  );

  it("forces Speaker and hides the layout switcher on patient phones", () => {
    expect(source).toContain("isPatientMobileChrome");
    expect(source).toContain("effectiveCallLayout");
    expect(source).toContain("isAudioOnly || hold.onHold || isPatientMobile");
    expect(source).toContain("cockpitLayoutVertical ? null");
  });

  it("keeps per-tile inspect on tap and Flip in the dock", () => {
    expect(
      source.split("revealOnTap: isPatientChrome || isCockpit").length - 1
    ).toBe(2);
    expect(source.split("cycleRotate: isPatientMobile").length - 1).toBe(2);
    expect(source).toContain("patientInspectChrome");
    expect(source).toContain("inspectPlacement: remoteInspect?.placement");
    expect(source).toContain("inspectPlacement: selfInspect?.placement");
    expect(source).toContain('data-testid="self-camera-flip"');
    expect(source).toContain('data-testid="patient-sheet-flip"');
    expect(source).toContain("PATIENT_DOCK_BTN");
  });

  it("surfaces a camera-switch failure instead of failing silently", () => {
    expect(source).toContain("onSwitchUnavailable");
    expect(source).toContain('data-testid="camera-switch-notice"');
  });

  describe("stage chips", () => {
    it("offers layout and document fullscreen below the caller card", () => {
      expect(source).toContain('data-testid="patient-stage-chips"');
      expect(source).toContain('data-testid="patient-stage-layout"');
      expect(source).toContain('data-testid="patient-stage-fullscreen"');
      expect(source).not.toContain('data-testid="patient-stage-fit"');
      expect(source).not.toContain('data-testid="patient-stage-swap"');
      expect(source).toContain("toggleDocumentFullscreen");
      // Right edge, below the caller card — not the Gallery tile seam.
      expect(source).toContain(
        '"absolute right-3 z-30 flex flex-col gap-2 transition-opacity duration-200 "'
      );
      expect(source).toContain('(patientChatOpen ? "top-14 " : "top-20 ")');
    });

    it("drives fit off the resolved value, not the raw override", () => {
      expect(source).toContain(
        "const effectiveRemoteFit: VideoObjectFit = remoteTileFit ?? tileFitDefault;"
      );
      expect(source).toContain("objectFit={effectiveRemoteFit}");
      expect(source).toContain("objectFit={effectiveSelfFit}");
      // `null` override keeps the default viewport-dependent + SSR-safe.
      expect(source).toContain("useState<VideoObjectFit | null>(null)");
    });

    it("gives the phone a portrait PiP; Flip lives in the dock", () => {
      expect(source).toContain('? ("portrait" as const)');
      expect(source).toContain(': ("landscape" as const)');
      expect(source).toContain('data-testid="self-camera-flip"');
      expect(source).toContain("<FlipCameraGlyph />");
    });

    it("taps the PiP to swap and drags it to a corner (WhatsApp)", () => {
      expect(source).toContain("handleSpeakerSwap");
      expect(source).toContain("handlePipCorner");
      expect(source).toContain("onMove: handlePipCorner");
      expect(source).toContain("onTap: handleSpeakerSwap");
      expect(source).toContain("featuredTile");
      expect(source).toContain(
        "data-featured={speakerSwapActive ? featuredTile"
      );
    });
  });

  it("collapses the patient dock to Mute / Camera / Flip / Chat / More / Leave", () => {
    expect(source).toContain('"patient-desktop"');
    expect(source).toContain("isDesktopChrome");
    expect(source).toContain("COCKPIT_CTRL_DOCK");
    expect(source).toContain("data-chrome={");
    expect(source).toContain('data-testid="patient-more-controls"');
    expect(source).toContain('data-testid="patient-chat-toggle"');
    expect(source).toContain('data-testid="chat-unread-badge"');
    expect(source).toContain("shouldCountChatUnread");
    expect(source).toContain("onUnreadCountChange");
    expect(source).toContain("chatVisible");
    expect(chatRoom).toContain("firstUnreadInboundId");
    expect(chatRoom).toContain("runOpenChatScroll");
    expect(chatRoom).toContain("insertUnreadDivider");
    expect(chatRoom).toContain("unreadDivider");
    expect(chatRoom).toContain("chatVisible = true");
    expect(chatRoom).toContain("peerJustJoined");
    expect(chatRoom).toContain("isAtOrBeforeCursor");
    expect(chatRoom).toContain("establishedReadAtRef");
    expect(chatRoom).toContain("viewed-bottom-ping");
    expect(chatRoom).toContain("applyPeerReadCursor");
    expect(chatRoom).toContain("stampInitialReadCursor");
    expect(source).toContain("handlePatientChatToggle");
    expect(source).toContain("isIconDock");
    expect(source).toContain("isPatientDesktop");
    expect(source).toContain("patientDesktopChatOpen");
    expect(source).toContain("isAudioOnly || hold.onHold || isPatientMobile");
  });

  describe("overlay dock", () => {
    it("floats an icon pill over the stage with safe-area inset", () => {
      expect(source).toContain("const PATIENT_DOCK =");
      expect(source).toContain("env(safe-area-inset-bottom)");
      expect(source).toContain("patientDockToggleClass");
      expect(source).toContain("PATIENT_DOCK_LEAVE");
    });

    it("auto-hides chrome and keeps it up while More is open, on hold, or unread", () => {
      expect(source).toContain("useAutoHideChrome");
      expect(source).toContain("patientMoreOpen");
      expect(source).toContain("unreadCount > 0");
      expect(source).toContain(
        "onPointerDown={isPatientMobile ? patientChrome.reveal"
      );
      expect(source).toContain(
        "isPatientMobile ? setPatientMoreOpen : undefined"
      );
    });

    it("fullscreens the document on the patient phone so chat stays painted", () => {
      expect(source).toContain("toggleDocumentFullscreen");
      expect(source).toContain("handleExpandFullscreen");
      expect(source).toContain('data-testid="patient-stage-fullscreen"');
      expect(joinPage).toContain("requestPatientPhoneFullscreen");
    });

    it("lifts the self PiP above the overlay dock", () => {
      expect(source).toContain("clearDock: isPatientMobile");
      expect(source).toContain("compact: patientChatOpen");
    });
  });

  describe("chat sheet", () => {
    it("hides the Video/Chat tabs on the patient phone", () => {
      expect(source).toContain('(isIconDock ? " hidden" : "")');
      expect(source).toContain(
        '(isPatientMobile || activeTab === "video" ? "" : "hidden ")'
      );
    });

    it("mounts chat in the sheet, not a second pane", () => {
      expect(source).toContain("<PatientChatSheet");
      expect(source).toContain("onSnapChange={setPatientChatSnap}");
      expect(source).toContain("onVisibleFraction={setChatDragFraction}");
      expect(source).toContain('data-testid="patient-sheet-leave"');
      expect(source).toContain('data-testid="patient-sheet-camera"');
      expect(source).toContain('data-testid="patient-split-controls"');
    });

    it("reflows the video pane when chat is open instead of overlaying it", () => {
      expect(source).toContain("patientStageHeightCss");
      expect(source).toContain("patientSplitAxis");
      expect(source).toContain("patientChatCoverFraction");
      expect(source).toContain(
        'data-testid={isPatientMobile ? "patient-video-stage"'
      );
      expect(source).toContain("compact={patientChatOpen}");
      expect(source).toContain("effectiveSpeakerPip");
      expect(source).toContain("hidePanelHeader={isPatientMobile}");
    });

    it("badges the dock on inbound and offers quick replies", () => {
      expect(source).toContain("shouldCountChatUnread");
      expect(source).not.toContain(
        "setPatientChatSnap(PATIENT_CHAT_SNAP_HALF)"
      );
      expect(source).toContain("PATIENT_CHAT_QUICK_REPLIES");
      expect(source).toContain(
        "quickReplies={isPatientMobile ? PATIENT_CHAT_QUICK_REPLIES"
      );
    });

    it("hides the caller card with chrome and scrims the dock", () => {
      expect(source).toContain('data-testid="patient-dock-scrim"');
      expect(source).toContain("pointer-events-none !opacity-0");
    });
  });

  /**
   * Speaker anchors BOTH tiles `absolute inset-0`, so it has zero
   * intrinsic height. Every ancestor from the page down has to carry a
   * height or the stage collapses to a sliver and the control strip
   * overlaps the video.
   */
  describe("patient height chain", () => {
    it("gives the join page a bounded dvh flex column", () => {
      expect(joinPage).toContain(
        'className="flex h-[100dvh] flex-col bg-background p-0 md:bg-muted md:p-3"'
      );
      expect(joinPage).toContain(
        'className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-sm"'
      );
    });

    it("drops the live-room page title so the stage matches the doctor card", () => {
      expect(joinPage).not.toContain(
        'className="mb-2 hidden shrink-0 text-lg font-semibold text-gray-900 md:block"'
      );
    });

    it("fills the host box for cockpit AND patient, not legacy doctor", () => {
      expect(source).toContain(
        'const fillsHostHeight = isCockpit || role === "patient";'
      );
      // Both room roots — companion and no-companion — fill the host.
      const fillRoot = '"flex h-full min-h-0 w-full flex-col"';
      expect(source.split(fillRoot).length - 1).toBe(2);
      // Neither root is gated on cockpit alone any more.
      expect(source).not.toContain(
        'isCockpit\n            ? "flex h-full min-h-0 w-full flex-col"'
      );
    });

    it("gives the Speaker stage wrapper a flex-1 height to anchor against", () => {
      expect(source).toContain(
        'fillsHostHeight\n            ? "relative min-h-0 overflow-hidden " +'
      );
      // The bare `"relative"` fallback stays only for legacy doctor.
      expect(source).toContain(
        '"relative min-h-[50vh] flex-1 overflow-hidden md:min-h-[60vh]"'
      );
    });

    it("keeps min-h-0 down the pane chain so the stage can shrink", () => {
      expect(source).toContain(
        '? "flex h-full min-h-0 flex-1 flex-col space-y-4"'
      );
      expect(source).toContain(
        '? "flex min-h-0 flex-1 flex-col md:flex-row md:gap-4"'
      );
      expect(source).toContain('? "flex min-h-0 min-w-0 flex-1 "');
      expect(source).toContain('(fillsHostHeight ? "min-h-0 flex-1 " : "")');
    });
  });
});
