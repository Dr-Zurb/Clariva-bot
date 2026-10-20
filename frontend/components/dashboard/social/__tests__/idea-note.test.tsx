/**
 * The thought notebook: blocks, and moving through lines as one page.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IdeaNote, joinNote, splitNote } from "../idea-composer";

function Note({
  initial = "",
  onPasteLink,
}: {
  initial?: string;
  onPasteLink?: (url: string, line: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <IdeaNote
      value={value}
      onChange={setValue}
      onPhoto={() => undefined}
      onLink={() => undefined}
      onPasteLink={onPasteLink}
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
    note.selectionStart = 3;
    note.selectionEnd = 3;
    fireEvent.keyDown(note, { key: "Enter" });

    const boxes = screen.getAllByRole("textbox");
    expect(boxes[0]).toHaveValue("abc");
    expect(boxes[1]).toHaveValue("def");

    boxes[1].selectionStart = 0;
    boxes[1].selectionEnd = 0;
    fireEvent.keyDown(boxes[1], { key: "Backspace" });
    expect(screen.getByLabelText("Note")).toHaveValue("abcdef");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("ends an empty to-do", () => {
    render(<Note initial="- [ ] " />);
    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Not done" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toHaveValue("");
  });

  it("filters the block menu", () => {
    render(<Note />);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "/" } });
    expect(screen.getByRole("menuitem", { name: "Bullet" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "/quo" } });
    expect(screen.getByRole("menuitem", { name: "Quote" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Heading" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "Enter" });
    expect(screen.queryByRole("menu", { name: "Note options" })).not.toBeInTheDocument();
  });

  it("turns a pasted link on an empty line into a link", () => {
    const pasted = vi.fn();
    render(<Note onPasteLink={pasted} />);
    fireEvent.paste(screen.getByLabelText("Note"), {
      clipboardData: { getData: () => "https://example.com/tip" },
    });
    expect(pasted).toHaveBeenCalledWith("https://example.com/tip", 0);
  });
});
