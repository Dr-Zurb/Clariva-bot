/**
 * Unit tests for `frontend/lib/text/share-target-bridge.ts` (text-C7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_TARGET_PENDING_FILES_KEY,
  blobToShareFile,
  extensionForMime,
  isShareTargetMimeAllowed,
  isShareTargetPlatformSupported,
  parseShareTargetKeys,
  persistPendingShareKeys,
  readPendingShareKeys,
} from "../share-target-bridge";

describe("parseShareTargetKeys", () => {
  it("parses comma-separated cache keys and drops invalid entries", () => {
    expect(
      parseShareTargetKeys("share-target-a, bad, share-target-b ,share-target-c"),
    ).toEqual(["share-target-a", "share-target-b", "share-target-c"]);
  });

  it("returns empty for blank input", () => {
    expect(parseShareTargetKeys("")).toEqual([]);
    expect(parseShareTargetKeys(null)).toEqual([]);
  });
});

describe("sessionStorage handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("persists and reads pending share keys", () => {
    persistPendingShareKeys(["share-target-1", "share-target-2"]);
    expect(readPendingShareKeys()).toEqual(["share-target-1", "share-target-2"]);
    expect(sessionStorage.getItem(SHARE_TARGET_PENDING_FILES_KEY)).toBe(
      "share-target-1,share-target-2",
    );
  });
});

describe("isShareTargetMimeAllowed", () => {
  it("allows images and PDF", () => {
    expect(isShareTargetMimeAllowed("image/jpeg")).toBe(true);
    expect(isShareTargetMimeAllowed("application/pdf")).toBe(true);
  });

  it("rejects other types", () => {
    expect(isShareTargetMimeAllowed("text/plain")).toBe(false);
    expect(isShareTargetMimeAllowed("")).toBe(false);
  });
});

describe("blobToShareFile", () => {
  it("synthesizes a filename from mime and index", () => {
    const file = blobToShareFile(new Blob(["x"], { type: "image/png" }), "image/png", 0);
    expect(file.name).toBe("shared-1.png");
    expect(file.type).toBe("image/png");
  });
});

describe("extensionForMime", () => {
  it("maps common mimes", () => {
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });
});

describe("isShareTargetPlatformSupported", () => {
  it("returns false on iPhone user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(isShareTargetPlatformSupported()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns true on Android Chrome", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    });
    expect(isShareTargetPlatformSupported()).toBe(true);
    vi.unstubAllGlobals();
  });
});
