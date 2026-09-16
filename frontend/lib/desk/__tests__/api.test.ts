import { afterEach, describe, expect, it, vi } from "vitest";
import { getFreshBrowserAccessToken } from "@/lib/auth/browser-access-token";
import {
  cancelDeskAppointment,
  leaveDeskAppointment,
  classifyDeskAccessError,
  DESK_LIVE_SEARCH_PAGE_SIZE,
  DESK_SEARCH_PAGE_SIZE,
  listDeskLabOrders,
  listDeskLabPending,
  mapDeskLabOrder,
  mapDeskLabPendingItem,
  parseAlreadyOnToday,
  parseDuplicateMatches,
  probeDeskAccess,
  searchDeskIdentity,
  searchDeskPatients,
  type DeskError,
} from "@/lib/desk/api";

vi.mock("@/lib/auth/browser-access-token", () => ({
  getFreshBrowserAccessToken: vi.fn(async (current?: string) => current ?? ""),
}));

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
            {
              patientId: "p1",
              name: "Ria",
              phone: "9814861579",
              confidence: 1,
            },
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
    const err = new Error(
      "This patient already has a visit on that day."
    ) as DeskError;
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
      error: {
        code: "ConflictError",
        message: "This time slot is no longer available",
      },
    };
    expect(parseAlreadyOnToday(err)).toBeNull();
  });
});

describe("cancelDeskAppointment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("POSTs desk-cancel without a payment payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          appointment: {
            id: "apt-1",
            status: "cancelled",
            opd_token_number: 4,
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await cancelDeskAppointment("tok", "apt-1");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/appointments/apt-1/desk-cancel"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("refund");
  });
});

describe("leaveDeskAppointment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("POSTs desk-left with a return method, never refund", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          appointment: {
            id: "apt-1",
            status: "cancelled",
            opd_token_number: 3,
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await leaveDeskAppointment("tok", "apt-1", "cash");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/appointments/apt-1/desk-left"
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("cash");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("refund");
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
        data: {
          doctorId: "d1",
          actorKind: "staff",
          timezone: "Asia/Kolkata",
          today: "2026-08-27",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeDeskAccess("tok")).resolves.toBe("ok");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/clinic-staff/me"
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
      "/api/v1/patients"
    );
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
      json: async () => ({
        success: true,
        data: { patients: [], total: 0, page: 1, pageSize: 10 },
      }),
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
      json: async () => ({
        success: true,
        data: { patients: [], total: 55, page: 2, pageSize: 13 },
      }),
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
      json: async () => ({
        success: true,
        data: { patients: [], total: 0, page: 1, pageSize: 10 },
      }),
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

describe("mapDeskLabOrder", () => {
  it("prefers snake_case and still reads camelCase", () => {
    expect(
      mapDeskLabOrder({ order_id: "o1", label: "CBC", kind: "blood" })
    ).toEqual({
      orderId: "o1",
      label: "CBC",
      kind: "blood",
      status: "pending",
      reasonCode: null,
      reasonNote: null,
      documentId: null,
    });
    expect(
      mapDeskLabOrder({
        orderId: "o2",
        label: "USG",
        kind: "imaging",
        status: "uploaded",
        documentId: "doc-1",
      })
    ).toEqual({
      orderId: "o2",
      label: "USG",
      kind: "imaging",
      status: "uploaded",
      reasonCode: null,
      reasonNote: null,
      documentId: "doc-1",
    });
  });
});

describe("mapDeskLabPendingItem", () => {
  it("maps the live backend pending shape", () => {
    expect(
      mapDeskLabPendingItem({
        id: "apt-1",
        patient_id: "p1",
        patient_name: "Ria",
        patient_phone: "9814861579",
        patient_mrn: "P-00837",
        patient_age: 31,
        patient_sex: "female",
        appointment_date: "2026-09-01T04:00:00Z",
        status: "completed",
        patient_checked_in_at: "2026-09-01T04:10:00Z",
        days_pending: 3,
        report_uploaded: true,
        orders: [{ orderId: "o1", label: "CBC", kind: "blood" }],
        has_visit_documents: false,
        visit_document_count: 0,
      })
    ).toMatchObject({
      appointmentId: "apt-1",
      patientName: "Ria",
      patientMrn: "P-00837",
      daysPending: 3,
      reportUploaded: true,
      orders: [{ orderId: "o1", label: "CBC", kind: "blood" }],
    });
  });

  it("still reads appointment_id when id is absent", () => {
    expect(
      mapDeskLabPendingItem({
        appointment_id: "apt-3",
        patient_name: "Ria",
        days_pending: 2,
        orders: [],
      })
    ).toMatchObject({ appointmentId: "apt-3", daysPending: 2 });
  });

  it("maps the locked camelCase contract", () => {
    expect(
      mapDeskLabPendingItem({
        appointmentId: "apt-2",
        patientId: null,
        patientName: "Arjun",
        patientPhone: null,
        patientAge: null,
        patientSex: null,
        appointmentDate: "2026-09-10T04:00:00Z",
        status: "confirmed",
        patientCheckedInAt: null,
        daysPending: 1,
        orders: [{ orderId: "o9", label: "Lipid", kind: "blood" }],
        hasVisitDocuments: true,
        visitDocumentCount: 1,
      })
    ).toMatchObject({
      appointmentId: "apt-2",
      patientName: "Arjun",
      daysPending: 1,
      hasVisitDocuments: true,
    });
  });
});

describe("listDeskLabOrders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a 200 empty payload to an empty list", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { orders: [] },
          meta: { timestamp: "2026-09-13T00:00:00Z", requestId: "r1" },
        }),
      })
    );
    const res = await listDeskLabOrders("tok", "apt-1");
    expect(res.data.orders).toEqual([]);
  });

  it("throws on 404 so the desk can show an error", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: { code: "NotFoundError", message: "Not found" },
        }),
      })
    );
    await expect(listDeskLabOrders("tok", "apt-1")).rejects.toMatchObject({
      message: "Not found",
      status: 404,
    });
  });
});

describe("listDeskLabPending", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a 200 empty payload to an empty list", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [] },
          meta: { timestamp: "2026-09-13T00:00:00Z", requestId: "r1" },
        }),
      })
    );
    const res = await listDeskLabPending("tok");
    expect(res.data.items).toEqual([]);
  });

  it("throws on 403 so the desk can show an error", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: "ForbiddenError", message: "Forbidden" },
        }),
      })
    );
    await expect(listDeskLabPending("tok")).rejects.toMatchObject({
      message: "Forbidden",
      status: 403,
    });
  });
});

describe("deskRequest expired-token retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.mocked(getFreshBrowserAccessToken).mockReset();
    vi.mocked(getFreshBrowserAccessToken).mockImplementation(
      async (current?: string) => current ?? ""
    );
  });

  it("retries once with a refreshed session after 401", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.mocked(getFreshBrowserAccessToken).mockResolvedValue("fresh-tok");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { message: "Invalid or expired token" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            doctorId: "d1",
            actorKind: "staff",
            timezone: "Asia/Kolkata",
            today: "2026-09-16",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeDeskAccess("stale-tok")).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer fresh-tok" },
    });
  });
});
