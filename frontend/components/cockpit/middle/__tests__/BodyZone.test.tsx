import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConsultationLauncherHandle } from "@/components/consultation/ConsultationLauncher";
import { BodyZone } from "@/components/cockpit/middle/BodyZone";
import type { Appointment } from "@/types/appointment";

vi.mock("@/components/patient-profile/panes/ConsultationBodyPane", () => ({
  default: () => <div data-testid="consultation-body-pane" />,
}));

const trackBodyRefactored = vi.fn();
vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2RMiddleBodyRefactored: (...args: unknown[]) =>
      trackBodyRefactored(...args),
  };
});

const appointment = {
  id: "appt-body-zone-1",
  consultation_type: "voice",
} as Appointment;

const baseProps = {
  state: "ready" as const,
  appointment,
  token: "test-token",
  launcherRef: createRef<ConsultationLauncherHandle>(),
  hideHeader: true,
};

describe("BodyZone", () => {
  beforeEach(() => {
    trackBodyRefactored.mockClear();
  });

  it.each([
    ["voice", "Voice consultation controls", "min-h-[60px]", "overflow-hidden"],
    ["text", "Text consultation thread", "min-h-[200px]", "overflow-y-auto"],
    ["video", "Video consultation surface", "min-h-[280px]", "overflow-hidden"],
  ] as const)(
    "renders region with correct a11y and classes for %s variant",
    (variant, label, minHeightClass, overflowClass) => {
      const { container } = render(
        <BodyZone variant={variant} {...baseProps} />,
      );
      const region = screen.getByRole("region", { name: label });
      expect(region).toBeInTheDocument();
      expect(region.className).toContain(minHeightClass);
      expect(region.className).toContain(overflowClass);
      expect(
        container.querySelector("[data-testid='consultation-body-pane']"),
      ).toBeInTheDocument();
    },
  );

  it("fires body-refactored telemetry on mount", () => {
    render(<BodyZone variant="voice" {...baseProps} />);
    expect(trackBodyRefactored).toHaveBeenCalledWith({
      appointmentId: "appt-body-zone-1",
      variant: "voice",
    });
  });
});
