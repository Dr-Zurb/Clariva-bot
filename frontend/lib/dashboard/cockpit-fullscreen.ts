/**
 * Cockpit document-fullscreen. Targets `#dashboard-shell` so the
 * appointment workspace fills the monitor. VideoRoom owns a different
 * element (the stage) — do not steal that element.
 */

export const DASHBOARD_SHELL_ID = "dashboard-shell";

export function isCockpitDocumentFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(DASHBOARD_SHELL_ID);
  return Boolean(el && document.fullscreenElement === el);
}

export function requestCockpitDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;
  const el = document.getElementById(DASHBOARD_SHELL_ID) as
    | (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void })
    | null;
  if (!el) return;
  const req =
    el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req) return;
  try {
    void Promise.resolve(req({ navigationUI: "hide" })).catch(() => {
      void Promise.resolve(req()).catch(() => undefined);
    });
  } catch {
    try {
      void Promise.resolve(req()).catch(() => undefined);
    } catch {
      // Safari can throw when the user-gesture is gone.
    }
  }
}

export function exitCockpitDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  if (!isCockpitDocumentFullscreen()) return;
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const exit =
    doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
  if (!exit) return;
  try {
    void Promise.resolve(exit()).catch(() => undefined);
  } catch {
    // ignore
  }
}

export function toggleCockpitDocumentFullscreen(): void {
  if (isCockpitDocumentFullscreen()) {
    exitCockpitDocumentFullscreen();
    return;
  }
  requestCockpitDocumentFullscreen();
}
