import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { badgeVariants } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/service-reviews/ConfidenceBadge";

function badgeFrom(container: HTMLElement) {
  return container.querySelector('[class*="rounded-md"][class*="border"]');
}

function expectVariant(
  container: HTMLElement,
  variant: "success" | "warning" | "destructive" | "info"
) {
  const badge = badgeFrom(container);
  expect(badge).toBeTruthy();
  const expectedClass = badgeVariants({ variant });
  expectedClass.split(" ").forEach((cls) => {
    if (cls) expect(badge!.className).toContain(cls);
  });
}

function countFilledSegments(container: HTMLElement): number {
  const segments = container.querySelectorAll('[aria-hidden="true"] > span');
  return Array.from(segments).filter((el) => el.className.includes("opacity-80")).length;
}

describe("ConfidenceBadge", () => {
  it('"high" maps to success variant with 3 filled segments', () => {
    const { container } = render(<ConfidenceBadge confidence="high" />);
    expectVariant(container, "success");
    expect(countFilledSegments(container)).toBe(3);
    expect(badgeFrom(container)).toHaveTextContent("high");
  });

  it('"Medium" (mixed case) maps to warning with 2 filled segments', () => {
    const { container } = render(<ConfidenceBadge confidence="Medium" />);
    expectVariant(container, "warning");
    expect(countFilledSegments(container)).toBe(2);
    expect(badgeFrom(container)).toHaveTextContent("Medium");
  });

  it('"low" maps to destructive with 1 filled segment', () => {
    const { container } = render(<ConfidenceBadge confidence="low" />);
    expectVariant(container, "destructive");
    expect(countFilledSegments(container)).toBe(1);
    expect(badgeFrom(container)).toHaveTextContent("low");
  });

  it('"weird" falls back to info with 0 filled segments', () => {
    const { container } = render(<ConfidenceBadge confidence="weird" />);
    expectVariant(container, "info");
    expect(countFilledSegments(container)).toBe(0);
    expect(badgeFrom(container)).toHaveTextContent("weird");
  });

  it('"" falls back to info with 0 filled segments and renders "unknown"', () => {
    const { container } = render(<ConfidenceBadge confidence="" />);
    expectVariant(container, "info");
    expect(countFilledSegments(container)).toBe(0);
    expect(badgeFrom(container)).toHaveTextContent("unknown");
  });
});
