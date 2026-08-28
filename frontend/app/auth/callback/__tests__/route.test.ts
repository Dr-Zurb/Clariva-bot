import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      getUser,
    },
  })),
}));

import { GET } from "@/app/auth/callback/route";

function req(url: string) {
  return new Request(url) as import("next/server").NextRequest;
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
  });

  it("missing code → /login?error=oauth", async () => {
    const res = await GET(req("https://app.example/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example/login?error=oauth"
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchange failure → /login?error=oauth", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad" } });
    const res = await GET(
      req("https://app.example/auth/callback?code=abc")
    );
    expect(res.headers.get("location")).toBe(
      "https://app.example/login?error=oauth"
    );
  });

  it("success incomplete → /complete-profile", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { user_metadata: {} } },
    });
    const res = await GET(
      req("https://app.example/auth/callback?code=abc")
    );
    expect(res.headers.get("location")).toBe(
      "https://app.example/complete-profile"
    );
  });

  it("success complete → /dashboard (honors safe next)", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: {
        user: { user_metadata: { profile_completed: true } },
      },
    });
    const res = await GET(
      req(
        "https://app.example/auth/callback?code=abc&next=%2Fdashboard%2Fgetting-started"
      )
    );
    expect(res.headers.get("location")).toBe(
      "https://app.example/dashboard/getting-started"
    );
  });
});
