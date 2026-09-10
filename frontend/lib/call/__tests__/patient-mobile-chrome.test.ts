import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PATIENT_CHAT_QUICK_REPLIES,
  PATIENT_CHAT_SNAP_FULL,
  PATIENT_CHAT_SNAP_HALF,
  PATIENT_CHAT_SNAP_PEEK,
  defaultTileObjectFit,
  effectiveCallLayout,
  isPatientChatExpanded,
  isPatientDesktopChrome,
  isPatientChrome,
  isPatientMobileChrome,
  shouldCountChatUnread,
  advanceChatReadWatermark,
  countUnreadInbound,
  firstUnreadInboundId,
  isAtOrBeforeCursor,
  peerJustJoined,
  runOpenChatScroll,
  applyPatientKeyboardSheetPin,
  isSoftKeyboardOpen,
  patientKeyboardViewportBox,
  nextPatientStageLayout,
  patientChatCoverFraction,
  patientDockBottom,
  patientSheetColumnHeightCss,
  patientInspectChrome,
  patientSplitAxis,
  patientStageHeightCss,
  requestDocumentFullscreen,
  requestPatientPhoneFullscreen,
  togglePatientChatSnap,
} from "../patient-mobile-chrome";

describe("isPatientChrome", () => {
  it("is true for any patient surface", () => {
    expect(isPatientChrome({ role: "patient" })).toBe(true);
    expect(isPatientChrome({ role: "doctor" })).toBe(false);
  });
});

describe("isPatientDesktopChrome", () => {
  it("is true only for a patient on a wide viewport", () => {
    expect(isPatientDesktopChrome({ role: "patient", isDesktop: true })).toBe(
      true
    );
    expect(isPatientDesktopChrome({ role: "patient", isDesktop: false })).toBe(
      false
    );
  });
});

describe("shouldCountChatUnread", () => {
  const base = {
    patientChatExpanded: false,
    patientDesktopChatOpen: false,
    cockpitChatOpen: false,
    activeTab: "video" as const,
  };

  it("skips when the patient laptop panel is open", () => {
    expect(
      shouldCountChatUnread({
        ...base,
        role: "patient",
        isDesktop: true,
        isCockpit: false,
        patientDesktopChatOpen: true,
      })
    ).toBe(false);
    expect(
      shouldCountChatUnread({
        ...base,
        role: "patient",
        isDesktop: true,
        isCockpit: false,
      })
    ).toBe(true);
  });

  it("skips when the doctor cockpit panel is open", () => {
    expect(
      shouldCountChatUnread({
        ...base,
        role: "doctor",
        isDesktop: true,
        isCockpit: true,
        cockpitChatOpen: true,
      })
    ).toBe(false);
    expect(
      shouldCountChatUnread({
        ...base,
        role: "doctor",
        isDesktop: true,
        isCockpit: true,
      })
    ).toBe(true);
  });

  it("skips when the patient phone sheet is already expanded", () => {
    expect(
      shouldCountChatUnread({
        ...base,
        role: "patient",
        isDesktop: false,
        isCockpit: false,
        patientChatExpanded: true,
      })
    ).toBe(false);
  });
});

describe("countUnreadInbound", () => {
  const readAt = "2026-08-16T12:00:00.000Z";
  const inbound = (id: string, createdAt: string) => ({
    id,
    kind: "text",
    senderId: "them",
    createdAt,
  });

  it("counts each inbound id once after the read cursor", () => {
    expect(
      countUnreadInbound(
        [
          inbound("m1", "2026-08-16T12:00:01.000Z"),
          inbound("m1", "2026-08-16T12:00:01.000Z"),
          inbound("m2", "2026-08-16T12:00:02.000Z"),
        ],
        { selfId: "me", readAt }
      )
    ).toBe(2);
  });

  it("skips own, system, pending, and already-read rows", () => {
    expect(
      countUnreadInbound(
        [
          inbound("old", "2026-08-16T11:59:59.000Z"),
          { ...inbound("mine", "2026-08-16T12:00:01.000Z"), senderId: "me" },
          { ...inbound("sys", "2026-08-16T12:00:01.000Z"), kind: "system" },
          { ...inbound("pend", "2026-08-16T12:00:01.000Z"), pending: true },
        ],
        { selfId: "me", readAt }
      )
    ).toBe(0);
  });
});

