/**
 * Sidebar Alerts badge — alerts-v1 · alr-02.
 *
 * Confirms `dashboardEventsUnread` lights the Alerts nav pill.
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("Sidebar Alerts badge", () => {
  it("shows the unread count when dashboardEventsUnread > 0", () => {
    render(
      <Sidebar
        counts={{
          opdLive: 0,
          bookingReviewsUnconfirmed: 0,
          dashboardEventsUnread: 3,
        }}
      />
    );

    const alertsLink = screen.getByRole("link", { name: /Alerts/i });
    expect(alertsLink).toHaveTextContent("3");
  });
});
