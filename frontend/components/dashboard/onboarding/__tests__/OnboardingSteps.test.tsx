import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

import { OnboardingSteps } from "../OnboardingSteps";
import type { ChecklistStepView } from "../onboarding-steps";

const sampleSteps: ChecklistStepView[] = [
  {
    id: "verify",
    title: "Get verified",
    description: "Confirm registration.",
    href: "/dashboard/get-verified",
    cta: "Get verified",
    done: false,
  },
  {
    id: "instagram",
    title: "Connect socials",
    description: "Link IG or Facebook.",
    href: "/dashboard/settings/integrations",
    cta: "Connect socials",
    done: false,
  },
];

describe("OnboardingSteps", () => {
  it("renders CTAs for open steps", () => {
    render(<OnboardingSteps steps={sampleSteps} />);
    expect(
      screen.getByRole("link", { name: /get verified/i })
    ).toHaveAttribute("href", "/dashboard/get-verified");
    expect(
      screen.getByRole("link", { name: /^connect socials$/i })
    ).toHaveAttribute("href", "/dashboard/settings/integrations");
  });

  it("shows status label instead of CTA when pending review", () => {
    render(
      <OnboardingSteps
        steps={[
          {
            ...sampleSteps[0]!,
            statusLabel: "Under review",
          },
        ]}
      />
    );
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /get verified/i })
    ).toBeNull();
  });

  it("shows Done for completed steps", () => {
    render(
      <OnboardingSteps
        steps={[{ ...sampleSteps[0]!, done: true }]}
      />
    );
    expect(screen.getByText(/^done$/i)).toBeInTheDocument();
  });
});