describe("firstUnreadInboundId", () => {
  const readAt = "2026-08-16T12:00:00.000Z";
  const inbound = (id: string, createdAt: string) => ({
    id,
    kind: "text",
    senderId: "them",
    createdAt,
  });

  it("returns the oldest inbound after the read cursor", () => {
    expect(
      firstUnreadInboundId(
        [
          inbound("old", "2026-08-16T11:59:59.000Z"),
          inbound("m1", "2026-08-16T12:00:01.000Z"),
          inbound("m2", "2026-08-16T12:00:02.000Z"),
        ],
        { selfId: "me", readAt }
      )
    ).toBe("m1");
  });

  it("is null when nothing is unread", () => {
    expect(
      firstUnreadInboundId([inbound("old", "2026-08-16T11:59:59.000Z")], {
        selfId: "me",
        readAt,
      })
    ).toBeNull();
  });
});

describe("isAtOrBeforeCursor", () => {
  it("treats Z and +00:00 as the same instant", () => {
    expect(
      isAtOrBeforeCursor(
        "2026-08-17T01:30:00.000Z",
        "2026-08-17T01:30:00+00:00"
      )
    ).toBe(true);
    expect(
      isAtOrBeforeCursor(
        "2026-08-17T01:30:00+00:00",
        "2026-08-17T01:30:00.000Z"
      )
    ).toBe(true);
  });

  it("rejects a later message", () => {
    expect(
      isAtOrBeforeCursor(
        "2026-08-17T01:30:01.000Z",
        "2026-08-17T01:30:00+00:00"
      )
    ).toBe(false);
  });
});

describe("peerJustJoined", () => {
  it("is true only on the empty → present edge", () => {
    expect(peerJustJoined(false, true)).toBe(true);
    expect(peerJustJoined(true, true)).toBe(false);
    expect(peerJustJoined(true, false)).toBe(false);
    expect(peerJustJoined(false, false)).toBe(false);
  });
});

describe("runOpenChatScroll", () => {
  it("runs immediately so the unread chip is not waiting on a timer", () => {
    const run = vi.fn();
    const cancel = runOpenChatScroll(run);
    expect(run).toHaveBeenCalledTimes(1);
    cancel();
  });
});

describe("advanceChatReadWatermark", () => {
  it("moves the cursor to the latest acked row", () => {
    expect(
      advanceChatReadWatermark(
        [{ createdAt: "2026-08-16T12:00:05.000Z" }],
        "2026-08-16T12:00:00.000Z"
      )
    ).toBe("2026-08-16T12:00:05.000Z");
  });

  it("never consults the local clock — no rows, no movement", () => {
    expect(advanceChatReadWatermark([], "2026-08-16T12:00:00.000Z")).toBe(
      "2026-08-16T12:00:00.000Z"
    );
  });

  it("skips pending rows — their timestamps are the local clock", () => {
    expect(
      advanceChatReadWatermark(
        [{ createdAt: "2026-08-16T12:00:09.000Z", pending: true }],
        "2026-08-16T12:00:00.000Z"
      )
    ).toBe("2026-08-16T12:00:00.000Z");
  });
});

describe("isPatientMobileChrome", () => {
  it("is true only for a patient on a narrow viewport", () => {
    expect(isPatientMobileChrome({ role: "patient", isDesktop: false })).toBe(
      true
    );
    expect(isPatientMobileChrome({ role: "patient", isDesktop: true })).toBe(
      false
    );
    expect(isPatientMobileChrome({ role: "doctor", isDesktop: false })).toBe(
      false
    );
  });
});

describe("effectiveCallLayout", () => {
  it("keeps Gallery on patient phones so the stage chip can toggle to it", () => {
    expect(
      effectiveCallLayout("gallery", {
        role: "patient",
        isDesktop: false,
        orient: "portrait",
      })
    ).toBe("gallery");
  });

  it("always degrades Sidebar to Speaker on patient phones, either orientation", () => {
    for (const orient of ["portrait", "landscape"] as const) {
      expect(
        effectiveCallLayout("sidebar", {
          role: "patient",
          isDesktop: false,
          orient,
        })
      ).toBe("speaker");
    }
  });

  it("still degrades Sidebar to Speaker on a portrait phone for doctors", () => {
    expect(
      effectiveCallLayout("sidebar", {
        role: "doctor",
        isDesktop: false,
        orient: "portrait",
      })
    ).toBe("speaker");
    expect(
      effectiveCallLayout("gallery", {
        role: "doctor",
        isDesktop: false,
        orient: "portrait",
      })
    ).toBe("gallery");
  });
});

