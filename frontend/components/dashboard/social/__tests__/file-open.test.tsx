/**
 * Every file the shelf accepts must open in a viewer.
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as XLSX from "xlsx";
import { ScrapShelf, fileFace, fileOpen, fileOpenFromUrl, type ShelfFile } from "../idea-composer";
import { socialFileIssue, socialFileKind } from "../social-cards";

const files = new Map<string, { bytes: Uint8Array; text: string }>();

function bytesOf(data: unknown, text = ""): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data);
  return new TextEncoder().encode(text);
}

function workbook(cell: string, second?: string): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[cell]]), "One");
  if (second) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[second]]), "Two");
  return book;
}

function storeSheet(url: string, bookType: XLSX.BookType, cell: string, second?: string): void {
  const written = XLSX.write(workbook(cell, second), { type: "array", bookType });
  files.set(url, { bytes: bytesOf(written), text: cell });
}

type Kind = "photo" | "video" | "audio" | "document";
type View = "photo" | "video" | "audio" | "pdf" | "sheet" | "text" | "file";

const ALLOWED: Array<{ ext: string; type: string; kind: Kind; view: View }> = [
  { ext: "jpg", type: "image/jpeg", kind: "photo", view: "photo" },
  { ext: "jpeg", type: "image/jpeg", kind: "photo", view: "photo" },
  { ext: "png", type: "image/png", kind: "photo", view: "photo" },
  { ext: "webp", type: "image/webp", kind: "photo", view: "photo" },
  { ext: "gif", type: "image/gif", kind: "photo", view: "photo" },
  { ext: "heic", type: "image/heic", kind: "photo", view: "photo" },
  { ext: "heif", type: "image/heif", kind: "photo", view: "photo" },
  { ext: "avif", type: "image/avif", kind: "photo", view: "photo" },
  { ext: "bmp", type: "image/bmp", kind: "photo", view: "photo" },
  { ext: "tif", type: "image/tiff", kind: "photo", view: "photo" },
  { ext: "tiff", type: "image/tiff", kind: "photo", view: "photo" },
  { ext: "mp4", type: "video/mp4", kind: "video", view: "video" },
  { ext: "mov", type: "video/quicktime", kind: "video", view: "video" },
  { ext: "webm", type: "video/webm", kind: "video", view: "video" },
  { ext: "m4v", type: "video/x-m4v", kind: "video", view: "video" },
  { ext: "3gp", type: "video/3gpp", kind: "video", view: "video" },
  { ext: "avi", type: "video/x-msvideo", kind: "video", view: "video" },
  { ext: "mkv", type: "video/x-matroska", kind: "video", view: "video" },
  { ext: "mp3", type: "audio/mpeg", kind: "audio", view: "audio" },
  { ext: "m4a", type: "audio/mp4", kind: "audio", view: "audio" },
  { ext: "wav", type: "audio/wav", kind: "audio", view: "audio" },
  { ext: "pdf", type: "application/pdf", kind: "document", view: "pdf" },
  { ext: "txt", type: "text/plain", kind: "document", view: "text" },
  { ext: "csv", type: "text/csv", kind: "document", view: "sheet" },
  { ext: "xls", type: "application/vnd.ms-excel", kind: "document", view: "sheet" },
  { ext: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document", view: "sheet" },
  { ext: "ods", type: "application/vnd.oasis.opendocument.spreadsheet", kind: "document", view: "sheet" },
  { ext: "doc", type: "application/msword", kind: "document", view: "file" },
  { ext: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", view: "file" },
  { ext: "rtf", type: "application/rtf", kind: "document", view: "file" },
  { ext: "odt", type: "application/vnd.oasis.opendocument.text", kind: "document", view: "file" },
  { ext: "ppt", type: "application/vnd.ms-powerpoint", kind: "document", view: "file" },
  { ext: "pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "document", view: "file" },
  { ext: "odp", type: "application/vnd.oasis.opendocument.presentation", kind: "document", view: "file" },
];

function shelfItem(ext: string, type: string): ShelfFile {
  const name = `note.${ext}`;
  const kind = socialFileKind(new File(["x"], name, { type }));
  const face = kind === "document" ? fileFace(name, type) : null;
  return {
    id: ext,
    preview: `https://files.example/note.${ext}`,
    video: kind === "video",
    audio: kind === "audio",
    page: kind === "document",
    face,
    openAs: kind === "document" ? (fileOpen(name, type) ?? "file") : null,
  };
}

function openTile(item: ShelfFile): void {
  render(
    <ScrapShelf items={[item]} onAdd={() => undefined} onRemove={() => undefined} onPut={() => undefined} />
  );
  const label = item.video
    ? "View video"
    : item.audio
      ? "View audio"
      : item.face === "sheet"
        ? "View sheet"
        : item.face
          ? item.face === "slides"
            ? "View slides"
            : "View document"
          : "View photo";
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("allowed files open", () => {
  afterEach(() => {
    cleanup();
    files.clear();
    vi.unstubAllGlobals();
  });

  it("accepts every allowed type and rejects a stranger", () => {
    for (const row of ALLOWED) {
      const named = new File(["x"], `note.${row.ext}`, { type: "" });
      const typed = new File(["x"], "note", { type: row.type });
      expect(socialFileKind(named), row.ext).toBe(row.kind);
      expect(socialFileKind(typed), row.type).toBe(row.kind);
      expect(socialFileIssue(named), row.ext).toBeNull();
    }
    expect(socialFileKind(new File(["x"], "note.wav", { type: "audio/x-wav" }))).toBe("audio");
    expect(socialFileIssue(new File(["x"], "note.exe", { type: "application/octet-stream" }))).toBe(
      "Use a photo, a video, audio, or a document"
    );
  });

  it("sends each document extension to the viewer that can show it", () => {
    for (const row of ALLOWED.filter((item) => item.kind === "document")) {
      const url = `https://files.example/note.${row.ext}`;
      const face = fileFace(`note.${row.ext}`, row.type);
      expect(fileOpenFromUrl(url) ?? face, row.ext).not.toBeNull();
      if (row.view === "sheet") expect(face).toBe("sheet");
      if (row.view === "pdf") expect(fileOpen(`note.${row.ext}`, row.type)).toBe("pdf");
      if (row.view === "text") expect(fileOpen(`note.${row.ext}`, row.type)).toBe("text");
    }
  });

  it("opens a photo, a video, and audio on the screen", () => {
    openTile(shelfItem("png", "image/png"));
    expect(document.body.querySelector("img")?.getAttribute("src")).toBe("https://files.example/note.png");
    cleanup();

    openTile(shelfItem("mp4", "video/mp4"));
    expect(document.body.querySelector("video")?.getAttribute("src")).toBe("https://files.example/note.mp4");
    cleanup();

    openTile(shelfItem("mp3", "audio/mpeg"));
    expect(document.body.querySelector("audio")?.getAttribute("src")).toBe("https://files.example/note.mp3");
  });

  it("opens a PDF and a text file on the screen", async () => {
    files.set("https://files.example/note.txt", { bytes: new TextEncoder().encode("Clinic hours"), text: "Clinic hours" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const found = files.get(String(input));
        if (!found) throw new Error("missing");
        return { ok: true, text: async () => found.text, arrayBuffer: async () => found.bytes.buffer };
      })
    );

    openTile(shelfItem("pdf", "application/pdf"));
    expect(screen.getByTitle("Document")).toHaveAttribute("src", "https://files.example/note.pdf");
    cleanup();

    openTile(shelfItem("txt", "text/plain"));
    expect(await screen.findByText("Clinic hours")).toBeInTheDocument();
  });

  it("opens xlsx, xls, csv, and ods as a grid", async () => {
    storeSheet("https://files.example/note.xlsx", "xlsx", "Hours", "Visits");
    storeSheet("https://files.example/note.xls", "xls", "Hours");
    storeSheet("https://files.example/note.ods", "ods", "Hours");
    files.set("https://files.example/note.csv", {
      bytes: new TextEncoder().encode("Hours\n"),
      text: "Hours\n",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const found = files.get(String(input));
        if (!found) throw new Error(String(input));
        const copy = new Uint8Array(found.bytes);
        return { ok: true, text: async () => found.text, arrayBuffer: async () => copy.buffer };
      })
    );

    for (const ext of ["xlsx", "xls", "csv", "ods"] as const) {
      openTile(shelfItem(ext, ALLOWED.find((row) => row.ext === ext)?.type ?? ""));
      expect(await screen.findByRole("cell", { name: "Hours" })).toBeInTheDocument();
      if (ext === "xlsx") {
        fireEvent.click(screen.getByRole("button", { name: "Two" }));
        expect(await screen.findByRole("cell", { name: "Visits" })).toBeInTheDocument();
      }
      cleanup();
    }
  });

  it("opens a word file and a slide deck", () => {
    for (const ext of ["doc", "docx", "rtf", "odt", "ppt", "pptx", "odp"]) {
      openTile(shelfItem(ext, ALLOWED.find((row) => row.ext === ext)?.type ?? ""));
      const link = screen.getByRole("link", { name: "Open" });
      expect(link).toHaveAttribute("href", `https://files.example/note.${ext}`);
      cleanup();
    }
  });
});
