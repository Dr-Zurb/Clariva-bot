"use client";

/**
 * Bridges cockpit layout focus into `<VideoRoom>` without importing the v3
 * layout hook into the consultation package cycle. Call chrome uses Full
 * screen; fill-tab enter remains for hotkeys / exit when already focused.
 * In-call chat uses prepare/release to borrow a Wide (→ Full) Focus session
 * and raises Consult's splitter min width so neighbours cannot crush content.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export interface CallStageChromeValue {
  /** True while Consult (`body`) is in a Full focus session. */
  fillTabActive: boolean;
  enterFillTab: () => void;
  exitFillTab: () => void;
  /**
   * Before opening in-call chat: ensure Consult is Wide (unless already
   * Full/Wide). May take temporary Focus ownership for restore on close.
   */
  prepareConsultForChat: () => void;
  /** After closing in-call chat: restore prior layout if we owned Focus. */
  releaseConsultAfterChat: () => void;
  /**
   * Escalate Consult to Full when Wide still leaves video+chat cramped.
   * Takes Focus ownership so closing chat can restore.
   */
  escalateConsultForChat: () => void;
  /**
   * Report whether in-call chat is open so the shell can raise Consult's
   * `minSizePx` floor for the splitter.
   */
  setConsultChatOpen: (open: boolean) => void;
}

const CallStageChromeContext = createContext<CallStageChromeValue | null>(null);

export function CallStageChromeProvider({
  children,
  fillTabActive,
  onEnterFillTab,
  onExitFillTab,
  onPrepareConsultForChat,
  onReleaseConsultAfterChat,
  onEscalateConsultForChat,
  onConsultChatOpenChange,
}: {
  children: ReactNode;
  fillTabActive: boolean;
  onEnterFillTab: () => void;
  onExitFillTab: () => void;
  onPrepareConsultForChat: () => void;
  onReleaseConsultAfterChat: () => void;
  onEscalateConsultForChat: () => void;
  onConsultChatOpenChange: (open: boolean) => void;
}): JSX.Element {
  const enterFillTab = useCallback(() => {
    onEnterFillTab();
  }, [onEnterFillTab]);
  const exitFillTab = useCallback(() => {
    onExitFillTab();
  }, [onExitFillTab]);
  const prepareConsultForChat = useCallback(() => {
    onPrepareConsultForChat();
  }, [onPrepareConsultForChat]);
  const releaseConsultAfterChat = useCallback(() => {
    onReleaseConsultAfterChat();
  }, [onReleaseConsultAfterChat]);
  const escalateConsultForChat = useCallback(() => {
    onEscalateConsultForChat();
  }, [onEscalateConsultForChat]);
  const setConsultChatOpen = useCallback(
    (open: boolean) => {
      onConsultChatOpenChange(open);
    },
    [onConsultChatOpenChange],
  );
  const value = useMemo(
    () => ({
      fillTabActive,
      enterFillTab,
      exitFillTab,
      prepareConsultForChat,
      releaseConsultAfterChat,
      escalateConsultForChat,
      setConsultChatOpen,
    }),
    [
      fillTabActive,
      enterFillTab,
      exitFillTab,
      prepareConsultForChat,
      releaseConsultAfterChat,
      escalateConsultForChat,
      setConsultChatOpen,
    ],
  );
  return (
    <CallStageChromeContext.Provider value={value}>
      {children}
    </CallStageChromeContext.Provider>
  );
}

export function useCallStageChrome(): CallStageChromeValue {
  const ctx = useContext(CallStageChromeContext);
  if (!ctx) {
    return {
      fillTabActive: false,
      enterFillTab: () => {},
      exitFillTab: () => {},
      prepareConsultForChat: () => {},
      releaseConsultAfterChat: () => {},
      escalateConsultForChat: () => {},
      setConsultChatOpen: () => {},
    };
  }
  return ctx;
}