describe("nextPatientStageLayout", () => {
  it("toggles between one big tile and stacked", () => {
    expect(nextPatientStageLayout("speaker")).toBe("gallery");
    expect(nextPatientStageLayout("gallery")).toBe("speaker");
  });

  it("recovers to Speaker from an unreachable stored Sidebar", () => {
    expect(nextPatientStageLayout("sidebar")).toBe("speaker");
  });
});

describe("defaultTileObjectFit", () => {
  it("crop-fills on patient phones to reclaim the letterbox bands", () => {
    expect(defaultTileObjectFit({ role: "patient", isDesktop: false })).toBe(
      "cover"
    );
  });

  it("letterboxes everywhere else so nothing clinical gets cropped away", () => {
    expect(defaultTileObjectFit({ role: "patient", isDesktop: true })).toBe(
      "contain"
    );
    expect(defaultTileObjectFit({ role: "doctor", isDesktop: false })).toBe(
      "contain"
    );
  });
});

describe("patient chat snaps", () => {
  it("treats only half and full as expanded (peek stays off-screen)", () => {
    expect(PATIENT_CHAT_SNAP_PEEK).toBe("0px");
    expect(isPatientChatExpanded(PATIENT_CHAT_SNAP_PEEK)).toBe(false);
    expect(isPatientChatExpanded(PATIENT_CHAT_SNAP_HALF)).toBe(true);
    expect(isPatientChatExpanded(PATIENT_CHAT_SNAP_FULL)).toBe(true);
    expect(isPatientChatExpanded(null)).toBe(false);
  });

  it("toggles the dock Chat button between peek and half", () => {
    expect(togglePatientChatSnap(PATIENT_CHAT_SNAP_PEEK)).toBe(
      PATIENT_CHAT_SNAP_HALF
    );
    expect(togglePatientChatSnap(null)).toBe(PATIENT_CHAT_SNAP_HALF);
    expect(togglePatientChatSnap(PATIENT_CHAT_SNAP_HALF)).toBe(
      PATIENT_CHAT_SNAP_PEEK
    );
    expect(togglePatientChatSnap(PATIENT_CHAT_SNAP_FULL)).toBe(
      PATIENT_CHAT_SNAP_PEEK
    );
  });

  it("hides the overlay dock whenever chat is open", () => {
    expect(patientDockBottom(PATIENT_CHAT_SNAP_PEEK)).toContain("0.5rem");
    expect(patientDockBottom(PATIENT_CHAT_SNAP_PEEK)).not.toContain("64px");
    expect(patientDockBottom(PATIENT_CHAT_SNAP_HALF)).toBe("");
    expect(patientDockBottom(PATIENT_CHAT_SNAP_FULL)).toBe("");
    expect(patientDockBottom(0.8)).toBe("");
  });

  it("treats any snap at or above half as expanded", () => {
    expect(PATIENT_CHAT_SNAP_HALF).toBe(0.5);
    expect(isPatientChatExpanded(0.5)).toBe(true);
    expect(isPatientChatExpanded(0.8)).toBe(true);
  });

  it("maps the snap to a leftover video height so the sheet cannot crop the face", () => {
    expect(patientChatCoverFraction(PATIENT_CHAT_SNAP_PEEK)).toBe(0);
    expect(patientChatCoverFraction(null)).toBe(0);
    expect(patientChatCoverFraction(PATIENT_CHAT_SNAP_HALF)).toBe(0.5);
    expect(patientChatCoverFraction(PATIENT_CHAT_SNAP_FULL)).toBe(1);
    expect(patientStageHeightCss(0)).toBe("");
    expect(patientStageHeightCss(0.5)).toBe("calc(50dvh)");
    expect(patientStageHeightCss(1)).toBe("calc(0dvh)");
    expect(patientSheetColumnHeightCss(0)).toBe("0px");
    expect(patientSheetColumnHeightCss(0.5)).toBe("50%");
    expect(patientSheetColumnHeightCss(1)).toBe("100%");
  });

  it("splits stacked tiles along the stage long axis", () => {
    expect(patientSplitAxis(390, 844)).toBe("rows");
    expect(patientSplitAxis(390, 420)).toBe("cols");
    expect(patientSplitAxis(800, 390)).toBe("cols");
    expect(patientSplitAxis(0, 400)).toBe("rows");
  });
});

