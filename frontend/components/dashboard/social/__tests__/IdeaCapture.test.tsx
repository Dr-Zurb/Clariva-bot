/**
 * On-the-go idea capture — title required, Thoughts stage.
 * A shared link opens this screen and is saved only when Add is pressed.
 */

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaCapture } from "../IdeaCapture";
import { FILE_ACCEPT } from "../idea-composer";
import { ideaCaptureHref, seedIdeaCapture } from "../idea-capture";
import { createSocialCard, listSocialCards, prepareSocialCardFile } from "../social-cards";
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
  listSocialCards: vi.fn(async () => []),
  prepareSocialCardFile: vi.fn(async () => "doctor/photo.jpg"),
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
const listMock = vi.mocked(listSocialCards);
const prepareMock = vi.mocked(prepareSocialCardFile);
const stagedMock = vi.mocked(readStagedFilesFromCache);
const PENDING_KEY = "halo-idea-pending-v1";

beforeEach(() => {
  window.localStorage.clear();
  createMock.mockReset();
  listMock.mockReset();
  prepareMock.mockReset();
  stagedMock.mockReset();
  stagedMock.mockResolvedValue([]);
  listMock.mockResolvedValue([]);
  createMock.mockResolvedValue({ id: "card-1" } as Awaited<ReturnType<typeof createSocialCard>>);
  prepareMock.mockResolvedValue("doctor/photo.jpg");
});

describe("seedIdeaCapture", () => {
  it("keeps a shared reel address and leaves the title empty", () => {
    expect(seedIdeaCapture({ note: "https://www.instagram.com/reel/abc" })).toEqual({
      title: "",
      note: "",
      link: "https://www.instagram.com/reel/abc",
    });
  });

  it("keeps a caption and pulls the address out of it", () => {
    expect(
      seedIdeaCapture({ note: "Use the fee line https://www.instagram.com/p/abc" }),
    ).toEqual({
      title: "",
      note: "Use the fee line",
      link: "https://www.instagram.com/p/abc",
    });
  });

  it("leaves the title empty when a link is shared", () => {
    expect(
      seedIdeaCapture({
        title: "Clinic hours",
        link: "https://www.youtube.com/watch?v=abc",
      }),
    ).toEqual({
      title: "",
      note: "",
      link: "https://www.youtube.com/watch?v=abc",
    });
  });

  it("does not use the address as the title", () => {
    expect(seedIdeaCapture({ title: "https://youtu.be/abc" })).toEqual({
      title: "",
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
    ).toBe("/c/idea?title=Fees&keys=share-target-a");
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

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        "token",
        "Fees reel",
        "thoughts",
        { words: { note: "New slot" } },
        { keepalive: true }
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Saved to Thoughts.");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Open the board" })).toHaveAttribute("href", "/dashboard/social");
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBeNull());
  });

  it("shows saved before the server answers", () => {
    createMock.mockReturnValue(new Promise(() => undefined));
    render(<IdeaCapture token="token" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Clinic hours" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved to Thoughts.");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(window.localStorage.getItem(PENDING_KEY)).toContain("Clinic hours");
  });

  it("puts the idea back when the save fails", async () => {
    createMock.mockRejectedValue(new Error("Request failed"));
    render(<IdeaCapture token="token" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Clinic hours" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Evening slot" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
    expect(screen.getByLabelText("Title")).toHaveValue("Clinic hours");
    expect(screen.getByLabelText("Note")).toHaveValue("Evening slot");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("sends an idea a closed sheet left behind, once", async () => {
    const at = Date.now() - 10 * 60 * 1000;
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        { id: "a", title: "Left behind", note: "From the reel", at },
        { id: "b", title: "Already in", at },
      ])
    );
    listMock.mockResolvedValue([
      { title: "Already in", sourceUrl: null, createdAt: new Date(at).toISOString() },
    ] as Awaited<ReturnType<typeof listSocialCards>>);
    render(<IdeaCapture token="token" />);
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBeNull());
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith("token", "Left behind", "thoughts", {
      words: { note: "From the reel" },
    });
  });

  it("refuses a title-only save when the link is not an address", async () => {
    render(<IdeaCapture token="token" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fees reel" } });
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "not a link" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a link");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("opens gallery beside camera, video, and files", () => {
    render(<IdeaCapture token="token" />);
    expect(screen.queryByLabelText("Gallery")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a file" }));
    expect(screen.getByLabelText("Gallery")).toHaveAttribute("accept", "image/*");
    expect(screen.getByLabelText("Camera")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("Video")).toHaveAttribute("accept", "video/*");
    expect(screen.getByLabelText("Files")).toHaveAttribute("accept", FILE_ACCEPT);
  });

  it("opens a shared link with an empty title", () => {
    render(<IdeaCapture token="token" note="https://www.instagram.com/reel/abc" />);
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Title")).not.toHaveFocus();
    expect(screen.getByLabelText("Title")).toHaveAttribute("autocomplete", "halo-idea-title");
    expect(screen.getByLabelText("Link")).toHaveAttribute("autocomplete", "halo-idea-link");
    expect(screen.getByLabelText("Link")).toHaveValue("https://www.instagram.com/reel/abc");
    expect(screen.getByLabelText("Note")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("attaches the first shared file", async () => {
    const photo = new File(["img"], "shared-1.jpg", { type: "image/jpeg" });
    stagedMock.mockResolvedValue([photo]);
    render(<IdeaCapture token="token" title="From the share sheet" fileKeys="share-target-a" />);
    expect(await screen.findByText("shared-1.jpg")).toBeInTheDocument();
    await waitFor(() => expect(prepareMock).toHaveBeenCalledWith("token", photo));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        "token",
        "From the share sheet",
        "thoughts",
        { filePath: "doctor/photo.jpg" },
        { keepalive: true }
      )
    );
  });
});
