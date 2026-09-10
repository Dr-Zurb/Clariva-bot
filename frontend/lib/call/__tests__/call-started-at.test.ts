import { afterEach, describe, expect, it } from "vitest";
import {
  callStartedAtStorageKey,
  earlierCallStartedAt,
  parseCallStartedAt,
  readStoredCallStartedAt,
  resolveCallStartedAt,
  storeCallStartedAt,
} from "../call-started-at";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("parseCallStartedAt", () => {
  it("parses ISO strings and Date instances", () => {
    const iso = "2026-08-10T10:00:00.000Z";
    expect(parseCallStartedAt(iso)?.toISOString()).toBe(iso);
    expect(parseCallStartedAt(new Date(iso))?.toISOString()).toBe(iso);
  });

  it("returns null for empty / invalid values", () => {
    expect(parseCallStartedAt(null)).toBeNull();
    expect(parseCallStartedAt(undefined)).toBeNull();
    expect(parseCallStartedAt("")).toBeNull();
    expect(parseCallStartedAt("not-a-date")).toBeNull();
  });
});

describe("sessionStorage helpers", () => {
  it("round-trips a start timestamp by session id", () => {
    const at = new Date("2026-08-10T10:05:00.000Z");
    storeCallStartedAt("sess-1", at);
    expect(readStoredCallStartedAt("sess-1")?.toISOString()).toBe(
      at.toISOString(),
    );
    expect(window.sessionStorage.getItem(callStartedAtStorageKey("sess-1"))).toBe(
      at.toISOString(),
    );
  });

  it("no-ops without a session id", () => {
    storeCallStartedAt(null, new Date());
    expect(readStoredCallStartedAt(null)).toBeNull();
  });
});

describe("resolveCallStartedAt", () => {
  it("prefers the server prop over sessionStorage", () => {
    storeCallStartedAt("sess-1", new Date("2026-08-10T11:00:00.000Z"));
    const resolved = resolveCallStartedAt({
      sessionStartedAt: "2026-08-10T10:00:00.000Z",
      sessionId: "sess-1",
    });
    expect(resolved?.toISOString()).toBe("2026-08-10T10:00:00.000Z");
  });

  it("falls back to sessionStorage when the prop is missing", () => {
    storeCallStartedAt("sess-1", new Date("2026-08-10T10:30:00.000Z"));
    const resolved = resolveCallStartedAt({
      sessionStartedAt: null,
      sessionId: "sess-1",
    });
    expect(resolved?.toISOString()).toBe("2026-08-10T10:30:00.000Z");
  });
});

describe("earlierCallStartedAt", () => {
  it("returns the earlier timestamp", () => {
    const a = new Date("2026-08-10T10:00:00.000Z");
    const b = new Date("2026-08-10T10:05:00.000Z");
    expect(earlierCallStartedAt(a, b)).toBe(a);
    expect(earlierCallStartedAt(null, b)).toBe(b);
    expect(earlierCallStartedAt(a, null)).toBe(a);
  });
});
