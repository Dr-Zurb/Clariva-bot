import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyDeskAccessError,
  DESK_LIVE_SEARCH_PAGE_SIZE,
  DESK_SEARCH_PAGE_SIZE,
  parseAlreadyOnToday,
  parseDuplicateMatches,
  probeDeskAccess,
  searchDeskIdentity,
  searchDeskPatients,
  type DeskError,
} from "@/lib/desk/api";

describe("classifyDeskAccessError", () => {
  it("maps 403 to forbidden (unlinked / suspended)", () => {
    const err = new Error("Staff access has been suspended") as Error & {
      status?: number;
    };
    err.status = 403;
    expect(classifyDeskAccessError(err)).toBe("forbidden");
  });

  it("maps other failures to unreachable", () => {
    const err = new Error("Request failed") as Error & { status?: number };
    err.status = 500;
    expect(classifyDeskAccessError(err)).toBe("unreachable");
    expect(classifyDeskAccessError(new Error("network"))).toBe("unreachable");
    expect(classifyDeskAccessError("nope")).toBe("unreachable");
  });
});

describe("parseDuplicateMatches", () => {
  it("reads 409 details.matches", () => {
    const err = new Error("Possible existing patient") as DeskError;
    err.status = 409;
    err.body = {
      success: false,
      error: {
        code: "ConflictError",
        message: "Possible existing patient",
        details: {
          matches: [
            { patientId: "p1", name: "Ria", phone: "9814861579", confidence: 1 },
          ],
          confirmRequired: true,
        },
      },
    };
    expect(parseDuplicateMatches(err)).toEqual([
      { patientId: "p1", name: "Ria", phone: "9814861579", confidence: 1 },
    ]);
  });

  it("returns empty when the body has no matches", () => {
    expect(parseDuplicateMatches(new Error("nope"))).toEqual([]);
  });
});

describe("parseAlreadyOnToday", () => {
  it("reads 409 details for the same-day lock", () => {
    const err = new Error("This patient already has a visit on that day.") as DeskError;
    err.status = 409;
    err.body = {
      success: false,
      error: {
        code: "ConflictError",
        message: "This patient already has a visit on that day.",
        details: {
          reason: "already_on_today",
          appointmentId: "apt-1",
          token: 4,
          bucket: "arrived",
        },
      },
    };
    expect(parseAlreadyOnToday(err)).toEqual({
      reason: "already_on_today",
      appointmentId: "apt-1",
      token: 4,
      bucket: "arrived",
    });
  });

  it("returns null when the 409 is a different conflict", () => {
    const err = new Error("This time slot is no longer available") as DeskError;
    err.status = 409;
    err.body = {
      success: false,
      error: { code: "ConflictError", message: "This time slot is no longer available" },
    };
    expect(parseAlreadyOnToday(err)).toBeNull();
  });
});

describe("probeDeskAccess", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("probes clinic-staff/me, not the full patients list", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { doctorId: "d1", actorKind: "staff", timezone: "Asia/Kolkata", today: "2026-08-27" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeDeskAccess("tok")).resolves.toBe("ok");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/clinic-staff/me");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("/api/v1/patients");
  });
});

describe("desk search includeArchived", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("adds includeArchived=true on phone and identity search", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { patients: [], total: 0, page: 1, pageSize: 10 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchDeskPatients("tok", "9814861579", true);
    await searchDeskIdentity("tok", { name: "Ria" }, true);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("includeArchived=true");
    expect(urls[1]).toContain("includeArchived=true");
    expect(urls[0]).toContain("lean=true");
    expect(urls[1]).toContain("lean=true");
    expect(urls[0]).toContain(`pageSize=${DESK_SEARCH_PAGE_SIZE}`);
    expect(urls[1]).toContain(`pageSize=${DESK_LIVE_SEARCH_PAGE_SIZE}`);
  });

  it("pages identity search like find-a-patient", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { patients: [], total: 55, page: 2, pageSize: 13 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchDeskIdentity("tok", { name: "Jasbir" }, false, undefined, {
      page: 2,
      pageSize: 13,
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=13");
    expect(url).toContain("name=Jasbir");
  });

  it("lets live typeahead keep a smaller page", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { patients: [], total: 0, page: 1, pageSize: 10 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchDeskPatients("tok", "jasbir", false, undefined, {
      pageSize: DESK_LIVE_SEARCH_PAGE_SIZE,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `pageSize=${DESK_LIVE_SEARCH_PAGE_SIZE}`
    );
  });
});

