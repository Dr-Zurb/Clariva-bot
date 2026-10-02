import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharePrepLink } from "./SharePrepLink";

describe("SharePrepLink", () => {
  it("copies the prep URL and does not include a join path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText }, share: undefined });
    const prepUrl = "https://clinic.example/book/prep?t=history-token";
    render(<SharePrepLink resolveUrl={async () => prepUrl} />);
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(prepUrl);
    expect(writeText.mock.calls[0]?.[0]).not.toContain("/consult/join");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("/my-visit");
  });
});
