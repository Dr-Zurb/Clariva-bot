/**
 * Unit tests for `frontend/lib/text/markdown-lite.tsx` (text-B3).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderMarkdownLite } from "../markdown-lite";

const SOURCE_PATH = join(__dirname, "..", "markdown-lite.tsx");

function renderBody(body: string, opts?: { compact?: boolean }) {
  return render(<div data-testid="md-root">{renderMarkdownLite(body, opts)}</div>);
}

describe("renderMarkdownLite", () => {
  it("does not use dangerouslySetInnerHTML in source", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders bold", () => {
    renderBody("**important**");
    const strong = document.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("important");
  });

  it("renders italic with asterisk", () => {
    renderBody("*soft*");
    const em = document.querySelector("em");
    expect(em?.textContent).toBe("soft");
  });

  it("renders italic with underscore", () => {
    renderBody("_soft_");
    const em = document.querySelector("em");
    expect(em?.textContent).toBe("soft");
  });

  it("does not italicize asterisks inside words", () => {
    renderBody("5*5=25");
    expect(document.querySelector("em")).toBeNull();
    expect(screen.getByTestId("md-root").textContent).toBe("5*5=25");
  });

  it("renders strikethrough", () => {
    renderBody("~~typo~~");
    const s = document.querySelector("s");
    expect(s?.textContent).toBe("typo");
  });

  it("renders inline code", () => {
    renderBody("`dose 5mg`");
    const code = document.querySelector("code");
    expect(code?.textContent).toBe("dose 5mg");
  });

  it("renders https links only", () => {
    renderBody("[ref](https://example.com)");
    const a = document.querySelector("a");
    expect(a).toBeTruthy();
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("ref");
  });

  it("rejects javascript: links as plain text", () => {
    const body = "[click](javascript:alert(1))";
    renderBody(body);
    expect(document.querySelector("a")).toBeNull();
    expect(screen.getByTestId("md-root").textContent).toBe(body);
  });

  it("rejects http:// links as plain text", () => {
    const body = "[click](http://example.com)";
    renderBody(body);
    expect(document.querySelector("a")).toBeNull();
    expect(screen.getByTestId("md-root").textContent).toBe(body);
  });

  it("escapes script tags as plain text", () => {
    const body = "<script>alert(1)</script>";
    renderBody(body);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByTestId("md-root").textContent).toBe(body);
  });

  it("collapses consecutive list lines into one ul with three li", () => {
    renderBody("- a\n- b\n- c");
    const ul = document.querySelector("ul");
    expect(ul).toBeTruthy();
    const items = ul?.querySelectorAll("li");
    expect(items?.length).toBe(3);
    expect(items?.[0]?.textContent).toBe("a");
    expect(items?.[1]?.textContent).toBe("b");
    expect(items?.[2]?.textContent).toBe("c");
  });

  it("compact mode skips list rendering", () => {
    renderBody("- a\n- b", { compact: true });
    expect(document.querySelector("ul")).toBeNull();
    expect(screen.getByTestId("md-root").textContent).toBe("- a\n- b");
  });

  it("does not bold inside inline code spans", () => {
    renderBody("`**not bold**`");
    expect(document.querySelector("strong")).toBeNull();
    const code = document.querySelector("code");
    expect(code?.textContent).toBe("**not bold**");
  });
});
