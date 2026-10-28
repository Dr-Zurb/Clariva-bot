/**
 * Social shell and content board — soc-01, soc-04.
 */

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SocialClient } from "../SocialClient";
import { clearSocialBoardCache } from "../social-board-cache";
import { cardDrop, moveAcross, moveWithin } from "../SocialBoard";
import { dayLabel, timeLabel } from "../SocialSchedule";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  addSocialCardScrap,
  attachSocialCardFile,
  createReadySocialCard,
  createSocialCard,
  prepareSocialCardFile,
  listSocialCards,
  getSocialAnalytics,
  getSocialCardScrapUrl,
  moveSocialCard,
  reuseSocialCard,
  deleteSocialCard,
  emptySocialBin,
  listSocialBin,
  purgeSocialCard,
  restoreSocialCard,
  updateSocialCard,
  listSocialColumns,
  deleteSocialColumn,
  type SocialAnalyticsPost,
  type SocialAnalyticsReport,
  type SocialCard,
} from "../social-cards";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/social",
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

vi.mock("../social-cards", async () => {
  const actual = await vi.importActual<typeof import("../social-cards")>("../social-cards");
  return {
  listSocialCards: vi.fn(),
  getSocialCardFileUrl: vi.fn(),
  getSocialCardScrapUrl: vi.fn(),
  createSocialCard: vi.fn(),
  createReadySocialCard: vi.fn(),
  prepareSocialCardFile: vi.fn(),
  moveSocialCard: vi.fn(),
  moveSocialCardToColumn: vi.fn(),
  updateSocialCard: vi.fn(),
  addSocialCardScrap: vi.fn(),
  attachSocialCardFile: vi.fn(),
  removeSocialCardFile: vi.fn(),
  reuseSocialCard: vi.fn(),
  deleteSocialCard: vi.fn(),
  duplicateSocialCard: vi.fn(),
  listSocialBin: vi.fn(),
  binDaysLeft: () => 12,
  restoreSocialCard: vi.fn(),
  purgeSocialCard: vi.fn(),
  emptySocialBin: vi.fn(),
  listSocialColumns: vi.fn(),
  createSocialColumn: vi.fn(),
  renameSocialColumn: vi.fn(),
  deleteSocialColumn: vi.fn(),
  createSocialCardInColumn: vi.fn(),
  socialFileIssue: () => null,
  socialFileKind: () => null,
  cardFileAccept: actual.cardFileAccept,
  cardFileIssue: actual.cardFileIssue,
  referenceFileIssue: actual.referenceFileIssue,
  MEDIA_FILE_ACCEPT: actual.MEDIA_FILE_ACCEPT,
  postsByHand: (words: { byHand?: boolean; music?: string; productTag?: string } | null | undefined) =>
    Boolean(words?.byHand || words?.music?.trim() || words?.productTag?.trim()),
  getSocialAnalytics: vi.fn(),
  };
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

const listMock = vi.mocked(listSocialCards);
const analyticsMock = vi.mocked(getSocialAnalytics);
const createMock = vi.mocked(createSocialCard);
const createReadyMock = vi.mocked(createReadySocialCard);
const prepareMock = vi.mocked(prepareSocialCardFile);
const scrapMock = vi.mocked(addSocialCardScrap);
const attachMock = vi.mocked(attachSocialCardFile);
const scrapUrlMock = vi.mocked(getSocialCardScrapUrl);
const moveMock = vi.mocked(moveSocialCard);
const updateMock = vi.mocked(updateSocialCard);
const reuseMock = vi.mocked(reuseSocialCard);
const deleteCardMock = vi.mocked(deleteSocialCard);
const listBinMock = vi.mocked(listSocialBin);
const purgeBinMock = vi.mocked(purgeSocialCard);
const emptyBinMock = vi.mocked(emptySocialBin);
const restoreBinMock = vi.mocked(restoreSocialCard);
const listColumnsMock = vi.mocked(listSocialColumns);
const deleteColumnMock = vi.mocked(deleteSocialColumn);

function liftTransfer(): {
  effectAllowed: string;
  dropEffect: string;
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
  types: string[];
} {
  const data: Record<string, string> = {};
  const types: string[] = [];
  return {
    effectAllowed: "copy",
    dropEffect: "copy",
    setData(type: string, value: string) {
      data[type] = value;
      if (!types.includes(type)) types.push(type);
    },
    getData(type: string) {
      return data[type] ?? "";
    },
    types,
  };
}

function card(
  partial: Pick<SocialCard, "id" | "title" | "stage"> &
    Partial<
      Pick<
        SocialCard,
        | "format"
        | "topic"
        | "words"
        | "hasFile"
        | "scheduledAt"
        | "publishError"
        | "instagramUrl"
        | "visitCount"
        | "pagePath"
        | "updatedAt"
        | "columnId"
        | "deletedAt"
        | "scraps"
        | "fileKind"
        | "postable"
      >
    >
): SocialCard {
  return {
    format: null,
    topic: null,
    words: {},
    hasFile: false,
    fileKind: null,
    sourceUrl: null,
    scheduledAt: null,
    publishError: null,
    instagramUrl: null,
    visitCount: 0,
    columnId: null,
    deletedAt: null,
    pagePath: null,
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function analyticsReport(posts: SocialAnalyticsPost[] = []): SocialAnalyticsReport {
  const bookings = posts.reduce((sum, post) => sum + post.bookings, 0);
  return {
    range: { from: "2026-09-20", to: "2026-10-19" },
    previous: { from: "2026-08-21", to: "2026-09-19" },
    tiles: {
      enquiries: { value: 0, previous: 0 },
      bookings: { value: bookings, previous: 0 },
      conversion: null,
      posts: { value: posts.length, previous: 0 },
    },
    days: [],
    best: posts.filter((post) => post.bookings > 0 || post.enquiries > 0),
    formats: [],
    topics: [],
    rhythm: { weeks: [], usual: null },
    posts,
    sentence: null,
  };
}

describe("Social shell", () => {
  beforeEach(() => {
    clearSocialBoardCache();
    listMock.mockReset();
    createMock.mockReset();
    createReadyMock.mockReset();
    prepareMock.mockReset();
    attachMock.mockReset();
    moveMock.mockReset();
    updateMock.mockReset();
    reuseMock.mockReset();
    deleteCardMock.mockReset();
    listColumnsMock.mockReset();
    deleteColumnMock.mockReset();
    listMock.mockResolvedValue([]);
    listColumnsMock.mockRejectedValue(new Error("columns"));
    analyticsMock.mockReset();
    analyticsMock.mockResolvedValue(analyticsReport());
  });

  it("opens on the board and keeps Schedule and Analytics empty", async () => {
    render(<SocialClient token="token" />);

    expect(screen.getByRole("heading", { name: "Social" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Chosen" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Making" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Bin" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByText("Nothing is timed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bin" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect(await screen.findByText("Nothing has been posted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bin" })).not.toBeInTheDocument();
  });

  it("places two cards in the columns the API returned", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts" }),
      card({ id: "2", title: "Cough", stage: "ready" }),
    ]);

    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    const ready = screen.getByRole("region", { name: "Ready" });
    expect(thoughts).toHaveTextContent("Fees");
    expect(ready).toHaveTextContent("Cough");
    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Add new");
  });

  it("paints the last board immediately the next time Social opens", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    const first = render(<SocialClient token="token" />);
    expect(await screen.findByRole("button", { name: "Fees" })).toBeInTheDocument();
    first.unmount();

    render(<SocialClient token="token" />);
    expect(screen.getByRole("button", { name: "Fees" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ideas" })).toHaveTextContent("Fees");
  });

  it("adds a title into Ideas and can move it", async () => {
    createMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "thoughts" }));
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen" }));

    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Ideas" });

    expect(screen.queryByLabelText("New idea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("File already made")).not.toBeInTheDocument();

    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    fireEvent.click(screen.getByRole("button", { name: "Add to Ideas" }));
    fireEvent.change(screen.getByLabelText("Title for Ideas"), {
      target: { value: "Fees" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith("token", "Fees", "thoughts");
    });
    expect(await screen.findByText("Fees")).toBeInTheDocument();

    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "chosen" })]);
    fireEvent.click(screen.getByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));

    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
    });
    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Fees");
  });

  it("moves from the new title into the note on Enter", async () => {
    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Ideas" }));
    const title = screen.getByLabelText("Title for Ideas");
    fireEvent.change(title, { target: { value: "Test idea" } });
    fireEvent.keyDown(title, { key: "Enter" });

    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title for Ideas")).toHaveValue("Test idea");
    await waitFor(() => {
      expect(screen.getByLabelText("Note")).toHaveFocus();
    });
  });

  it("keeps a reference when the card is chosen", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "thoughts",
        words: { note: "Drink water" },
        scraps: [{ id: "scrap-1", fileKind: "photo", postable: true }],
      }),
    ]);
    moveMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "chosen", words: { note: "Drink water" } })
    );
    scrapUrlMock.mockResolvedValue("https://example.test/photo.jpg");

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
    });

    fireEvent.click(within(screen.getByRole("region", { name: "Chosen" })).getByRole("button", { name: "Fees" }));
    expect(screen.getByRole("button", { name: "Remove file" })).toBeInTheDocument();
  });

  it("edits a card from the board and deletes it from the open card", async () => {
    deleteCardMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Fees" }));

    const editor = await screen.findByRole("form", { name: "Card Fees" });
    expect(within(editor).getByLabelText("Title")).toHaveValue("Fees");
    expect(within(editor).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteCardMock).toHaveBeenCalledWith("token", "1");
    });
    expect(screen.getByRole("region", { name: "Ideas" })).not.toHaveTextContent("Fees");
  });

  it("selects several cards and deletes that selection once", async () => {
    deleteCardMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts" }),
      card({ id: "2", title: "Cough", stage: "thoughts" }),
    ]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));

    const bar = screen.getByRole("toolbar", { name: "Selected cards" });
    expect(bar).toHaveTextContent("1 selected");
    expect(bar).toHaveTextContent("Move to");
    expect(within(bar).getByRole("button", { name: "Select all" })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Move selected to Ideas" })).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Move selected to Chosen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Cough" }));
    expect(bar).toHaveTextContent("2 selected");
    fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteCardMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("toolbar", { name: "Selected cards" })).not.toBeInTheDocument();
    expect(thoughts).not.toHaveTextContent("Fees");
    expect(thoughts).not.toHaveTextContent("Cough");
  });

  it("selects a card from its title or topic, not only the tick", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts" }),
      card({ id: "2", title: "Cough", stage: "thoughts", topic: "Clinic" }),
    ]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));

    const bar = screen.getByRole("toolbar", { name: "Selected cards" });
    expect(bar).toHaveTextContent("1 selected");

    fireEvent.click(within(thoughts).getByRole("button", { name: "Cough" }));
    expect(bar).toHaveTextContent("2 selected");

    fireEvent.click(within(thoughts).getByText("Clinic"));
    expect(bar).toHaveTextContent("1 selected");

    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    expect(bar).toHaveTextContent("1 selected");
  });

  it("leaves select mode as soon as the cards move", async () => {
    let finish: (value: SocialCard) => void = () => undefined;
    moveMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Chosen" }));

    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Fees");
    expect(thoughts).not.toHaveTextContent("Fees");
    expect(screen.queryByRole("toolbar", { name: "Selected cards" })).not.toBeInTheDocument();

    finish(card({ id: "1", title: "Fees", stage: "chosen" }));
    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
    });
  });

  it("keeps the selection when a grouped move fails", async () => {
    moveMock.mockRejectedValue(new Error("Could not move the card"));
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Chosen" }));

    expect(await screen.findByRole("toolbar", { name: "Selected cards" })).toHaveTextContent("1 selected");
    expect(thoughts).toHaveTextContent("Fees");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not move the card");
  });

  it("moves a card to the next column from the arrow", async () => {
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen" }));
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts" }),
      card({ id: "2", title: "Cough", stage: "ready", hasFile: true, fileKind: "photo", postable: true }),
    ]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    expect(within(thoughts).getByRole("button", { name: "Move Fees to Chosen" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Ready" })).queryByRole("button", { name: /Move Cough/ })
    ).not.toBeInTheDocument();

    fireEvent.click(within(thoughts).getByRole("button", { name: "Move Fees to Chosen" }));

    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
    });
    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Fees");
    expect(thoughts).not.toHaveTextContent("Fees");
  });

  it("keeps a card in Making when Ready still needs a file", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "making" })]);
    render(<SocialClient token="token" />);

    const making = await screen.findByRole("region", { name: "Making" });
    fireEvent.click(within(making).getByRole("button", { name: "Move Fees to Ready" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ready needs a file");
    expect(moveMock).not.toHaveBeenCalled();
    expect(making).toHaveTextContent("Fees");
  });

  it("opens the card sheet from Chosen and Making", async () => {
    createMock
      .mockResolvedValueOnce(card({ id: "1", title: "untitled", stage: "chosen" }))
      .mockResolvedValueOnce(card({ id: "2", title: "untitled", stage: "making" }));

    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Chosen" });

    fireEvent.click(screen.getByRole("button", { name: "Add to Chosen" }));
    expect(await screen.findByRole("dialog", { name: "Card untitled" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resources" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Title for Chosen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Column for Chosen")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith("token", "untitled", "chosen");
    });

    fireEvent.click(screen.getByRole("button", { name: "Add to Making" }));
    expect(await screen.findByText("Add the file")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title for Making")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith("token", "untitled", "making");
    });

    const ready = screen.getByRole("region", { name: "Ready" });
    expect(within(ready).queryByRole("button", { name: "Add to Ready" })).not.toBeInTheDocument();
    expect(within(ready).getByRole("button", { name: "Add new" })).toBeInTheDocument();
    expect(createReadyMock).not.toHaveBeenCalled();
  });

  it("opens the preview from a finished file and keeps the note out", async () => {
    let releaseUpload: (value: string) => void = () => undefined;
    let releaseCreate: (value: SocialCard) => void = () => undefined;
    prepareMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseUpload = resolve;
        })
    );
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCreate = resolve;
        })
    );
    updateMock.mockResolvedValue(
      card({
        id: "9",
        title: "untitled",
        stage: "making",
        format: "reel",
        hasFile: true,
        fileKind: "video",
        postable: true,
      })
    );

    render(<SocialClient token="token" />);
    const ready = await screen.findByRole("region", { name: "Ready" });
    fireEvent.click(within(ready).getByRole("button", { name: "Add new" }));
    expect(createMock).not.toHaveBeenCalled();

    const input = screen.getByLabelText("Finished file");
    fireEvent.change(input, {
      target: { files: [new File(["notes"], "notes.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a photo or a video");
    expect(createMock).not.toHaveBeenCalled();

    const video = new File(["video"], "tour.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [video] } });
    expect(await screen.findByRole("dialog", { name: "Card untitled" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Uploading" })).toBeInTheDocument();
    expect(prepareMock).toHaveBeenCalledWith("token", video);
    expect(createMock).not.toHaveBeenCalled();
    expect(attachMock).not.toHaveBeenCalled();
    releaseUpload(`${"token"}/tour.mp4`);
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith("token", "untitled", "making", { filePath: "token/tour.mp4" })
    );
    expect(screen.getByRole("status", { name: "Uploading" })).toBeInTheDocument();
    releaseCreate(
      card({
        id: "9",
        title: "untitled",
        stage: "making",
        hasFile: true,
        fileKind: "video",
        postable: true,
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Uploading" })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole("complementary", { name: "Resources" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Note")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("untitled");
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Story" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a format" })).toBeDisabled();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();

    listMock.mockResolvedValue([
      card({
        id: "9",
        title: "untitled",
        stage: "making",
        hasFile: true,
        fileKind: "video",
        postable: true,
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Reel" }));
    expect(await screen.findByLabelText("Caption")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark ready" })).toBeEnabled();
  });

  it("keeps a file on the column where the idea was added", async () => {
    const file = new File(["photo"], "fees.jpg", { type: "image/jpeg" });
    createMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "thoughts" }));
    scrapMock.mockResolvedValue({ id: "scrap-1", fileKind: "photo", postable: true });
    listMock.mockResolvedValue([]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to Ideas" }));
    fireEvent.change(screen.getByLabelText("Title for Ideas"), {
      target: { value: "Fees" },
    });
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("File"), { target: { files: [file] } });
    expect(screen.queryByText("A file puts this on Ready.")).not.toBeInTheDocument();
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts", hasFile: true }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith("token", "Fees", "thoughts");
    });
    expect(scrapMock).toHaveBeenCalledWith("token", "1", file);
    expect(attachMock).not.toHaveBeenCalled();
    expect(createReadyMock).not.toHaveBeenCalled();
  });

  it("asks for a format before the caption on Making", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "making", words: { note: "headache tips" } }),
    ]);
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "making", format: "post", words: { note: "headache tips" } })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.getByLabelText("Note").textContent).toBe("headache tips");
    expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start making" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { format: "post" });
    });
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your story" })).toBeInTheDocument();
    expect(moveMock).not.toHaveBeenCalled();
  });

  it("keeps Mark ready off when the file cannot post and on when it can", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "making" }),
    ]);
    const empty = render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    expect(screen.getByRole("button", { name: "Choose a format" })).toBeDisabled();
    empty.unmount();

    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        hasFile: true,
        fileKind: "document",
        postable: false,
      }),
    ]);
    const blocked = render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    expect(screen.getByRole("button", { name: "Needs a photo or a video" })).toBeDisabled();
    blocked.unmount();

    moveMock.mockResolvedValue(
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        fileKind: "photo",
        postable: true,
      })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        hasFile: true,
        fileKind: "photo",
        postable: true,
      }),
    ]);
    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "ready");
    });
    expect(updateMock).toHaveBeenCalledWith(
      "token",
      "1",
      expect.objectContaining({ title: "Fees", format: "post" })
    );
    expect(updateMock.mock.calls[0]?.[2]).not.toHaveProperty("stage");
    expect(screen.getByRole("region", { name: "Ready" })).toHaveTextContent("Fees");
    expect(screen.getByRole("dialog", { name: "Card Fees" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Hour")).toBeInTheDocument();
  });

  it("lets a photo mark ready as a reel", async () => {
    moveMock.mockResolvedValue(
      card({
        id: "1",
        title: "Cough reel",
        stage: "ready",
        format: "reel",
        hasFile: true,
        fileKind: "photo",
        postable: true,
      })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Cough reel",
        stage: "making",
        format: "reel",
        hasFile: true,
        fileKind: "photo",
        postable: true,
      }),
    ]);
    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cough reel" }));
    expect(screen.queryByText("Needs a video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    await waitFor(() => {
      expect(moveMock).toHaveBeenCalledWith("token", "1", "ready");
    });
  });

  it("refuses a PDF on a post, a reel, and a story", async () => {
    listMock.mockResolvedValue([
      card({ id: "post", title: "Fees post", stage: "making", format: "post" }),
      card({ id: "reel", title: "Cough reel", stage: "making", format: "reel" }),
      card({ id: "story", title: "Dengue story", stage: "making", format: "story" }),
    ]);
    render(<SocialClient token="token" />);

    fireEvent.click(await screen.findByRole("button", { name: "Fees post" }));
    const postFile = screen.getByLabelText("Attach the file for Fees post");
    expect(postFile.getAttribute("accept")).toMatch(/image\/jpeg/);
    expect(postFile.getAttribute("accept")).toMatch(/video\/mp4/);
    expect(postFile.getAttribute("accept")).not.toMatch(/pdf|audio|doc/i);
    fireEvent.change(postFile, {
      target: { files: [new File(["%PDF"], "note.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a photo or a video");
    expect(attachMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Cough reel" }));
    const reelFile = screen.getByLabelText("Attach the file for Cough reel");
    expect(reelFile.getAttribute("accept")).toMatch(/image\/jpeg/);
    expect(reelFile.getAttribute("accept")).toMatch(/mp4/);
    expect(reelFile.getAttribute("accept")).not.toMatch(/pdf/i);
    fireEvent.change(reelFile, {
      target: { files: [new File(["%PDF"], "note.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a photo or a video");
    scrapMock.mockClear();
    fireEvent.change(screen.getByLabelText("Add a reference"), {
      target: { files: [new File(["%PDF"], "note.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Use a photo or a video");
    expect(screen.getByLabelText("Add a reference").getAttribute("accept")).toBe("image/*,video/*");
    expect(attachMock).not.toHaveBeenCalled();
    expect(scrapMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Dengue story" }));
    const storyFile = screen.getByLabelText("Attach the file for Dengue story");
    expect(storyFile.getAttribute("accept")).toMatch(/image\/jpeg/);
    expect(storyFile.getAttribute("accept")).toMatch(/video\/mp4/);
    expect(storyFile.getAttribute("accept")).not.toMatch(/pdf/i);
    fireEvent.change(storyFile, {
      target: { files: [new File(["wav"], "note.wav", { type: "audio/wav" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a photo or a video");
    expect(attachMock).not.toHaveBeenCalled();
  });

  it("sets a time from the composer and the calendar keeps it", async () => {
    const when = new Date();
    when.setHours(9, 0, 0, 0);
    const iso = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 9, 0).toISOString();
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][when.getDay()];
    const timed = card({
      id: "1",
      title: "Fees",
      stage: "ready",
      format: "post",
      hasFile: true,
      fileKind: "photo",
      postable: true,
      scheduledAt: iso,
    });
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        fileKind: "photo",
        postable: true,
      }),
    ]);
    updateMock.mockResolvedValue(timed);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: `Choose ${dayName} ${when.getDate()}` }));
    fireEvent.click(screen.getByLabelText("Hour"));
    fireEvent.click(screen.getByRole("option", { name: "09" }));
    fireEvent.click(screen.getByLabelText("Minute"));
    fireEvent.click(screen.getByRole("option", { name: "00" }));
    const clock = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    expect(screen.getByText(new RegExp(`Halo Aid posts this on .+${clock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeInTheDocument();
    listMock.mockResolvedValue([timed]);
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { scheduledAt: iso, words: {} });
    });
    expect(await screen.findByRole("button", { name: "Scheduled" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Minute"));
    fireEvent.click(screen.getByRole("option", { name: "05" }));
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
    expect(moveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByRole("region", { name: dayLabel(iso) })).toHaveTextContent("Fees");
  });

  it("keeps a reel hook when the format is saved as a post", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "reel",
        words: { hook: "Three signs", caption: "What to watch" },
      }),
    ]);
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "making", format: "post" })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        "token",
        "1",
        expect.objectContaining({
          format: "post",
          words: expect.objectContaining({ hook: "Three signs", caption: "What to watch" }),
        })
      );
    });
  });

  it("places a selected line into the caption and keeps the note", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        words: { note: "headache tips" },
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    const note = screen.getByLabelText("Thought note");
    const line = note.querySelector("[role='textbox']");
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "headache tips",
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: line,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          bottom: 24,
          left: 8,
          top: 0,
          right: 40,
          width: 32,
          height: 16,
          x: 8,
          y: 8,
          toJSON: () => ({}),
        }),
      }),
    } as unknown as Selection);
    fireEvent.mouseUp(note);
    fireEvent.click(screen.getByRole("button", { name: "Caption" }));

    expect(screen.getByLabelText("Caption")).toHaveValue("headache tips");
    expect(line?.textContent).toBe("headache tips");
    selection.mockRestore();
  });

  it("drops a line from the thought into the caption", () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        words: { note: "headache tips" },
      }),
    ]);

    render(<SocialClient token="token" />);
    return screen.findByRole("button", { name: "Fees" }).then((button) => {
      fireEvent.click(button);
      const transfer = liftTransfer();
      fireEvent.dragStart(screen.getByLabelText("Move line"), { dataTransfer: transfer });
      fireEvent.drop(screen.getByLabelText("Caption"), { dataTransfer: transfer });
      expect(screen.getByLabelText("Caption")).toHaveValue("headache tips");
      expect(screen.getByLabelText("Note").textContent).toBe("headache tips");
    });
  });

  it("uses a reference as the file that posts and keeps the reference", async () => {
    scrapUrlMock.mockResolvedValue("https://files.example/reference.jpg");
    attachMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "making", format: "post", hasFile: true }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/jpeg" }),
      })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        scraps: [{ id: "scrap-1", fileKind: "photo", postable: true }],
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    const shelf = screen.getByRole("complementary", { name: "Resources" });
    const tile = within(shelf).getByRole("button", { name: "Remove file" }).parentElement;
    if (!tile) throw new Error("missing reference");
    const transfer = liftTransfer();
    fireEvent.dragStart(tile, { dataTransfer: transfer });
    fireEvent.drop(screen.getByText("Add the file"), { dataTransfer: transfer });

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalled();
    });
    expect(within(shelf).getByRole("button", { name: "Remove file" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("refuses a document as the file that posts", () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        scraps: [{ id: "scrap-1", fileKind: "document", postable: false }],
      }),
    ]);

    render(<SocialClient token="token" />);
    return screen.findByRole("button", { name: "Fees" }).then((button) => {
      fireEvent.click(button);
      attachMock.mockClear();
      const shelf = screen.getByRole("complementary", { name: "Resources" });
      const tile = within(shelf).getByRole("button", { name: "Remove file" }).parentElement;
      if (!tile) throw new Error("missing reference");
      const transfer = liftTransfer();
      fireEvent.dragStart(tile, { dataTransfer: transfer });
      fireEvent.drop(screen.getByText("Add the file"), { dataTransfer: transfer });
      expect(screen.getByRole("alert")).toHaveTextContent("Ready needs a photo or a video");
      expect(attachMock).not.toHaveBeenCalled();
      expect(within(shelf).getByRole("button", { name: "Remove file" })).toBeInTheDocument();
    });
  });

  it("asks a Post for a caption and not for shots", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "making", format: "post" }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.getByRole("button", { name: "4:5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1:1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "16:9" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.getByText("2200")).toBeInTheDocument();
    expect(screen.getByLabelText("Alt text")).toBeInTheDocument();
    expect(screen.getByLabelText("Collaborators")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI-generated" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off commenting" })).toBeInTheDocument();
    expect(screen.getByLabelText("First comment")).toBeInTheDocument();
    expect(screen.queryByText("AI info")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI-generated" }));
    expect(screen.getByText("AI info")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post for me" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I'll post it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Music")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Product")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shot 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "About Alt text" }));
    expect(screen.getByRole("note")).toHaveTextContent("read-aloud");
  });

  it("keeps a saved song on you and a saved place on the time screen", async () => {
    listMock.mockResolvedValue([
      card({
        id: "song",
        title: "Song",
        stage: "ready",
        format: "post",
        hasFile: true,
        words: { music: "Soft" },
      }),
      card({
        id: "place",
        title: "Place",
        stage: "ready",
        format: "post",
        hasFile: true,
        words: { location: "Clinic" },
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Song" }));
    expect(screen.getByRole("button", { name: "Post for me" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "I'll post it" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Music")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Reminder message")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
    const place = screen.getByRole("dialog", { name: "Card Place" });
    expect(within(place).getByRole("button", { name: "Post for me" })).toHaveAttribute("aria-pressed", "true");
    expect(within(place).getByRole("button", { name: "Post now" })).toBeInTheDocument();
    expect(within(place).queryByLabelText("Reminder message")).not.toBeInTheDocument();
    expect(within(place).getByText(/Skip the date and time above. This card goes out at this minute/)).toBeInTheDocument();
    expect(within(place).getByText("Halo Aid posts this on your Instagram at the time you set.")).toBeInTheDocument();
    const copyList = within(place).getByRole("region", { name: "Copy into Instagram" });
    expect(copyList).toHaveTextContent("Clinic");
    fireEvent.click(within(place).getByRole("button", { name: "I'll post it" }));
    expect(within(place).getByRole("button", { name: "It's posted" })).toBeInTheDocument();
    expect(within(place).queryByRole("button", { name: "Post now" })).not.toBeInTheDocument();
    expect(within(place).getByText(/Mark it once it is on Instagram/)).toBeInTheDocument();
    expect(within(place).getByText("You post this. The time is a reminder.")).toBeInTheDocument();
    expect(within(place).getByLabelText("Reminder message")).toBeInTheDocument();
    expect(within(place).queryByText("Halo Aid posts this on your Instagram at the time you set.")).not.toBeInTheDocument();
    expect(within(place).getByRole("region", { name: "Copy into Instagram" })).toHaveTextContent("Clinic");
  });

  it("keeps a thought to a title", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    const track = screen.getByRole("navigation", { name: "Column" });
    expect(within(track).getByRole("button", { name: "Ideas" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: "Back to Chosen" })).not.toBeInTheDocument();
    expect(track.querySelector(".bg-primary")).toBeTruthy();
    expect(within(track).getByRole("button", { name: "Chosen" })).not.toHaveAttribute("aria-current");
    fireEvent.click(within(track).getByRole("button", { name: "Ready" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ready needs a file");
    expect(moveMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveClass("font-semibold");
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Topic")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    const note = screen.getByLabelText("Note");
    note.textContent = "/";
    fireEvent.input(note);
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Heading 2" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Heading 3" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Link" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Paste link")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Post" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Reel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Story" })).not.toBeInTheDocument();
  });

  it("saves a topic on a thought and leaves it in Ideas", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "thoughts", topic: "Cough" })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Cough" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Cough" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", {
        title: "Fees",
        topic: "Cough",
        sourceUrl: null,
        words: {},
      });
    });
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ideas" })).toHaveTextContent("Fees");
  });

  it("starts making from Chosen and keeps the making card open", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "chosen" })]);
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "making" }));

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start making" }));

    expect(moveMock).toHaveBeenCalledWith("token", "1", "making");
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Card Fees" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
    const track = screen.getByRole("navigation", { name: "Column" });
    expect(within(track).getByRole("button", { name: "Making" })).toHaveAttribute("aria-current", "step");
    expect(within(track).getByRole("button", { name: "Chosen" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Making" })).toHaveTextContent("Fees");
    expect(screen.getByRole("region", { name: "Chosen" })).not.toHaveTextContent("Fees");
    fireEvent.click(screen.getByRole("button", { name: "Back to Chosen" }));
    expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
  });

  it("shortlists a thought and does not post", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen" }));

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));

    expect(moveMock).toHaveBeenCalledWith("token", "1", "chosen");
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Card Fees" })).toBeInTheDocument();
    const track = screen.getByRole("navigation", { name: "Column" });
    expect(within(track).getByRole("button", { name: "Chosen" })).toHaveAttribute("aria-current", "step");
    expect(within(track).getByRole("button", { name: "Ideas" }).querySelector("svg")).toBeTruthy();
    expect(screen.queryByText("Chosen. Start making when you are ready.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start making" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Fees");
    expect(screen.getByRole("region", { name: "Ideas" })).not.toHaveTextContent("Fees");
  });

  it("restores one binned card, deletes another, and can empty the bin", async () => {
    const binned = [
      card({ id: "1", title: "Fees", stage: "thoughts", deletedAt: "2026-10-12T00:00:00.000Z" }),
      card({ id: "2", title: "Cough", stage: "thoughts", deletedAt: "2026-10-12T00:00:00.000Z" }),
    ];
    listBinMock.mockResolvedValue(binned);
    restoreBinMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "thoughts" }));
    purgeBinMock.mockResolvedValue(undefined);
    emptyBinMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue([]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Bin" }));

    const bin = await screen.findByRole("dialog", { name: "Bin" });
    expect(await within(bin).findByText("Fees")).toBeInTheDocument();
    expect(bin).toHaveTextContent("Cough");
    const fees = within(bin).getByText("Fees").closest("li");
    if (!fees) throw new Error("missing bin row");
    fireEvent.click(within(fees).getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(restoreBinMock).toHaveBeenCalledWith("token", "1");
    });
    expect(bin).not.toHaveTextContent("Fees");

    const cough = within(bin).getByText("Cough").closest("li");
    if (!cough) throw new Error("missing bin row");
    fireEvent.click(within(cough).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(purgeBinMock).toHaveBeenCalledWith("token", "2");
    });
    expect(bin).toHaveTextContent("The bin is empty.");
    expect(within(bin).queryByRole("button", { name: "Empty bin" })).not.toBeInTheDocument();

    fireEvent.click(within(bin).getByRole("button", { name: "Close" }));
    listBinMock.mockResolvedValue(binned);
    fireEvent.click(screen.getByRole("button", { name: "Bin" }));
    const again = await screen.findByRole("dialog", { name: "Bin" });
    fireEvent.click(await within(again).findByRole("button", { name: "Empty bin" }));
    await waitFor(() => {
      expect(emptyBinMock).toHaveBeenCalledWith("token");
    });
    expect(again).toHaveTextContent("The bin is empty.");
  });

  it("filters one column and leaves the other columns alone", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Alpha", stage: "thoughts", topic: "Cough" }),
      card({ id: "2", title: "Beta", stage: "thoughts", topic: "Fees" }),
      card({ id: "3", title: "Gamma", stage: "making", topic: "Fees" }),
      card({ id: "4", title: "Photo", stage: "ready", format: "post", hasFile: true }),
    ]);

    render(<SocialClient token="token" />);
    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    const making = screen.getByRole("region", { name: "Making" });
    const chosen = screen.getByRole("region", { name: "Chosen" });
    const ready = screen.getByRole("region", { name: "Ready" });

    fireEvent.click(screen.getByRole("button", { name: "Column menu for Chosen" }));
    expect(screen.getByLabelText("Tags for Chosen")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort for Chosen")).toHaveValue("latest");
    expect(within(chosen).getByRole("option", { name: "All" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ready" }));
    expect(within(ready).getByRole("option", { name: "Post" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ideas" }));
    expect(within(thoughts).queryByRole("option", { name: "Post" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tags for Ideas"), {
      target: { value: "topic:Cough" },
    });

    expect(thoughts).toHaveTextContent("Alpha");
    expect(thoughts).not.toHaveTextContent("Beta");
    expect(thoughts).toHaveTextContent("1");
    expect(making).toHaveTextContent("Gamma");
  });

  it("sorts a column by latest and by title, and starts again on Latest", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Apple",
        stage: "thoughts",
        updatedAt: "2026-10-11T00:00:00.000Z",
      }),
      card({
        id: "2",
        title: "Zebra",
        stage: "thoughts",
        updatedAt: "2026-10-12T00:00:00.000Z",
      }),
    ]);

    const { unmount } = render(<SocialClient token="token" />);
    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    expect(thoughts.textContent?.indexOf("Zebra")).toBeLessThan(
      thoughts.textContent?.indexOf("Apple") ?? 0
    );

    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ideas" }));
    fireEvent.change(screen.getByLabelText("Sort for Ideas"), {
      target: { value: "az" },
    });
    expect(thoughts.textContent?.indexOf("Apple")).toBeLessThan(
      thoughts.textContent?.indexOf("Zebra") ?? 0
    );

    unmount();
    render(<SocialClient token="token" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Column menu for Ideas" })
    );
    expect(screen.getByLabelText("Sort for Ideas")).toHaveValue("latest");
  });

  it("opens a column in folded topic groups", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Plain", stage: "thoughts" }),
      card({ id: "2", title: "Alpha", stage: "thoughts", topic: "Cough" }),
      card({ id: "3", title: "Beta", stage: "thoughts", topic: "Fees" }),
    ]);

    render(<SocialClient token="token" />);
    expect(await screen.findByRole("button", { name: "Expand Chosen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Ideas" }));

    const wide = await screen.findByRole("dialog", { name: "Ideas" });
    expect(within(wide).getByRole("button", { name: "No topic" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(within(wide).getByRole("button", { name: "Cough" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(within(wide).getByRole("button", { name: "Fees" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(within(wide).queryByRole("button", { name: "Plain" })).not.toBeInTheDocument();
    expect(within(wide).queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();

    fireEvent.click(within(wide).getByRole("button", { name: "No topic" }));
    expect(within(wide).getByRole("button", { name: "Plain" })).toBeInTheDocument();
    expect(within(wide).queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();

    fireEvent.click(within(wide).getByRole("button", { name: "Plain" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close column" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready" })).toBeInTheDocument();
  });

  it("keeps the column tag in the wide view", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Zebra",
        stage: "thoughts",
        topic: "Fees",
        updatedAt: "2026-10-12T00:00:00.000Z",
      }),
      card({
        id: "2",
        title: "Apple",
        stage: "thoughts",
        topic: "Fees",
        updatedAt: "2026-10-11T00:00:00.000Z",
      }),
      card({ id: "3", title: "Other", stage: "thoughts", topic: "Cough" }),
    ]);

    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Ideas" });
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ideas" }));
    fireEvent.change(screen.getByLabelText("Tags for Ideas"), {
      target: { value: "topic:Fees" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand Ideas" }));

    const wide = await screen.findByRole("dialog", { name: "Ideas" });
    expect(within(wide).getByLabelText("Tags for Ideas")).toHaveValue("topic:Fees");
    expect(within(wide).queryByRole("button", { name: "Cough" })).not.toBeInTheDocument();
    fireEvent.click(within(wide).getByRole("button", { name: "Fees" }));
    const text = wide.textContent ?? "";
    expect(text.indexOf("Zebra")).toBeLessThan(text.indexOf("Apple"));

    fireEvent.change(within(wide).getByLabelText("Sort for Ideas"), {
      target: { value: "az" },
    });
    const sorted = wide.textContent ?? "";
    expect(sorted.indexOf("Apple")).toBeLessThan(sorted.indexOf("Zebra"));
  });

  it("walks the content gate: words follow the format, and the file sits on Ready", async () => {
    listMock.mockResolvedValue([
      card({ id: "pick", title: "Shortlist", stage: "chosen" }),
      card({ id: "reel", title: "Cough reel", stage: "making", format: "reel" }),
      card({ id: "story", title: "Dengue story", stage: "making", format: "story", hasFile: true, fileKind: "photo" }),
      card({ id: "making", title: "In the edit", stage: "making" }),
      card({ id: "ready", title: "Fees photo", stage: "ready", hasFile: true }),
    ]);

    render(<SocialClient token="token" />);

    expect(await screen.findByRole("region", { name: "Ready" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Ready" })).getByRole("button", { name: "Add new" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New idea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("File already made")).not.toBeInTheDocument();
    const columns = screen.getByRole("region", { name: "Ideas" });
    expect(columns.parentElement).toHaveClass("grid-cols-1");
    expect(screen.getByRole("region", { name: "Chosen" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Making" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Shortlist" }));
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start making" })).toBeInTheDocument();
    expect(screen.queryByText("The format waits until Making.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Cough reel" }));
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hook")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cover line")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Collaborators")).toBeInTheDocument();
    expect(screen.getByLabelText("First comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share to the feed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your story" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off commenting" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Alt text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Script")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shot 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Dengue story" }));
    expect(screen.getByLabelText("Line")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a picture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI-generated" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off commenting" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collaborators")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("First comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Your story" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shot 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "In the edit" }));
    expect(screen.getByLabelText("Attach the file for In the edit")).toBeInTheDocument();
    expect(screen.queryByText("The file is on this card.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Fees photo" }));
    expect(screen.getByText("The file is on this card.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Attach the file for Fees photo")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByText("Nothing is timed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect(await screen.findByText("Nothing has been posted.")).toBeInTheDocument();
  });

  it("lists an unscheduled Ready card before a timed one", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        hasFile: true,
        scheduledAt: "2099-10-28T14:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
      }),
      card({
        id: "2",
        title: "Parked",
        stage: "ready",
        hasFile: true,
        scheduledAt: null,
        updatedAt: "2026-10-01T00:00:00.000Z",
      }),
      card({
        id: "3",
        title: "Late",
        stage: "ready",
        hasFile: true,
        scheduledAt: "2020-01-02T08:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      }),
    ]);

    render(<SocialClient token="token" />);
    const ready = await screen.findByRole("region", { name: "Ready" });
    const text = ready.textContent ?? "";
    expect(text.indexOf("Parked")).toBeLessThan(text.indexOf("Late"));
    expect(text.indexOf("Late")).toBeLessThan(text.indexOf("Fees"));
    expect(within(ready).getByRole("button", { name: "Parked" }).closest("li")).toHaveTextContent(
      "Not scheduled"
    );
    expect(within(ready).getByRole("button", { name: "Late" }).closest("li")).toHaveTextContent(/Due · /);
    const fees = within(ready).getByRole("button", { name: "Fees" }).closest("li");
    expect(fees).not.toHaveTextContent("Not scheduled");
    expect(fees).not.toHaveTextContent("Due");
  });

  it("treats a Ready card the doctor will post as a reminder", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        scheduledAt: "2099-10-28T14:00:00.000Z",
        words: { byHand: true, caption: "Hello", music: "Soft" },
      }),
    ]);
    updateMock.mockResolvedValue(
      card({
        id: "1",
        title: "Fees",
        stage: "posted",
        format: "post",
        hasFile: true,
        words: { byHand: true, caption: "Hello" },
      })
    );

    render(<SocialClient token="token" />);
    const ready = await screen.findByRole("region", { name: "Ready" });
    expect(within(ready).getByRole("button", { name: "Fees" }).closest("li")).toHaveTextContent(/You post · /);
    fireEvent.click(within(ready).getByRole("button", { name: "Fees" }));
    expect(screen.getByRole("button", { name: "Post for me" })).toBeDisabled();
    const copyList = screen.getByRole("region", { name: "Copy into Instagram" });
    expect(copyList).toHaveTextContent("Hello");
    expect(copyList).toHaveTextContent("Soft");
    expect(within(copyList).getAllByRole("button", { name: "Copy" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Reminder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remind me" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post now" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reminder message"), { target: { value: "Pin the clinic" } });
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        "token",
        "1",
        expect.objectContaining({ words: expect.objectContaining({ handNote: "Pin the clinic", byHand: true }) })
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "It's posted" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { manualPosted: true });
    });
  });

  it("filters Ready by schedule status and keeps posted cards off the board", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Parked", stage: "ready", hasFile: true, scheduledAt: null }),
      card({
        id: "2",
        title: "Fees",
        stage: "ready",
        hasFile: true,
        scheduledAt: "2099-10-28T14:00:00.000Z",
      }),
      card({
        id: "3",
        title: "Late",
        stage: "ready",
        hasFile: true,
        scheduledAt: "2020-01-02T08:00:00.000Z",
      }),
      card({
        id: "4",
        title: "Live",
        stage: "posted",
        hasFile: true,
        instagramUrl: "https://instagram.com/p/live",
      }),
    ]);

    render(<SocialClient token="token" />);
    const ready = await screen.findByRole("region", { name: "Ready" });
    expect(within(ready).getByRole("button", { name: "Parked" })).toBeInTheDocument();
    expect(within(ready).getByRole("button", { name: "Fees" })).toBeInTheDocument();
    expect(within(ready).getByRole("button", { name: "Late" })).toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Live" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ideas" }));
    expect(screen.queryByLabelText("Status for Ideas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ready" }));
    const status = screen.getByLabelText("Status for Ready");
    expect(status).toHaveValue("all");

    fireEvent.change(status, { target: { value: "due" } });
    expect(within(ready).getByRole("button", { name: "Late" })).toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Parked" })).not.toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Fees" })).not.toBeInTheDocument();

    fireEvent.change(status, { target: { value: "scheduled" } });
    expect(within(ready).getByRole("button", { name: "Fees" })).toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Late" })).not.toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Parked" })).not.toBeInTheDocument();

    fireEvent.change(status, { target: { value: "open" } });
    expect(within(ready).getByRole("button", { name: "Parked" })).toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Fees" })).not.toBeInTheDocument();
    expect(within(ready).queryByRole("button", { name: "Late" })).not.toBeInTheDocument();
  });

  it("keeps a Ready card on the week and the time, and can clear the time", async () => {
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "ready", hasFile: true, scheduledAt: null })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        hasFile: true,
        scheduledAt: "2026-10-13T13:39:00.000Z",
        pagePath: "/d/fees",
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.queryByLabelText("Note")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hour")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByText("OR")).not.toBeInTheDocument();
    expect(screen.getByText(/Skip the date and time above. This card goes out at this minute/)).toBeInTheDocument();
    expect(screen.getByText(/Halo Aid posts this on /)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Card Fees" })).not.toHaveTextContent("Not scheduled");
    expect(screen.getByRole("button", { name: "Post now" })).toBeInTheDocument();
    expect(screen.queryByText("Already posted?")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Instagram link")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { scheduledAt: null });
    });
  });

  it("posts a Ready card at this minute", async () => {
    let answer: (value: ReturnType<typeof card>) => void = () => undefined;
    updateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        words: { crop: "portrait" },
        publishError: "not_connected",
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.getByText("Post · 4:5")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a picture")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove picture 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Format" })).not.toBeInTheDocument();
    expect(screen.getByText("Instagram is not connected. Connect it, then try again.")).toBeInTheDocument();

    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        words: { crop: "portrait" },
        publishError: null,
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Posting…" })).toBeDisabled();
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { words: { crop: "portrait" }, postNow: true });
    });
    answer(card({ id: "1", title: "Fees", stage: "ready", format: "post", hasFile: true, words: { crop: "portrait" } }));
    expect(await screen.findByRole("button", { name: "Posting…" })).toBeDisabled();
    expect(screen.getByText("Sending to Instagram. A video can take a few minutes.")).toBeInTheDocument();
    expect(screen.queryByText("Instagram is not connected. Connect it, then try again.")).not.toBeInTheDocument();

    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "posted",
        format: "post",
        hasFile: false,
        instagramUrl: "https://www.instagram.com/p/DummyPost01/",
      }),
    ]);
    expect(await screen.findByText("Posted on Instagram", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on Instagram" })).toHaveAttribute(
      "href",
      "https://www.instagram.com/p/DummyPost01/"
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Card Fees" })).not.toBeInTheDocument();
    });
  });

  it("shows why a send did not go out and offers to try again", async () => {
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "ready", format: "post", hasFile: true })
    );
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "ready", format: "post", hasFile: true }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "ready", format: "post", hasFile: true, publishError: "meta_rejected" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Post now" }));

    expect(
      await screen.findByText("Instagram did not take it. Halo Aid tries again in 15 minutes.", undefined, {
        timeout: 4000,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("lists timed cards under their days and opens the same card", async () => {
    const sunday = new Date();
    sunday.setHours(12, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const firstDate = new Date(sunday);
    firstDate.setDate(sunday.getDate() + 2);
    firstDate.setHours(8, 0, 0, 0);
    const secondDate = new Date(sunday);
    secondDate.setDate(sunday.getDate() + 4);
    secondDate.setHours(8, 0, 0, 0);
    const first = firstDate.toISOString();
    const second = secondDate.toISOString();
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "ready", hasFile: true, scheduledAt: null })
    );
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
        scheduledAt: first,
      }),
      card({
        id: "2",
        title: "Cough",
        stage: "ready",
        format: "reel",
        hasFile: true,
        scheduledAt: second,
        publishError: "meta_rejected",
      }),
      card({ id: "3", title: "Parked", stage: "ready", hasFile: true, scheduledAt: null }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));

    const firstDay = await screen.findByRole("region", { name: dayLabel(first) });
    const secondDay = screen.getByRole("region", { name: dayLabel(second) });
    expect(firstDay).toHaveTextContent("Fees");
    expect(firstDay).toHaveTextContent("Post");
    expect(firstDay).toHaveTextContent(timeLabel(first));
    expect(secondDay).toHaveTextContent("Cough");
    expect(secondDay).toHaveTextContent("Reel");
    expect(secondDay).toHaveTextContent("Could not post.");
    expect(screen.queryByText("Parked")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Fees/ }));
    expect(await screen.findByRole("form", { name: "Card Fees" })).toBeInTheDocument();

    listMock.mockResolvedValue([
      card({
        id: "2",
        title: "Cough",
        stage: "ready",
        format: "reel",
        hasFile: true,
        scheduledAt: second,
      }),
      card({ id: "1", title: "Fees", stage: "ready", hasFile: true, scheduledAt: null }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { scheduledAt: null });
    });

    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");
    expect(screen.getByRole("region", { name: dayLabel(first) })).not.toHaveTextContent("Fees");
    expect(screen.queryByText("Fees")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");
    expect(screen.queryByRole("button", { name: "Previous week" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gallery" }));
    expect(screen.getByRole("button", { name: /Cough/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.queryByText("Cough")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");

    const jumped = new Date(second);
    const jumpedValue = `${jumped.getFullYear()}-${String(jumped.getMonth() + 1).padStart(2, "0")}-${String(jumped.getDate()).padStart(2, "0")}`;
    fireEvent.change(screen.getByLabelText("Jump to a date"), { target: { value: "2020-01-06" } });
    expect(screen.queryByText("Cough")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Jump to a date"), { target: { value: jumpedValue } });
    expect(screen.getByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");

    fireEvent.click(screen.getByRole("button", { name: "Month", exact: true }));
    expect(screen.getByLabelText("Jump to a month")).toBeInTheDocument();
    expect(screen.queryByLabelText("Jump to a date")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.queryByText("Cough")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");

    fireEvent.click(screen.getByRole("button", { name: "Day", exact: true }));
    expect(screen.getByLabelText("Jump to a date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous week" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Week", exact: true }));
    expect(screen.getByRole("region", { name: dayLabel(second) })).toHaveTextContent("Cough");
  });

  it("leaves the first comment empty when the card has a page link", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        pagePath: "/d/fees?c=23456789AB",
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.getByLabelText("First comment")).toHaveValue("");
  });

  it("hides the first comment while commenting is off and keeps the words", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "making",
        format: "post",
        words: { firstComment: "Book here", commentsOff: true },
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    const comments = screen.getByRole("button", { name: "Turn off commenting" });
    expect(comments).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("First comment")).not.toBeInTheDocument();
    expect(screen.queryByText("Book here")).not.toBeInTheDocument();

    fireEvent.click(comments);
    expect(screen.getByLabelText("First comment")).toHaveValue("Book here");
  });

  it("schedules from the month and does not ask for an Instagram link", async () => {
    const today = new Date();
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        hasFile: true,
      }),
    ]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    const todayButton = screen.getByRole("button", { name: `Choose ${dayName} ${today.getDate()}` });
    expect(todayButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Instagram link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is posted" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.queryByRole("button", { name: `Choose ${dayName} ${today.getDate()}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("button", { name: `Choose ${dayName} ${today.getDate()}` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("button", { name: `Choose ${dayName} ${today.getDate()}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("lists posted cards newest first and shows a booking only after the first", async () => {
    const posted = [
      card({
        id: "old",
        title: "Older reel",
        stage: "posted",
        format: "reel",
        topic: null,
        scheduledAt: null,
        updatedAt: "2026-10-12T08:00:00.000Z",
        instagramUrl: "https://www.instagram.com/reel/DummyReel01/",
        visitCount: 1,
        words: { caption: "What a first visit costs\nThe rest stays off the row" },
      }),
      card({
        id: "new",
        title: "Newer post",
        stage: "posted",
        format: "post",
        topic: "Fees",
        scheduledAt: "2026-10-18T12:00:00.000Z",
        instagramUrl: "https://www.instagram.com/p/DummyPost02/",
        visitCount: 0,
        pagePath: "/d/fees?c=23456789AB",
      }),
    ];
    listMock.mockResolvedValue(posted);
    analyticsMock.mockResolvedValue(
      analyticsReport([
        {
          id: "new",
          title: "Newer post",
          format: "post",
          topic: "Fees",
          date: "2026-10-18",
          day: "Sunday, 18 Oct",
          bookings: 0,
          enquiries: 0,
          instagramUrl: "https://www.instagram.com/p/DummyPost02/",
          thumbUrl: null,
          caption: "",
        },
        {
          id: "old",
          title: "Older reel",
          format: "reel",
          topic: null,
          date: "2026-10-12",
          day: "Monday, 12 Oct",
          bookings: 1,
          enquiries: 0,
          instagramUrl: "https://www.instagram.com/reel/DummyReel01/",
          thumbUrl: null,
          caption: "What a first visit costs",
        },
      ])
    );

    render(<SocialClient token="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));

    const titles = await screen.findAllByRole("heading", { level: 3 });
    expect(titles.map((heading) => heading.textContent)).toEqual(["Newer post", "Older reel"]);
    const firstDay = screen.getAllByRole("heading", { level: 2 })[0]?.closest("section");
    expect(firstDay).toHaveTextContent("Newer post");
    expect(firstDay).not.toHaveTextContent("Older reel");
    expect(screen.getByText("What a first visit costs")).toBeInTheDocument();
    expect(screen.queryByText("The rest stays off the row")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 booking").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 bookings")).not.toBeInTheDocument();
    expect(screen.queryByText("No topic")).not.toBeInTheDocument();
    expect(screen.queryByText(/Page link/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open on Instagram" })).toHaveLength(2);
    expect(screen.getByText("Enquiries")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
  });

  it("copies a posted card into Ideas", async () => {
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "posted",
        format: "post",
        topic: "Cough",
        words: { caption: "Hello" },
        instagramUrl: "https://www.instagram.com/p/DummyPost01/",
        visitCount: 2,
        pagePath: "/d/fees?c=23456789AB",
      }),
    ]);
    analyticsMock.mockResolvedValue(
      analyticsReport([
        {
          id: "1",
          title: "Fees",
          format: "post",
          topic: "Cough",
          date: "2026-10-18",
          day: "Sunday, 18 Oct",
          bookings: 2,
          enquiries: 0,
          instagramUrl: "https://www.instagram.com/p/DummyPost01/",
          thumbUrl: null,
          caption: "Hello",
        },
      ])
    );
    reuseMock.mockResolvedValue(
      card({
        id: "2",
        title: "Fees",
        stage: "thoughts",
        format: "post",
        topic: "Cough",
        words: { caption: "Hello" },
        visitCount: 0,
      })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect((await screen.findAllByText("2 bookings")).length).toBeGreaterThan(0);

    listMock.mockResolvedValue([
      card({
        id: "2",
        title: "Fees",
        stage: "thoughts",
        format: "post",
        topic: "Cough",
        words: { caption: "Hello" },
        visitCount: 0,
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Use again" }));

    expect(await screen.findByRole("button", { name: "Fees" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ideas" })).toHaveTextContent("Fees");
    expect(reuseMock).toHaveBeenCalledWith("token", "1");
    expect(screen.queryByText("https://www.instagram.com/p/DummyPost01/")).not.toBeInTheDocument();
    expect(screen.queryByText("2 bookings")).not.toBeInTheDocument();
  });

  it("saves a sentence title into Thoughts and leaves a comparison without a button", async () => {
    analyticsMock.mockResolvedValue({
      ...analyticsReport(),
      sentence: { text: "Fees brought 2 bookings.", title: "Fees" },
    });
    createMock.mockResolvedValue(card({ id: "new", title: "Fees", stage: "thoughts" }));

    render(<SocialClient token="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect(await screen.findByText("Fees brought 2 bookings.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to Thoughts" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith("token", "Fees", "thoughts"));
  });

  it("shows a comparison sentence without a save button", async () => {
    analyticsMock.mockResolvedValue({
      ...analyticsReport(),
      sentence: { text: "Views were 20, up from 5. 3 enquiries did not become a booking.", title: null },
    });

    render(<SocialClient token="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect(await screen.findByText("Views were 20, up from 5. 3 enquiries did not become a booking.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Thoughts" })).not.toBeInTheDocument();
  });

  it("keeps the four columns and shows a leftover named-column card under Ideas", async () => {
    listColumnsMock.mockResolvedValue([
      { id: "col-thoughts", kind: "thoughts", name: "Ideas", position: 0 },
      { id: "col-sunday", kind: "custom", name: "Film on Sunday", position: 3 },
      { id: "col-ready", kind: "ready", name: "Ready", position: 4 },
    ]);
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "custom", columnId: "col-sunday" }),
    ]);

    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Ideas" });
    expect(thoughts).toHaveTextContent("Fees");
    expect(screen.getByRole("region", { name: "Chosen" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Making" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ready" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Film on Sunday" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a column" })).not.toBeInTheDocument();
  });

  it("lets a card move along the four columns and blocks Ready without a file", () => {
    expect(cardDrop({ stage: "thoughts", hasFile: false }, "chosen")).toBe("move");
    expect(cardDrop({ stage: "making", hasFile: true }, "ready")).toBe("move");
    expect(cardDrop({ stage: "thoughts", hasFile: false }, "ready")).toBe("needs-file");
    expect(cardDrop({ stage: "thoughts", hasFile: true, fileKind: "document" }, "ready")).toBe("needs-media");
    expect(cardDrop({ stage: "making", hasFile: true, fileKind: "video" }, "ready")).toBe("move");
    expect(cardDrop({ stage: "making", hasFile: true, fileKind: "photo", format: "reel" }, "ready")).toBe("move");
    expect(cardDrop({ stage: "making", hasFile: true, fileKind: "video", format: "reel" }, "ready")).toBe("move");
    expect(cardDrop({ stage: "thoughts", hasFile: true, fileKind: "photo", postable: false }, "ready")).toBe(
      "needs-format"
    );
    expect(cardDrop({ stage: "thoughts", hasFile: true, fileKind: "audio" }, "ready")).toBe("needs-media");
    expect(cardDrop({ stage: "chosen", hasFile: false }, "chosen")).toBe("stay");
    expect(cardDrop({ stage: "custom", hasFile: false }, "thoughts")).toBe("stay");
    expect(moveWithin(["t1", "t2", "t3", "t4"], "t1", "t3")).toEqual(["t2", "t3", "t1", "t4"]);
    expect(moveWithin(["t1", "t2", "t3", "t4"], "t4", "t2")).toEqual(["t1", "t4", "t2", "t3"]);
    expect(moveWithin(["t1", "t2"], "t1", "t1")).toEqual(["t1", "t2"]);
    const lanes = { thoughts: ["a", "b"], chosen: ["c", "d"] };
    expect(moveAcross(lanes, "a", "chosen", "c", false)).toEqual({
      thoughts: ["b"],
      chosen: ["a", "c", "d"],
    });
    expect(moveAcross(lanes, "a", "chosen", "c", true)).toEqual({
      thoughts: ["b"],
      chosen: ["c", "a", "d"],
    });
    expect(moveAcross(lanes, "a", "chosen", null, false)).toEqual({
      thoughts: ["b"],
      chosen: ["c", "d", "a"],
    });
    expect(moveAcross(lanes, "a", "thoughts", "b", false)).toBe(lanes);
  });

  it("places Social last, after Alerts, and does not change the clinic rows", () => {
    render(<Sidebar hideGettingStarted />);

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.textContent?.trim()
    );

    expect(labels).toEqual([
      "Today",
      "OPD",
      "Patients",
      "Insights",
      "Alerts",
      "Social",
    ]);

    const social = screen.getByRole("link", { name: "Social" });
    expect(social).toHaveAttribute("href", "/dashboard/social");
  });
});
