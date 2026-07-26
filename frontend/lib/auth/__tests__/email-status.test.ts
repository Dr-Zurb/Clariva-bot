import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-base", () => ({
  requireApiBaseUrl: () => "http://api.test",
}));

import { checkEmailStatus } from "@/lib/auth/email-status";

describe("checkEmailStatus", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { exists: true, confirmed: true },
        }),
      })
    );
  });

  it("posts email and returns exists + confirmed", async () => {
    const result = await checkEmailStatus("Doc@Example.com");
    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/auth/email-status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doc@example.com" }),
      })
    );
    expect(result).toEqual({ ok: true, exists: true, confirmed: true });
  });

  it("maps unconfirmed stub from backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { exists: true, confirmed: false },
        }),
      })
    );
    await expect(checkEmailStatus("stub@example.com")).resolves.toEqual({
      ok: true,
      exists: true,
      confirmed: false,
    });
  });

  it("fail-closed: missing confirmed on an existing row → confirmed true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { exists: true } }),
      })
    );
    await expect(checkEmailStatus("legacy@example.com")).resolves.toEqual({
      ok: true,
      exists: true,
      confirmed: true,
    });
  });

  it("maps 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ success: false }),
      })
    );
    const result = await checkEmailStatus("doc@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too many/i);
  });
});
