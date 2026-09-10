import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lightweight guard — full `<VideoRoom>` mount needs Twilio + auth.
 */
describe("cockpit companion layout (source contract)", () => {
  const source = readFileSync(
    join(__dirname, "../VideoRoom.tsx"),
    "utf8",
  );

  it("keeps a stable video tree when companion exists (no chat-closed early return)", () => {
    expect(source).not.toContain(
      "if (!companion || (isCockpit && !showInCallChat))",
    );
    expect(source).toContain("if (!companion) {");
    expect(source).toContain("const mountChatPane = true;");
    expect(source).not.toContain("cockpitChatMounted");
    expect(source).not.toContain("prepareConsultForChat");
    expect(source).not.toContain("escalateConsultForChat");
    expect(source).not.toContain("shouldEscalateConsultToFull");
  });

  it("uses side-by-side chat (never overlays / covers video)", () => {
    expect(source).toContain(
      '"flex min-h-0 flex-1 flex-row overflow-hidden"',
    );
    expect(source).not.toContain("absolute inset-y-0 right-0 z-20");
    expect(source).toContain("pointer-events-none border-transparent opacity-0");
    expect(source).toContain("min-w-[240px]");
    expect(source).toContain("min-w-[280px]");
    expect(source).toContain("onClosePanel=");
    expect(source).toContain("width: showChatPane ? 300 : 0");
  });

  it("does not reattach Twilio tracks on chat toggle (avoids black flash)", () => {
    expect(source).toContain(
      "[status, effectiveLayout, remoteParticipant]",
    );
    expect(source).not.toContain(
      "[status, effectiveLayout, remoteParticipant, showInCallChat]",
    );
  });

  it("keeps front/back camera switch on the cockpit dock", () => {
    expect(source).toContain('tone={isDesktopChrome ? "cockpit" : "default"}');
    expect(source).toContain("canFlip={cameraSwitch.canFlip}");
    expect(source).toContain('data-testid="self-camera-flip"');
  });
});
