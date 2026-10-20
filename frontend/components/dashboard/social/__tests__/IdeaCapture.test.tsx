/**
 * On-the-go idea capture — title required, Thoughts stage.
 * A shared link opens this screen and is saved only when Add is pressed.
 */

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaCapture } from "../IdeaCapture";
import { ideaCaptureHref, seedIdeaCapture } from "../idea-capture";
import {
  attachSocialCardFile,
  createSocialCard,
  updateSocialCard,
} from "../social-cards";
import { readStagedFilesFromCache } from "@/lib/text/share-target-bridge";

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

vi.mock("../social-cards", () => ({
  createSocialCard: vi.fn(),
  updateSocialCard: vi.fn(),
  attachSocialCardFile: vi.fn(),
  socialFileIssue: () => null,
}));

vi.mock("@/lib/text/share-target-bridge", () => ({
  parseShareTargetKeys: (raw: string | null | undefined) =>
    (raw ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("share-target-")),
  readStagedFilesFromCache: vi.fn(async () => []),
  clearShareStaging: vi.fn(async () => undefined),
}));

const createMock = vi.mocked(createSocialCard);
const updateMock = vi.mocked(updateSocialCard);
const attachMock = vi.mocked(attachSocialCardFile);
const stagedMock = vi.mocked(readStagedFilesFromCache);

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  attachMock.mockReset();
  stagedMock.mockReset();
  stagedMock.mockResolvedValue([]);
  createMock.mockResolvedValue({ id: "card-1" } as Awaited<ReturnType<typeof createSocialCard>>);
  updateMock.mockResolvedValue({ id: "card-1" } as Awaited<ReturnType<typeof updateSocialCard>>);
  attachMock.mockResolvedValue({ id: "card-1" } as Awaited<ReturnType<typeof attachSocialCardFile>>);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ title: null }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seedIdeaCapture", () => {
  it("names an Instagram reel and keeps the address as the link", () => {
    expect(seedIdeaCapture({ note: "https://www.instagram.com/reel/abc" })).toEqual({
      title: "Instagram reel",
      note: "",
      link: "https://www.instagram.com/reel/abc",
    });
  });

  it("keeps a caption and pulls the address out of it", () => {
    expect(
      seedIdeaCapture({ note: "Use the fee line https://www.instagram.com/p/abc" }),
    ).toEqual({
      title: "Instagram post",
      note: "Use the fee line",
      link: "https://www.instagram.com/p/abc",
    });
  });

  it("keeps a title the other app sent", () => {
    expect(
      seedIdeaCapture({
        title: "Clinic hours",
        link: "https://www.youtube.com/watch?v=abc",
      }),
    ).toEqual({
      title: "Clinic hours",
      note: "",
      link: "https://www.youtube.com/watch?v=abc",
    });
  });

  it("uses a short label when the shared title is only the address", () => {
    expect(seedIdeaCapture({ title: "https://youtu.be/abc" })).toEqual({
      title: "YouTube",
      note: "",
      link: "https://youtu.be/abc",
    });
  });

  it("keeps a title and a separate note", () => {
    expect(seedIdeaCapture({ title: "Fees reel", note: "Mention the new slot" })).toEqual({
      title: "Fees reel",
      note: "Mention the new slot",
      link: "",
    });
  });

  it("builds the capture url", () => {
    expect(
      ideaCaptureHref({ title: "Fees", keys: ["share-target-a"] })
    ).toBe("/dashboard/social/idea?title=Fees&keys=share-target-a");
  });
});

describe("IdeaCapture", () => {
  it("does not save an empty title", () => {
    render(<IdeaCapture token="token" />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createMock).not.toHaveBeenCalled();
  });

  it("saves a thought and clears the form", async () => {
    render(<IdeaCapture token="token" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fees reel" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "New slot" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith("token", "Fees reel", "thoughts"));
    expect(updateMock).toHaveBeenCalledWith("token", "card-1", { words: { note: "New slot" } });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved to Thoughts.");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Open the board" })).toHaveAttribute("href", "/dashboard/social");
  });

  it("refuses a title-only save when the link is not an address", async () => {
    render(<IdeaCapture token="token" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fees reel" } });
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "not a link" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a link");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("opens a shared link without saving", () => {
    render(<IdeaCapture token="token" note="https://www.instagram.com/reel/abc" />);
    expect(screen.getByLabelText("Title")).toHaveValue("Instagram reel");
    expect(screen.getByLabelText("Link")).toHaveValue("https://www.instagram.com/reel/abc");
    expect(screen.getByLabelText("Note")).toHaveValue("");
    expect(screen.getByLabelText("Note")).toHaveFocus();
    expect(screen.getByPlaceholderText("What to use from this")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("replaces a YouTube label with the video title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ title: "Fever season reel" }), { status: 200 })),
    );
    render(<IdeaCapture token="token" link="https://www.youtube.com/watch?v=abc" />);
    expect(await screen.findByDisplayValue("Fever season reel")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("keeps a title the doctor typed while the lookup is still running", async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<IdeaCapture token="token" link="https://www.youtube.com/watch?v=abc" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My line" } });
    finish(new Response(JSON.stringify({ title: "Video name" }), { status: 200 }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("My line"));
  });

  it("attaches the first shared file", async () => {
    const photo = new File(["img"], "shared-1.jpg", { type: "image/jpeg" });
    stagedMock.mockResolvedValue([photo]);
    render(<IdeaCapture token="token" title="From the share sheet" fileKeys="share-target-a" />);
    expect(await screen.findByText("shared-1.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(attachMock).toHaveBeenCalledWith("token", "card-1", photo));
  });
});
