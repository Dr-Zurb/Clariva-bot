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

vi.mock("../social-cards", () => ({
  listSocialCards: vi.fn(),
  getSocialCardFileUrl: vi.fn(),
  getSocialCardScrapUrl: vi.fn(),
  createSocialCard: vi.fn(),
  createReadySocialCard: vi.fn(),
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
  getSocialAnalytics: vi.fn(),
}));

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
    expect(await screen.findByRole("region", { name: "Thoughts and ideas" })).toBeInTheDocument();
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

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
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
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).toHaveTextContent("Fees");
  });

  it("adds a title into Thoughts and ideas and can move it", async () => {
    createMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "thoughts" }));
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen" }));

    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Thoughts and ideas" });

    expect(screen.queryByLabelText("New idea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("File already made")).not.toBeInTheDocument();

    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    fireEvent.click(screen.getByRole("button", { name: "Add to Thoughts and ideas" }));
    fireEvent.change(screen.getByLabelText("Title for Thoughts and ideas"), {
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

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Fees" }));

    const editor = await screen.findByRole("form", { name: "Card Fees" });
    expect(within(editor).getByLabelText("Title")).toHaveValue("Fees");
    expect(within(editor).getByRole("button", { name: "Save" })).toBeInTheDocument();
    fireEvent.click(within(editor).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteCardMock).toHaveBeenCalledWith("token", "1");
    });
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).not.toHaveTextContent("Fees");
  });

  it("selects several cards and deletes that selection once", async () => {
    deleteCardMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "thoughts" }),
      card({ id: "2", title: "Cough", stage: "thoughts" }),
    ]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));

    const bar = screen.getByRole("toolbar", { name: "Selected cards" });
    expect(bar).toHaveTextContent("1 selected");
    expect(bar).toHaveTextContent("Move to");
    expect(within(bar).getByRole("button", { name: "Select all" })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Move selected to Thoughts and ideas" })).not.toBeInTheDocument();
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

  it("leaves select mode as soon as the cards move", async () => {
    let finish: (value: SocialCard) => void = () => undefined;
    moveMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
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

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
    fireEvent.click(within(thoughts).getByRole("button", { name: "Card menu for Fees" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Chosen" }));

    expect(await screen.findByRole("toolbar", { name: "Selected cards" })).toHaveTextContent("1 selected");
    expect(thoughts).toHaveTextContent("Fees");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not move the card");
  });

  it("adds a title from Chosen and refuses a Ready card with no file", async () => {
    createMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen" }));

    render(<SocialClient token="token" />);
    await screen.findByRole("region", { name: "Chosen" });

    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "chosen" })]);
    fireEvent.click(screen.getByRole("button", { name: "Add to Chosen" }));
    fireEvent.change(screen.getByLabelText("Title for Chosen"), {
      target: { value: "Fees" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith("token", "Fees", "chosen");
    });
    expect(screen.getByRole("region", { name: "Chosen" })).toHaveTextContent("Fees");
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).toHaveTextContent("Add new");

    fireEvent.click(screen.getByRole("button", { name: "Add to Ready" }));
    fireEvent.change(screen.getByLabelText("Title for Ready"), {
      target: { value: "Photo" },
    });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(createReadyMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("File for Ready")).toBeInTheDocument();
  });

  it("keeps a file on the column where the idea was added", async () => {
    const file = new File(["photo"], "fees.jpg", { type: "image/jpeg" });
    createMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "thoughts" }));
    scrapMock.mockResolvedValue({ id: "scrap-1", fileKind: "photo", postable: true });
    listMock.mockResolvedValue([]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to Thoughts and ideas" }));
    fireEvent.change(screen.getByLabelText("Title for Thoughts and ideas"), {
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

    expect(screen.getByLabelText("Note")).toHaveValue("headache tips");
    expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start making" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { format: "post" });
    });
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(moveMock).not.toHaveBeenCalled();
  });

  it("keeps Mark ready off when the file cannot post and on when it can", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "making" }),
    ]);
    const empty = render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    const emptyGaps = screen.getByRole("list", { name: "Still missing" });
    expect(emptyGaps).toHaveTextContent("A format");
    expect(emptyGaps).toHaveTextContent("A file");
    expect(screen.getByRole("button", { name: "Mark ready" })).toBeDisabled();
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
    expect(screen.getByRole("list", { name: "Still missing" })).toHaveTextContent(
      "A file that cannot post"
    );
    expect(screen.getByRole("button", { name: "Mark ready" })).toBeDisabled();
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
    expect(screen.queryByRole("list", { name: "Still missing" })).not.toBeInTheDocument();
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
  });

  it("sets a time from the composer and the week shows it", async () => {
    const when = new Date();
    when.setDate(when.getDate() + 1);
    when.setHours(9, 0, 0, 0);
    const pad = (value: number): string => String(value).padStart(2, "0");
    const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T09:00`;
    const iso = new Date(local).toISOString();
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
    fireEvent.change(screen.getByLabelText("Post at"), { target: { value: local } });
    listMock.mockResolvedValue([timed]);
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { scheduledAt: iso });
    });
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
    const line = note.querySelector("textarea");
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
    expect(note.querySelector("textarea")).toHaveValue("headache tips");
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
      expect(screen.getByLabelText("Note")).toHaveValue("headache tips");
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

    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.getByText("2200")).toBeInTheDocument();
    expect(screen.getByLabelText("First comment")).toBeInTheDocument();
    expect(screen.getByText("Automatic")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alt text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shot 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByLabelText("Alt text")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Music"), { target: { value: "Soft" } });
    expect(screen.getByText("Notify me")).toBeInTheDocument();
  });

  it("keeps a thought to a title", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));

    expect(screen.getByText("Thought")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Topic")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "/" } });
    expect(screen.getByRole("menuitem", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Caption")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Post" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Reel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Story" })).not.toBeInTheDocument();
  });

  it("saves a topic on a thought and leaves it in Thoughts and ideas", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "thoughts" })]);
    updateMock.mockResolvedValue(
      card({ id: "1", title: "Fees", stage: "thoughts", topic: "Cough" })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Cough" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Cough" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", {
        title: "Fees",
        topic: "Cough",
        sourceUrl: null,
        words: {},
      });
    });
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).toHaveTextContent("Fees");
  });

  it("starts making from Chosen and sends the stage on its own", async () => {
    listMock.mockResolvedValue([card({ id: "1", title: "Fees", stage: "chosen" })]);
    updateMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "chosen", format: "post" }));
    moveMock.mockResolvedValue(card({ id: "1", title: "Fees", stage: "making", format: "post" }));

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start making" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateMock).not.toHaveBeenCalled();
    expect(moveMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start making" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start making" }));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", {
        title: "Fees",
        format: "post",
        topic: null,
        sourceUrl: null,
        words: {},
      });
    });
    expect(moveMock).toHaveBeenCalledWith("token", "1", "making");
    expect(updateMock.mock.calls.some((call) => call[2]?.stage)).toBe(false);
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
    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
    const making = screen.getByRole("region", { name: "Making" });
    const chosen = screen.getByRole("region", { name: "Chosen" });
    const ready = screen.getByRole("region", { name: "Ready" });

    fireEvent.click(screen.getByRole("button", { name: "Column menu for Chosen" }));
    expect(screen.getByLabelText("Tags for Chosen")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort for Chosen")).toHaveValue("latest");
    expect(within(chosen).getByRole("option", { name: "All" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Ready" }));
    expect(within(ready).getByRole("option", { name: "Post" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Thoughts and ideas" }));
    expect(within(thoughts).queryByRole("option", { name: "Post" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tags for Thoughts and ideas"), {
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
    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
    expect(thoughts.textContent?.indexOf("Zebra")).toBeLessThan(
      thoughts.textContent?.indexOf("Apple") ?? 0
    );

    fireEvent.click(screen.getByRole("button", { name: "Column menu for Thoughts and ideas" }));
    fireEvent.change(screen.getByLabelText("Sort for Thoughts and ideas"), {
      target: { value: "az" },
    });
    expect(thoughts.textContent?.indexOf("Apple")).toBeLessThan(
      thoughts.textContent?.indexOf("Zebra") ?? 0
    );

    unmount();
    render(<SocialClient token="token" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Column menu for Thoughts and ideas" })
    );
    expect(screen.getByLabelText("Sort for Thoughts and ideas")).toHaveValue("latest");
  });

  it("opens a column in folded topic groups", async () => {
    listMock.mockResolvedValue([
      card({ id: "1", title: "Plain", stage: "thoughts" }),
      card({ id: "2", title: "Alpha", stage: "thoughts", topic: "Cough" }),
      card({ id: "3", title: "Beta", stage: "thoughts", topic: "Fees" }),
    ]);

    render(<SocialClient token="token" />);
    expect(await screen.findByRole("button", { name: "Expand Chosen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Thoughts and ideas" }));

    const wide = await screen.findByRole("dialog", { name: "Thoughts and ideas" });
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
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).toBeInTheDocument();
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
    await screen.findByRole("region", { name: "Thoughts and ideas" });
    fireEvent.click(screen.getByRole("button", { name: "Column menu for Thoughts and ideas" }));
    fireEvent.change(screen.getByLabelText("Tags for Thoughts and ideas"), {
      target: { value: "topic:Fees" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand Thoughts and ideas" }));

    const wide = await screen.findByRole("dialog", { name: "Thoughts and ideas" });
    expect(within(wide).getByLabelText("Tags for Thoughts and ideas")).toHaveValue("topic:Fees");
    expect(within(wide).queryByRole("button", { name: "Cough" })).not.toBeInTheDocument();
    fireEvent.click(within(wide).getByRole("button", { name: "Fees" }));
    const text = wide.textContent ?? "";
    expect(text.indexOf("Zebra")).toBeLessThan(text.indexOf("Apple"));

    fireEvent.change(within(wide).getByLabelText("Sort for Thoughts and ideas"), {
      target: { value: "az" },
    });
    const sorted = wide.textContent ?? "";
    expect(sorted.indexOf("Apple")).toBeLessThan(sorted.indexOf("Zebra"));
  });

  it("walks the content gate: words follow the format, and the file sits on Ready", async () => {
    listMock.mockResolvedValue([
      card({ id: "pick", title: "Shortlist", stage: "chosen" }),
      card({ id: "reel", title: "Cough reel", stage: "making", format: "reel" }),
      card({ id: "story", title: "Dengue story", stage: "making", format: "story" }),
      card({ id: "making", title: "In the edit", stage: "making" }),
      card({ id: "ready", title: "Fees photo", stage: "ready", hasFile: true }),
    ]);

    render(<SocialClient token="token" />);

    expect(await screen.findByRole("button", { name: "Add to Ready" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New idea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("File already made")).not.toBeInTheDocument();
    const columns = screen.getByRole("region", { name: "Thoughts and ideas" });
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
    expect(screen.getByLabelText("Hook")).toBeInTheDocument();
    expect(screen.getByLabelText("Cover line")).toBeInTheDocument();
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.queryByLabelText("Script")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shot 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Dengue story" }));
    expect(screen.getByLabelText("Line")).toBeInTheDocument();
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

  it("tells a Ready card to post from the phone and can clear the time", async () => {
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

    expect(screen.getByText("Post this from your phone at this time.")).toBeInTheDocument();
    expect(screen.getByText("Page link /d/fees")).toBeInTheDocument();
    expect(screen.getByLabelText("Post at")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { scheduledAt: null });
    });
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

  it("shows the durable page link in the first comment", async () => {
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

    expect(screen.getByLabelText("First comment")).toHaveValue("/d/fees?c=23456789AB");
  });

  it("moves a pasted post off Schedule and onto Analytics", async () => {
    const url = "https://www.instagram.com/p/DummyPost01/";
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "ready",
        format: "post",
        topic: "Cough",
        hasFile: true,
        scheduledAt: "2026-10-13T08:00:00.000Z",
        pagePath: "/d/fees?c=23456789AB",
      }),
    ]);
    updateMock.mockResolvedValue(
      card({
        id: "1",
        title: "Fees",
        stage: "posted",
        format: "post",
        topic: "Cough",
        hasFile: false,
        scheduledAt: null,
        instagramUrl: url,
        visitCount: 0,
        pagePath: "/d/fees?c=23456789AB",
      })
    );

    render(<SocialClient token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "Fees" }));
    fireEvent.change(screen.getByLabelText("Instagram link"), {
      target: { value: url },
    });
    listMock.mockResolvedValue([
      card({
        id: "1",
        title: "Fees",
        stage: "posted",
        format: "post",
        topic: "Cough",
        hasFile: false,
        scheduledAt: null,
        instagramUrl: url,
        visitCount: 0,
        pagePath: "/d/fees?c=23456789AB",
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "This is posted" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "1", { instagramUrl: url });
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Fees" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByText("Nothing is timed.")).toBeInTheDocument();

    analyticsMock.mockResolvedValue(
      analyticsReport([
        {
          id: "1",
          title: "Fees",
          format: "post",
          topic: "Cough",
          date: "2026-10-18",
          day: "Sunday, 18 Oct",
          bookings: 0,
          enquiries: 0,
          instagramUrl: url,
          thumbUrl: null,
          caption: "",
        },
      ])
    );
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    const row = await screen.findByRole("heading", { name: "Fees" });
    const item = row.closest("li");
    expect(item).toHaveTextContent("Post");
    expect(item).toHaveTextContent("Cough");
    expect(item).not.toHaveTextContent("Page link");
    expect(item).not.toHaveTextContent(url);
    expect(item).not.toHaveTextContent("booking");
    expect(within(item as HTMLElement).getByRole("link", { name: "Open on Instagram" })).toHaveAttribute(
      "href",
      url
    );
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

  it("copies a posted card into Thoughts and ideas", async () => {
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
    expect(screen.getByRole("region", { name: "Thoughts and ideas" })).toHaveTextContent("Fees");
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

  it("keeps the four columns and shows a leftover named-column card under Thoughts and ideas", async () => {
    listColumnsMock.mockResolvedValue([
      { id: "col-thoughts", kind: "thoughts", name: "Thoughts and ideas", position: 0 },
      { id: "col-sunday", kind: "custom", name: "Film on Sunday", position: 3 },
      { id: "col-ready", kind: "ready", name: "Ready", position: 4 },
    ]);
    listMock.mockResolvedValue([
      card({ id: "1", title: "Fees", stage: "custom", columnId: "col-sunday" }),
    ]);

    render(<SocialClient token="token" />);

    const thoughts = await screen.findByRole("region", { name: "Thoughts and ideas" });
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
