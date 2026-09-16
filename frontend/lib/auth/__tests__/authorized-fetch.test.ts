import { afterEach, describe, expect, it, vi } from "vitest";
import { getFreshBrowserAccessToken } from "@/lib/auth/browser-access-token";
import { authorizedFetch } from "@/lib/auth/authorized-fetch";

vi.mock("@/lib/auth/browser-access-token", () => ({
  getFreshBrowserAccessToken: vi.fn(async (current?: string) => current ?? ""),
}));

describe("authorizedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getFreshBrowserAccessToken).mockReset();
    vi.mocked(getFreshBrowserAccessToken).mockImplementation(
      async (current?: string) => current ?? ""
    );
  });

  it("retries once with a refreshed session after 401", async () => {
    vi.mocked(getFreshBrowserAccessToken).mockResolvedValue("fresh-tok");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await authorizedFetch("http://api.test/v1/x", {
      token: "stale-tok",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.any(Headers),
    });
    const retryHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh-tok");
  });

  it("does not retry when refresh returns the same token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await authorizedFetch("http://api.test/v1/x", {
      token: "stale-tok",
    });

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
