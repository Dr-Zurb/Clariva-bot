/**
 * Sidebar setup group — Getting started above main nav (GS-D1 / GS-D5).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "../Sidebar";

describe("Sidebar setup group", () => {
  it("pins Getting started above Today with a separator (no Get verified tab)", () => {
    render(<Sidebar />);

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const links = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.textContent?.trim()
    );

    expect(links[0]).toMatch(/getting started/i);
    expect(links[1]).toMatch(/^today$/i);
    expect(screen.queryByRole("link", { name: /get verified/i })).toBeNull();

    expect(nav.querySelector('[role="separator"]')).toBeTruthy();

    const gettingStarted = screen.getByRole("link", { name: /getting started/i });
    const separator = nav.querySelector('[role="separator"]')!;
    const today = screen.getByRole("link", { name: /^today$/i });

    expect(
      gettingStarted.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      separator.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("hides Getting started and drops the separator when go-live is complete", () => {
    render(<Sidebar hideGettingStarted />);

    expect(
      screen.queryByRole("link", { name: /getting started/i })
    ).toBeNull();
    expect(screen.getByRole("link", { name: /^today$/i })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav.querySelector('[role="separator"]')).toBeNull();
  });
});
