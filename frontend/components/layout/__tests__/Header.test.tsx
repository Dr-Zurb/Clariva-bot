/**
 * Header — unit tests (Vitest + RTL) — cpv-07 search collapse
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Header } from "../Header";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/components/dashboard/DashboardEventsBell", () => ({
  DashboardEventsBell: () => null,
}));

vi.mock("../PracticePill", () => ({
  PracticePill: () => null,
}));

vi.mock("../HeaderProfileMenu", () => ({
  HeaderProfileMenu: () => null,
}));

describe("Header search collapse (cpv-07 A)", () => {
  it("renders both expanded and collapsed search markup", () => {
    render(<Header onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("header-search-expanded")).toBeInTheDocument();
    expect(screen.getByTestId("header-search-collapsed")).toBeInTheDocument();
  });

  it("renders a search input with placeholder in the collapsed branch", () => {
    render(<Header onOpenSearch={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Search"));
    const search = screen.getAllByPlaceholderText("Search…");
    expect(search.length).toBeGreaterThanOrEqual(1);
  });

  it("expanded branch uses xl breakpoint visibility classes", () => {
    render(<Header onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("header-search-expanded").className).toMatch(
      /hidden xl:flex/,
    );
  });

  it("collapsed branch uses xl:hidden", () => {
    render(<Header onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("header-search-collapsed").className).toMatch(
      /xl:hidden/,
    );
  });
});
