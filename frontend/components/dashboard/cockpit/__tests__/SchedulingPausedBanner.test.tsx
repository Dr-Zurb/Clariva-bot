import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SchedulingPausedBanner } from "../SchedulingPausedBanner";

const useDoctorSettingsQueryMock = vi.fn();

vi.mock("@/hooks/queries/useDoctorSettingsQuery", () => ({
  useDoctorSettingsQuery: (...args: unknown[]) =>
    useDoctorSettingsQueryMock(...args),
}));

function settingsResult(paused: boolean) {
  return {
    data: { data: { settings: { instagram_receptionist_paused: paused } } },
    isLoading: false,
    isError: false,
  };
}

describe("SchedulingPausedBanner", () => {
  it("shows a home nudge with a link back to the pause control", () => {
    useDoctorSettingsQueryMock.mockReturnValue(settingsResult(true));

    render(<SchedulingPausedBanner token="token" />);

    expect(
      screen.getByRole("heading", { name: "Automated scheduling is paused" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Turn scheduling back on/i }),
    ).toHaveAttribute(
      "href",
      "/dashboard/settings/integrations#receptionist-pause",
    );
  });

  it("stays hidden when scheduling is on, still loading, or failed to load", () => {
    useDoctorSettingsQueryMock.mockReturnValue(settingsResult(false));
    const { rerender } = render(<SchedulingPausedBanner token="token" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();

    useDoctorSettingsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    rerender(<SchedulingPausedBanner token="token" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();

    useDoctorSettingsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    rerender(<SchedulingPausedBanner token="token" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