describe("patient chat polish helpers", () => {
  it("keeps quick replies short and non-clinical", () => {
    expect(PATIENT_CHAT_QUICK_REPLIES).toEqual([
      "Yes",
      "No",
      "OK",
      "One moment",
      "Thank you",
      "I can hear you",
      "I cannot hear you",
      "Please repeat",
      "Just a second",
    ]);
  });

  it("treats a large visualViewport shrink as a soft keyboard", () => {
    expect(isSoftKeyboardOpen(500, 800)).toBe(true);
    expect(isSoftKeyboardOpen(780, 800)).toBe(false);
    expect(isSoftKeyboardOpen(680, 800, 150)).toBe(false);
    expect(isSoftKeyboardOpen(780, 800, 120, 80)).toBe(true);
    expect(
      patientKeyboardViewportBox({ height: 500, offsetTop: 0 }, 800)
    ).toEqual({ top: 0, height: 500 });
    expect(
      patientKeyboardViewportBox({ height: 500, offsetTop: 220 }, 800)
    ).toEqual({ top: 220, height: 500 });
    expect(
      patientKeyboardViewportBox({ height: 780, offsetTop: 0 }, 800)
    ).toBeNull();
  });

  it("pins the sheet to the visual viewport with no transition", () => {
    const props: Record<string, string> = {};
    const style = {
      setProperty: (name: string, value: string) => {
        props[name] = value;
      },
      removeProperty: (name: string) => {
        delete props[name];
      },
    };
    applyPatientKeyboardSheetPin(style, { top: 80, height: 420 });
    expect(props.top).toBe("80px");
    expect(props.height).toBe("420px");
    expect(props.transform).toBe("none");
    expect(props.transition).toBe("none");
    applyPatientKeyboardSheetPin(style, null);
    expect(props.top).toBeUndefined();
  });
});

describe("patientInspectChrome", () => {
  it("parks Speaker inspect on the left, clear of the self PiP", () => {
    expect(
      patientInspectChrome({
        layout: "speaker",
        split: "rows",
        tile: "remote",
        selfOnStart: false,
      })
    ).toEqual({
      placement: "start",
      clearDock: false,
      hideZoom: false,
    });
  });

  it("pins stacked-row inspect to the splitter", () => {
    expect(
      patientInspectChrome({
        layout: "gallery",
        split: "rows",
        tile: "remote",
        selfOnStart: false,
      })
    ).toEqual({
      placement: "bottom-center",
      clearDock: false,
      hideZoom: false,
    });
    expect(
      patientInspectChrome({
        layout: "gallery",
        split: "rows",
        tile: "self",
        selfOnStart: false,
      })
    ).toEqual({
      placement: "top-center",
      clearDock: false,
      hideZoom: false,
    });
  });

  it("uses a vertical inner-seam strip when tiles sit side by side", () => {
    expect(
      patientInspectChrome({
        layout: "gallery",
        split: "cols",
        tile: "remote",
        selfOnStart: false,
      })
    ).toEqual({ placement: "end", clearDock: false, hideZoom: true });
    expect(
      patientInspectChrome({
        layout: "gallery",
        split: "cols",
        tile: "self",
        selfOnStart: false,
      })
    ).toEqual({ placement: "start", clearDock: false, hideZoom: true });
  });
});

describe("requestPatientPhoneFullscreen", () => {
  const originalFs = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenElement"
  );
  const originalReq = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "requestFullscreen"
  );

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalFs) {
      Object.defineProperty(document, "fullscreenElement", originalFs);
    } else {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
    }
    if (originalReq) {
      Object.defineProperty(
        document.documentElement,
        "requestFullscreen",
        originalReq
      );
    }
  });

  it("requests documentElement fullscreen on a phone-width viewport", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    requestPatientPhoneFullscreen();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("skips tablets and desktop", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    requestPatientPhoneFullscreen();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("does not re-request when already fullscreen", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    requestDocumentFullscreen();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
