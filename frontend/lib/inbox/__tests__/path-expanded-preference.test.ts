import { afterEach, describe, expect, it } from "vitest";
import {
  INBOX_PATH_EXPANDED_KEY,
  readInboxPathExpandedFromStorage,
  writeInboxPathExpandedToStorage,
} from "@/lib/inbox/path-expanded-preference";

describe("inbox path expanded preference", () => {
  afterEach(() => {
    window.localStorage.removeItem(INBOX_PATH_EXPANDED_KEY);
  });

  it("defaults to compact (false)", () => {
    expect(readInboxPathExpandedFromStorage()).toBe(false);
  });

  it("round-trips expanded true/false", () => {
    writeInboxPathExpandedToStorage(true);
    expect(readInboxPathExpandedFromStorage()).toBe(true);
    writeInboxPathExpandedToStorage(false);
    expect(readInboxPathExpandedFromStorage()).toBe(false);
  });
});
