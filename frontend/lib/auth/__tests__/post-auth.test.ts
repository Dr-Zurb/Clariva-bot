import { describe, expect, it, vi } from "vitest";
import {
  destinationAfterAuth,
  isProfileCompleted,
  isReceptionistRole,
  safeNextPath,
} from "@/lib/auth/post-auth";
import { authErrorMessage } from "@/lib/auth/methods";
import { routeAfterAuth } from "@/lib/auth/route-after-auth";

describe("isProfileCompleted", () => {
  it("true only when flag is strictly true", () => {
    expect(isProfileCompleted({ user_metadata: { profile_completed: true } })).toBe(
      true
    );
    expect(
      isProfileCompleted({ user_metadata: { profile_completed: false } })
    ).toBe(false);
    expect(isProfileCompleted({ user_metadata: {} })).toBe(false);
    expect(isProfileCompleted(null)).toBe(false);
  });
});

describe("isReceptionistRole", () => {
  it("true only for app_metadata.role receptionist", () => {
    expect(isReceptionistRole({ app_metadata: { role: "receptionist" } })).toBe(
      true
    );
    expect(isReceptionistRole({ app_metadata: { role: "admin" } })).toBe(false);
    expect(isReceptionistRole({ user_metadata: { profile_completed: true } })).toBe(
      false
    );
    expect(isReceptionistRole(null)).toBe(false);
  });
});

describe("destinationAfterAuth", () => {
  it("incomplete → /complete-profile (ignores next)", () => {
    expect(
      destinationAfterAuth(
        { user_metadata: {} },
        "/dashboard/getting-started"
      )
    ).toBe("/complete-profile");
  });

  it("complete → safe next or /dashboard", () => {
    const user = { user_metadata: { profile_completed: true } };
    expect(destinationAfterAuth(user)).toBe("/dashboard");
    expect(destinationAfterAuth(user, "/dashboard/getting-started")).toBe(
      "/dashboard/getting-started"
    );
    expect(destinationAfterAuth(user, "https://evil.example")).toBe(
      "/dashboard"
    );
  });

  it("receptionist → /desk even without profile_completed", () => {
    const staff = { app_metadata: { role: "receptionist" } };
    expect(destinationAfterAuth(staff)).toBe("/desk");
    expect(destinationAfterAuth(staff, "/desk/today")).toBe("/desk/today");
    expect(destinationAfterAuth(staff, "/dashboard/patients-v2")).toBe("/desk");
    expect(destinationAfterAuth(staff, "/complete-profile")).toBe("/desk");
  });
});

describe("safeNextPath", () => {
  it("accepts same-origin relative paths only", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("\\evil")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("/ok", "/fallback")).toBe("/ok");
    expect(
      safeNextPath("/dashboard/settings/integrations?connected=1")
    ).toBe("/dashboard/settings/integrations?connected=1");
  });
});

describe("authErrorMessage", () => {
  it("maps OTP / rate-limit / provider errors", () => {
    expect(authErrorMessage({ message: "Token has expired or is invalid" })).toMatch(
      /expired|invalid/i
    );
    expect(authErrorMessage({ code: "otp_expired" })).toMatch(/expired/i);
    expect(
      authErrorMessage({ message: "Email rate limit exceeded" })
    ).toMatch(/too many/i);
    expect(authErrorMessage({ message: "Provider is not enabled" })).toMatch(
      /not available/i
    );
    expect(authErrorMessage({ message: "weird" })).toMatch(/try again/i);
  });
});

describe("routeAfterAuth", () => {
  it("pushes complete-profile when incomplete", () => {
    const push = vi.fn();
    const refresh = vi.fn();
    routeAfterAuth({ push, refresh }, { user_metadata: {} });
    expect(push).toHaveBeenCalledWith("/complete-profile");
    expect(refresh).toHaveBeenCalled();
  });

  it("pushes dashboard when complete", () => {
    const push = vi.fn();
    const refresh = vi.fn();
    routeAfterAuth(
      { push, refresh },
      { user_metadata: { profile_completed: true } }
    );
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  it("pushes /desk when receptionist", () => {
    const push = vi.fn();
    const refresh = vi.fn();
    routeAfterAuth(
      { push, refresh },
      { app_metadata: { role: "receptionist" } }
    );
    expect(push).toHaveBeenCalledWith("/desk");
    expect(refresh).toHaveBeenCalled();
  });

  it("pushes safe next when complete", () => {
    const push = vi.fn();
    const refresh = vi.fn();
    routeAfterAuth(
      { push, refresh },
      { user_metadata: { profile_completed: true } },
      "/dashboard/settings/integrations?connected=1"
    );
    expect(push).toHaveBeenCalledWith(
      "/dashboard/settings/integrations?connected=1"
    );
    expect(refresh).toHaveBeenCalled();
  });
});
