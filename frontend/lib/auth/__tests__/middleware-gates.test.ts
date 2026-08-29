import { describe, expect, it } from "vitest";
import { resolveAuthGate } from "@/lib/auth/middleware-gates";

const incomplete = { user_metadata: {} };
const complete = { user_metadata: { profile_completed: true } };

describe("resolveAuthGate", () => {
  it("unauth on dashboard/admin → /login", () => {
    expect(resolveAuthGate({ pathname: "/dashboard", user: null })).toEqual({
      redirect: "/login",
    });
    expect(resolveAuthGate({ pathname: "/admin/doctors", user: null })).toEqual({
      redirect: "/login",
    });
  });

  it("incomplete on dashboard → /complete-profile", () => {
    expect(
      resolveAuthGate({ pathname: "/dashboard/getting-started", user: incomplete })
    ).toEqual({ redirect: "/complete-profile" });
  });

  it("incomplete on admin → allow (no lockout)", () => {
    expect(
      resolveAuthGate({ pathname: "/admin/verifications", user: incomplete })
    ).toBe("allow");
  });

  it("complete on dashboard → allow", () => {
    expect(
      resolveAuthGate({ pathname: "/dashboard", user: complete })
    ).toBe("allow");
  });

  it("unauth on complete-profile → /login", () => {
    expect(
      resolveAuthGate({ pathname: "/complete-profile", user: null })
    ).toEqual({ redirect: "/login" });
  });

  it("incomplete on complete-profile → allow (no loop)", () => {
    expect(
      resolveAuthGate({ pathname: "/complete-profile", user: incomplete })
    ).toBe("allow");
  });

  it("complete on complete-profile → /dashboard", () => {
    expect(
      resolveAuthGate({ pathname: "/complete-profile", user: complete })
    ).toEqual({ redirect: "/dashboard" });
  });

  it("unauth on desk → /login", () => {
    expect(resolveAuthGate({ pathname: "/desk", user: null })).toEqual({
      redirect: "/login",
    });
    expect(resolveAuthGate({ pathname: "/desk/today", user: null })).toEqual({
      redirect: "/login",
    });
  });

  it("incomplete on desk → allow (staff skip profile_completed)", () => {
    expect(
      resolveAuthGate({ pathname: "/desk", user: incomplete })
    ).toBe("allow");
  });

  it("receptionist on desk → allow without profile_completed", () => {
    expect(
      resolveAuthGate({
        pathname: "/desk/today",
        user: { app_metadata: { role: "receptionist" } },
      })
    ).toBe("allow");
  });

  it("receptionist on dashboard → /desk", () => {
    expect(
      resolveAuthGate({
        pathname: "/dashboard/patients-v2",
        user: {
          user_metadata: { profile_completed: true },
          app_metadata: { role: "receptionist" },
        },
      })
    ).toEqual({ redirect: "/desk" });
  });

  it("receptionist on complete-profile → /desk", () => {
    expect(
      resolveAuthGate({
        pathname: "/complete-profile",
        user: { app_metadata: { role: "receptionist" } },
      })
    ).toEqual({ redirect: "/desk" });
  });
});
