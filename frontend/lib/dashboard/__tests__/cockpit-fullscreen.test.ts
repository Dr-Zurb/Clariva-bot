import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_SHELL_ID,
  isCockpitDocumentFullscreen,
  requestCockpitDocumentFullscreen,
  toggleCockpitDocumentFullscreen,
} from "@/lib/dashboard/cockpit-fullscreen";

describe("cockpit document fullscreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when the shell is not the fullscreen element", () => {
    const el = document.createElement("div");
    el.id = DASHBOARD_SHELL_ID;
    document.body.appendChild(el);
    expect(isCockpitDocumentFullscreen()).toBe(false);
    el.remove();
  });

  it("does not request when another element already owns fullscreen", () => {
    const other = document.createElement("div");
    const shell = document.createElement("div");
    shell.id = DASHBOARD_SHELL_ID;
    const request = vi.fn();
    shell.requestFullscreen = request;
    document.body.append(other, shell);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => other,
    });
    requestCockpitDocumentFullscreen();
    expect(request).not.toHaveBeenCalled();
    toggleCockpitDocumentFullscreen();
    expect(request).not.toHaveBeenCalled();
    shell.remove();
    other.remove();
    delete (document as { fullscreenElement?: Element }).fullscreenElement;
  });
});
