/**
 * The thought notebook: blocks, and moving through lines as one page.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaNote, ScrapShelf, forgetLink, joinNote, linksInNote, placeFile, placeOnScreen, splitNote, swapFile, type ShelfFile } from "../idea-composer";
import { writeRange } from "../note-marks";

function lineText(node: Element): string {
  return node.textContent ?? "";
}

function setLine(node: HTMLElement, value: string): void {
  node.textContent = value;
  fireEvent.input(node);
}

function selectLine(node: HTMLElement, start: number, end = start): void {
  writeRange(node, start, end);
}

function Note({
  initial = "",
  files = [],
  onValue,
}: {
  initial?: string;
  files?: ShelfFile[];
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <IdeaNote
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      onPhoto={() => undefined}
      files={files}
    />
  );
}

describe("note blocks", () => {
  it("keeps an older dash line as a to-do and numbers the new lines in order", () => {
    expect(splitNote("- water")[0]).toMatchObject({ kind: "list", body: "water", done: false });
    expect(joinNote(splitNote("- water"))).toBe("- [ ] water");
    expect(joinNote(splitNote("* water\n9. second\n1. third\n> heard"))).toBe(
      "* water\n1. second\n2. third\n> heard"
    );
  });

  it("splits a line at the cursor and joins it back", () => {
    render(<Note initial="abcdef" />);
    const note = screen.getByLabelText("Note");
    selectLine(note, 3);
    fireEvent.keyDown(note, { key: "Enter" });

    const boxes = screen.getAllByRole("textbox");
    expect(lineText(boxes[0])).toBe("abc");
    expect(lineText(boxes[1])).toBe("def");

    selectLine(boxes[1], 0);
    fireEvent.keyDown(boxes[1], { key: "Backspace" });
    expect(lineText(screen.getByLabelText("Note"))).toBe("abcdef");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("ends an empty to-do", () => {
    render(<Note initial="- [ ] " />);
    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Not done" })).not.toBeInTheDocument();
    expect(lineText(screen.getByLabelText("Note"))).toBe("");
  });

  it("shows the slash hint on every empty block", () => {
    render(<Note initial={"hello\n\n# "} />);
    const hint = "Type / for headings, lists, etc.";
    const boxes = screen.getAllByRole("textbox");
    expect(boxes[0]).not.toHaveAttribute("data-placeholder");
    expect(boxes[1]).toHaveAttribute("data-placeholder", hint);
    expect(boxes[2]).toHaveAttribute("data-placeholder", hint);
  });

  it("filters the block menu", () => {
    render(<Note />);
    setLine(screen.getByLabelText("Note"), "/");
    expect(screen.getByRole("menuitem", { name: "Bullet" })).toBeInTheDocument();
    setLine(screen.getByLabelText("Note"), "/quo");
    expect(screen.getByRole("menuitem", { name: "Quote" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Heading 1" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "Enter" });
    expect(screen.queryByRole("menu", { name: "Note options" })).not.toBeInTheDocument();
  });

  it("keeps the words when a slash matches no block", () => {
    render(<Note />);
    setLine(screen.getByLabelText("Note"), "/");
    expect(screen.getByRole("menu", { name: "Note options" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu", { name: "Note options" })).not.toBeInTheDocument();
    setLine(screen.getByLabelText("Note"), "/a;dsljkhfasdf");
    expect(screen.queryByRole("menu", { name: "Note options" })).not.toBeInTheDocument();
    expect(lineText(screen.getByLabelText("Note"))).toBe("/a;dsljkhfasdf");
  });

  it("selects every block after the line is already selected", () => {
    render(<Note initial={"one\ntwo\nthree"} />);
    const boxes = screen.getAllByRole("textbox");
    selectLine(boxes[1], 1);
    fireEvent.keyDown(boxes[1], { key: "a", code: "KeyA", metaKey: true });
    expect(document.querySelector("[data-picked='true']")).toBeNull();

    selectLine(boxes[1], 0, lineText(boxes[1]).length);
    fireEvent.keyDown(boxes[1], { key: "a", code: "KeyA", metaKey: true });
    expect(document.querySelectorAll("[data-picked='true']")).toHaveLength(3);
  });

  it("selects every block from an empty line", () => {
    render(<Note initial={"one\n\nthree"} />);
    const boxes = screen.getAllByRole("textbox");
    fireEvent.keyDown(boxes[1], { key: "a", code: "KeyA", metaKey: true });
    expect(document.querySelectorAll("[data-picked='true']")).toHaveLength(3);
  });

  it("selects the blocks a drag crosses", () => {
    render(<Note initial={"one\ntwo\nthree"} />);
    const rows = screen.getAllByRole("textbox").map((box) => box.closest("[data-note-line]") as HTMLElement);
    fireEvent.pointerDown(rows[0], { button: 0, clientX: 8, clientY: 8, pointerType: "mouse" });
    fireEvent.pointerMove(rows[2], { buttons: 1, clientX: 8, clientY: 64, pointerType: "mouse" });
    expect(document.querySelectorAll("[data-picked='true']")).toHaveLength(3);
    fireEvent.pointerUp(window);
  });

  it("leaves a drag inside one block as text", () => {
    render(<Note initial={"one\ntwo"} />);
    const rows = screen.getAllByRole("textbox").map((box) => box.closest("[data-note-line]") as HTMLElement);
    fireEvent.pointerDown(rows[0], { button: 0, clientX: 8, clientY: 8, pointerType: "mouse" });
    fireEvent.pointerMove(rows[0], { buttons: 1, clientX: 40, clientY: 10, pointerType: "mouse" });
    expect(document.querySelector("[data-picked='true']")).toBeNull();
    fireEvent.pointerUp(window);
  });

  it("deletes the selected blocks", () => {
    render(<Note initial={"one\ntwo\nthree"} />);
    const first = screen.getAllByRole("textbox")[0];
    selectLine(first, 0, lineText(first).length);
    fireEvent.keyDown(first, { key: "a", code: "KeyA", metaKey: true });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(lineText(screen.getByLabelText("Note"))).toBe("");
  });

  it("replaces the selected blocks with what you type", () => {
    render(<Note initial={"one\ntwo\nthree"} />);
    const first = screen.getAllByRole("textbox")[0];
    selectLine(first, 0, lineText(first).length);
    fireEvent.keyDown(first, { key: "a", code: "KeyA", metaKey: true });
    fireEvent.keyDown(window, { key: "z" });
    expect(lineText(screen.getByLabelText("Note"))).toBe("z");
  });

  it("turns a line into a heading and keeps the words", () => {
    const seen: string[] = [];
    render(<Note initial="Fees" onValue={(value) => seen.push(value)} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 2" }));
    const note = screen.getByLabelText("Note");
    expect(lineText(note)).toBe("Fees");
    expect(note).toHaveClass("text-lg");
    expect(screen.getByRole("button", { name: "Turn into" })).toHaveAttribute("data-turn", "heading");
    expect(seen.at(-1)).toBe("# Fees");
  });

  it("sizes heading 1 and heading 3, and keeps an old heading at heading 2", () => {
    const seen: string[] = [];
    render(<Note initial="# Fees" onValue={(value) => seen.push(value)} />);
    const note = screen.getByLabelText("Note");
    expect(note).toHaveClass("text-lg");
    expect(note).not.toHaveClass("text-2xl");
    expect(joinNote(splitNote("# Fees\n#1 Big\n#3 Small"))).toBe("# Fees\n#1 Big\n#3 Small");
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 1" }));
    expect(screen.getByLabelText("Note")).toHaveClass("text-2xl", "font-medium");
    expect(seen.at(-1)).toBe("#1 Fees");
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 3" }));
    expect(screen.getByLabelText("Note")).toHaveClass("text-base", "font-medium");
    expect(screen.getByLabelText("Note")).not.toHaveClass("text-lg");
    expect(seen.at(-1)).toBe("#3 Fees");
  });

  it("selects a divider and deletes it from the menu", () => {
    render(<Note initial={"hello\n!hr"} />);
    fireEvent.pointerDown(screen.getByLabelText("Divider"), { button: 0, pointerType: "mouse" });
    expect(screen.getByLabelText("Divider").closest("[data-note-line]")).toHaveAttribute("data-picked", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.queryByLabelText("Divider")).not.toBeInTheDocument();
    expect(lineText(screen.getByLabelText("Note"))).toBe("hello");
  });

  it("turns a divider into text", () => {
    render(<Note initial="!hr" />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Text" }));
    expect(screen.queryByLabelText("Divider")).not.toBeInTheDocument();
    expect(lineText(screen.getByLabelText("Note"))).toBe("");
  });

  it("adds a line when the space under a divider is clicked", () => {
    render(<Note initial="!hr" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a line" }));
    expect(lineText(screen.getByRole("textbox"))).toBe("");
  });

  it("adds a line when the space under the note is clicked", () => {
    render(<Note initial="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Add a line" }));
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(2);
    expect(lineText(boxes[1])).toBe("");
  });

  it("closes turn into when the note is clicked", () => {
    render(<Note initial="Fees" />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    expect(screen.getByRole("menu", { name: "Turn into" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText("Note"));
    expect(screen.queryByRole("menu", { name: "Turn into" })).not.toBeInTheDocument();
  });

  it("turns every selected line and keeps each line", () => {
    render(<Note initial={"one\ntwo"} />);
    const first = screen.getAllByRole("textbox")[0];
    selectLine(first, 0, lineText(first).length);
    fireEvent.keyDown(first, { key: "a", code: "KeyA", metaKey: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Bullet" }));
    const boxes = screen.getAllByRole("textbox");
    expect(lineText(boxes[0])).toBe("one");
    expect(lineText(boxes[1])).toBe("two");
    expect(document.querySelectorAll("[data-note-line] .rounded-full")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Turn into" }).map((button) => button.getAttribute("data-turn"))).toEqual([
      "bullet",
      "bullet",
    ]);
  });

  it("shows a link in the line in blue and removes it from the menu", () => {
    render(<Note initial="see https://example.com/tip" />);
    const link = screen.getByRole("button", { name: "https://example.com/tip" });
    expect(link.className).toContain("text-primary");
    fireEvent.click(link);
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "https://example.com/tip" })).not.toBeInTheDocument();
    expect(lineText(screen.getByLabelText("Note"))).toBe("see");
  });

  it("lists addresses from the note without a paste box", () => {
    const remove = vi.fn();
    render(
      <ScrapShelf
        items={[]}
        links={linksInNote("Read https://example.com/tip")}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onPut={() => undefined}
        onRemoveLink={remove}
      />
    );
    expect(screen.queryByLabelText("Paste link")).not.toBeInTheDocument();
    expect(linksInNote("Read https://example.com/tip").map((item) => item.url)).toEqual(["https://example.com/tip"]);
    expect(forgetLink("Read https://example.com/tip", { id: "1", url: "https://example.com/tip" })).toBe("Read");
    fireEvent.click(screen.getByRole("button", { name: "example.com/tip" }));
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Place in the note" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("keeps a file name on the line and shows a photo across the note", () => {
    const named = placeFile("", "abc", 0, "fees.jpg");
    expect(splitNote(named)[0]).toMatchObject({ kind: "file", body: "abc", name: "fees.jpg" });
    expect(joinNote(splitNote(named))).toBe(named);
    expect(swapFile(named, "abc", "saved")).toContain("!file:saved");
    expect(splitNote(swapFile(named, "abc", "saved"))[0]).toMatchObject({ body: "saved", name: "fees.jpg" });

    const photo: ShelfFile = { id: "abc", name: "fees.jpg", preview: "https://files.example/fees.jpg" };
    const { unmount } = render(<Note initial={named} files={[photo]} />);
    expect(screen.getByRole("button", { name: "fees.jpg" })).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveClass("object-contain");
    unmount();

    render(
      <Note
        initial={placeFile("", "doc", 0, "hours.pdf")}
        files={[{ id: "doc", name: "hours.pdf", preview: "https://files.example/hours.pdf", page: true, face: "page", openAs: "pdf" }]}
      />
    );
    expect(screen.getByRole("button", { name: "hours.pdf" })).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("resizes a column from the divider", () => {
    expect(joinNote(splitNote("!cols 35\nLeft\n!|\nRight\n!/"))).toBe("!cols 35\nLeft\n!|\nRight\n!/");
    render(<Note initial={"!cols\nLeft\n!|\nRight\n!/"} />);
    const bar = () => screen.getByRole("separator", { name: "Columns" });
    expect(bar()).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(bar(), { key: "ArrowRight" });
    expect(bar()).toHaveAttribute("aria-valuenow", "55");
    fireEvent.keyDown(bar(), { key: "ArrowLeft" });
    expect(bar()).toHaveAttribute("aria-valuenow", "50");
  });

  it("merges or deletes columns from the divider", () => {
    const seen = vi.fn();
    const { unmount } = render(<Note initial={"!cols\nLeft\n!|\nRight\n!/"} onValue={seen} />);
    const bar = () => screen.getByRole("separator", { name: "Columns" });
    fireEvent.keyDown(bar(), { key: "Enter" });
    expect(screen.getByRole("menu", { name: "Columns" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Merge into one" }));
    expect(seen).toHaveBeenLastCalledWith("Left\nRight");
    expect(screen.queryByRole("separator", { name: "Columns" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    unmount();

    render(<Note initial={"Intro\n!cols\nLeft\n!|\nRight\n!/"} onValue={seen} />);
    fireEvent.keyDown(bar(), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete columns" }));
    expect(seen).toHaveBeenLastCalledWith("Intro");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("moves a block into the column beside it", () => {
    const seen = vi.fn();
    const file = placeFile("", "pic", 0, "bike.jpg");
    render(
      <Note
        initial={`!cols\nLeft\n!|\nwdf\n!/\n${file}`}
        onValue={seen}
        files={[{ id: "pic", name: "bike.jpg", preview: "https://files.example/bike.jpg" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "File options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to right column" }));
    expect(seen).toHaveBeenLastCalledWith(`!cols\nLeft\n!|\nwdf\n${file}\n!/`);
    expect(document.querySelector("img")?.closest("[data-note-line]")).toHaveAttribute("data-picked", "true");
  });

  it("makes a column beside a block when none is there", async () => {
    const seen = vi.fn();
    render(<Note initial="Hello" onValue={seen} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to right column" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\n\n!|\nHello\n!/");
    await waitFor(() => expect(screen.getAllByRole("textbox")[0]).toHaveFocus());
  });

  it("starts a new pair when a blank line separates the block from columns", () => {
    const seen = vi.fn();
    render(<Note initial={"!cols\nLeft\n!|\nRight\n!/\n\nHello"} onValue={seen} />);
    const turns = screen.getAllByRole("button", { name: "Turn into" });
    fireEvent.click(turns[turns.length - 1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to left column" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\nLeft\n!|\nRight\n!/\n\n!cols\nHello\n!|\n\n!/");
  });

  it("shifts a block to the other column and can move it back out", () => {
    const seen = vi.fn();
    const { unmount } = render(<Note initial={"!cols\nStay\n!|\nwdf\n!/"} onValue={seen} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[0]);
    expect(screen.queryByRole("menuitem", { name: "Move to left column" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Move out of columns" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to right column" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\n\n!|\nwdf\nStay\n!/");
    unmount();

    render(<Note initial={"!cols\nStay\n!|\nwdf\n!/"} onValue={seen} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move out of columns" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\n\n!|\nwdf\n!/\nStay");
  });

  it("moves a run of blocks together", () => {
    const seen = vi.fn();
    render(<Note initial={"!cols\nOne\nTwo\n!|\nRight\n!/"} onValue={seen} />);
    const rows = screen.getAllByRole("textbox").map((box) => box.closest("[data-note-line]") as HTMLElement);
    fireEvent.pointerDown(rows[0], { button: 0, clientX: 8, clientY: 8, pointerType: "mouse" });
    fireEvent.pointerMove(rows[1], { buttons: 1, clientX: 8, clientY: 40, pointerType: "mouse" });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to right column" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\n\n!|\nRight\nOne\nTwo\n!/");
  });

  it("hides column moves when the selection crosses the divider", () => {
    render(<Note initial={"!cols\nLeft\n!|\nRight\n!/"} />);
    const first = screen.getAllByRole("textbox")[0];
    selectLine(first, 0, lineText(first).length);
    fireEvent.keyDown(first, { key: "a", code: "KeyA", metaKey: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Turn into" })[0]);
    expect(screen.queryByRole("menuitem", { name: "Move to left column" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move to right column" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("swaps the two sides from the divider", () => {
    const seen = vi.fn();
    render(<Note initial={"!cols\nLeft\n!|\nRight\n!/"} onValue={seen} />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Columns" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Swap sides" }));
    expect(seen).toHaveBeenLastCalledWith("!cols\nRight\n!|\nLeft\n!/");
  });

  it("drops a block at the end of a column", () => {
    const seen = vi.fn();
    render(<Note initial={"Hello\n!cols\nLeft\n!|\nRight\n!/"} onValue={seen} />);
    fireEvent.drop(screen.getByRole("button", { name: "Add a line to the right column" }), {
      dataTransfer: {
        types: ["application/x-clariva-line"],
        getData: (type: string) => (type === "application/x-clariva-line" ? "0" : ""),
      },
    });
    expect(seen).toHaveBeenLastCalledWith("!cols\nLeft\n!|\nRight\nHello\n!/");
  });

  it("dissolves columns when the last empty side is backspaced", () => {
    const seen = vi.fn();
    render(<Note initial={"!cols\nLeft\n!|\n\n!/"} onValue={seen} />);
    const right = screen.getAllByRole("textbox")[1];
    selectLine(right, 0);
    fireEvent.keyDown(right, { key: "Backspace" });
    expect(seen).toHaveBeenLastCalledWith("Left");
    expect(screen.queryByRole("separator", { name: "Columns" })).not.toBeInTheDocument();
  });

  it("adds a line under a picture inside a column", () => {
    const seen = vi.fn();
    const start = `!cols\nLeft\n!|\n${placeFile("", "pic", 0, "bike.jpg")}\n!/`;
    render(<Note initial={start} onValue={seen} files={[{ id: "pic", name: "bike.jpg", preview: "https://files.example/bike.jpg" }]} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Add a line to the right column" }));
    expect(seen).toHaveBeenLastCalledWith(`!cols\nLeft\n!|\n!file:pic ${encodeURIComponent("bike.jpg")}\n\n!/`);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Add a line to the right column" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Add a line to the left column" }));
    expect(seen).toHaveBeenLastCalledWith(`!cols\nLeft\n\n!|\n!file:pic ${encodeURIComponent("bike.jpg")}\n\n!/`);
  });

  it("can show a picture as its name", () => {
    const collapsed = `!file:abc ${encodeURIComponent("fees.jpg")} =name`;
    expect(splitNote(collapsed)[0]).toMatchObject({ body: "abc", name: "fees.jpg", embed: false });
    expect(joinNote(splitNote(collapsed))).toBe(collapsed);

    render(
      <Note
        initial={placeFile("", "abc", 0, "fees.jpg")}
        files={[{ id: "abc", name: "fees.jpg", preview: "https://files.example/fees.jpg" }]}
      />
    );
    expect(screen.queryByText("Photo")).not.toBeInTheDocument();
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeInTheDocument();
    const options = () => screen.getByRole("button", { name: "File options" });
    expect(options()).toHaveAttribute("data-turn", "file");
    fireEvent.click(options());
    expect(screen.getByRole("menuitem", { name: "Show the picture" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show the file name" }));
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "fees.jpg" })).toBeInTheDocument();
    fireEvent.click(options());
    fireEvent.click(screen.getByRole("menuitem", { name: "Show the picture" }));
    expect(document.querySelector("img")).toHaveClass("object-contain");
    expect(screen.getByRole("button", { name: "Remove from the note" })).toBeInTheDocument();
  });

  it("plays a video where it sits", () => {
    render(
      <Note
        initial={placeFile("", "clip", 0, "walkthrough.mp4")}
        files={[{ id: "clip", name: "walkthrough.mp4", preview: "https://files.example/walkthrough.mp4", video: true }]}
      />
    );
    const player = document.querySelector("video");
    expect(player).toHaveAttribute("controls");
    expect(player).not.toHaveAttribute("muted");
    expect(player).toHaveAttribute("aria-label", "walkthrough.mp4");
    expect(screen.getByRole("slider", { name: "Resize video" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sizes a picture from its edge", () => {
    const sized = `!file:abc ${encodeURIComponent("fees.jpg")} =w60`;
    expect(splitNote(sized)[0]).toMatchObject({ body: "abc", name: "fees.jpg", width: 60 });
    expect(joinNote(splitNote(sized))).toBe(sized);
    expect(splitNote(`!file:abc ${encodeURIComponent("fees.jpg")} =name =w500`)[0]).toMatchObject({ embed: false, width: 100 });

    render(
      <Note initial={sized} files={[{ id: "abc", name: "fees.jpg", preview: "https://files.example/fees.jpg" }]} />
    );
    const grip = () => screen.getByRole("slider", { name: "Resize picture" });
    expect(grip()).toHaveAttribute("aria-valuenow", "60");
    expect(document.querySelector("[data-picture-frame]")).toHaveStyle({ width: "60%" });
    fireEvent.keyDown(grip(), { key: "ArrowLeft" });
    expect(grip()).toHaveAttribute("aria-valuenow", "55");
    expect(document.querySelector("[data-picture-frame]")).toHaveStyle({ width: "55%" });
    fireEvent.keyDown(grip(), { key: "ArrowRight" });
    fireEvent.keyDown(grip(), { key: "ArrowRight" });
    expect(grip()).toHaveAttribute("aria-valuenow", "65");
  });

  it("shows how much of the upload is done", () => {
    const { unmount } = render(
      <Note
        initial={placeFile("", "soon", 0, "bike.jpg")}
        files={[{ id: "soon", name: "bike.jpg", preview: "blob:bike", pending: true, progress: 40 }]}
      />
    );
    expect(screen.getByRole("progressbar", { name: "Uploading 40 percent" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bike.jpg" })).toBeInTheDocument();
    unmount();

    render(
      <ScrapShelf
        items={[{ id: "soon", name: "bike.jpg", preview: "blob:bike", pending: true, progress: 40 }]}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onPut={() => undefined}
      />
    );
    expect(screen.getByRole("progressbar", { name: "Uploading 40 percent" })).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("bolds the selected words and can color them", () => {
    const seen = vi.fn();
    render(<Note initial="Fees today" onValue={seen} />);
    const note = screen.getByLabelText("Note");
    selectLine(note, 0, 4);
    fireEvent.mouseUp(note);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(seen).toHaveBeenLastCalledWith("«b»Fees«/» today");
    expect(lineText(note)).toBe("Fees today");
    expect(note.querySelector("[data-mark='b']")).toHaveClass("font-semibold");
    expect(screen.queryByRole("button", { name: "Text color" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Color" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Red text" }));
    expect(seen).toHaveBeenLastCalledWith("«b,t:red»Fees«/»«t:red» today«/»");
    expect(note.querySelector("[data-mark='b,t:red']")).toHaveClass("font-semibold", "text-red-700");
    expect(note.querySelector("[data-mark='t:red']")).toHaveClass("text-red-700");
  });

  it("colors a whole block from Turn into, including the next letters", () => {
    const seen = vi.fn();
    render(<Note initial="" onValue={seen} />);
    const note = screen.getByLabelText("Note");
    fireEvent.focus(note);
    expect(screen.queryByRole("toolbar", { name: "Format" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Color" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Red text" }));
    note.textContent = "a";
    fireEvent.input(note);
    expect(seen).toHaveBeenLastCalledWith("«t:red»a«/»");

    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Highlight" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Yellow highlight" }));
    expect(seen).toHaveBeenLastCalledWith("«t:red,h:yellow»a«/»");
    note.textContent = "ab";
    fireEvent.input(note);
    expect(seen).toHaveBeenLastCalledWith("«t:red,h:yellow»ab«/»");

    selectLine(note, 0);
    fireEvent.mouseUp(note);
    note.textContent = "zab";
    fireEvent.input(note);
    expect(seen).toHaveBeenLastCalledWith("«t:red,h:yellow»zab«/»");
    expect(lineText(note)).toBe("zab");
  });

  it("stores any color from the picker on the whole block", () => {
    const seen = vi.fn();
    render(<Note initial="Fees" onValue={seen} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    expect(screen.queryByRole("menuitem", { name: "Red text" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Color" }));
    fireEvent.change(screen.getByLabelText("Any text color"), { target: { value: "#123456" } });
    expect(seen).toHaveBeenLastCalledWith("«t:#123456»Fees«/»");
    const colored = screen.getByLabelText("Note").querySelector("span");
    expect(colored?.getAttribute("data-mark")).toBe("t:#123456");
    expect(colored?.getAttribute("style") ?? "").toMatch(/123456/i);

    fireEvent.click(screen.getByRole("button", { name: "Turn into" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Highlight" }));
    fireEvent.change(screen.getByLabelText("Any highlight color"), { target: { value: "#abcdef" } });
    expect(seen).toHaveBeenLastCalledWith("«t:#123456,h:#abcdef»Fees«/»");
    const marked = screen.getByLabelText("Note").querySelector("span");
    expect(marked?.getAttribute("data-mark")).toBe("t:#123456,h:#abcdef");
    expect(marked?.getAttribute("style") ?? "").toMatch(/abcdef/i);
  });

  it("opens a menu upward when the line is near the bottom of the screen", () => {
    const viewport = { width: 800, height: 600 };
    const menu = { width: 208, height: 420 };
    const low = placeOnScreen(
      { top: 520, left: 40, right: 56, bottom: 536, width: 16, height: 16 },
      menu,
      viewport,
      "below"
    );
    expect(low.top).toBeLessThan(520);
    expect(low.top).toBeGreaterThanOrEqual(8);
    expect(low.top + Math.min(menu.height, low.maxHeight)).toBeLessThanOrEqual(viewport.height - 8);

    const high = placeOnScreen(
      { top: 20, left: 40, right: 56, bottom: 36, width: 16, height: 16 },
      menu,
      viewport,
      "below"
    );
    expect(high.top).toBeGreaterThanOrEqual(36);

    const edge = placeOnScreen(
      { top: 100, left: 700, right: 760, bottom: 132, width: 60, height: 32 },
      { width: 176, height: 160 },
      viewport,
      "right"
    );
    expect(edge.left).toBeLessThan(700);
    expect(edge.left + 176).toBeLessThanOrEqual(viewport.width - 8);
  });
});
