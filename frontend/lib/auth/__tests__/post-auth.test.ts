import { describe, expect, it, vi } from "vitest";
import {
  destinationAfterAuth,
  isProfileCompleted,
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
});

describe("safeNextPath", () => {
  it("accepts same-origin relative paths only", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("\\evil")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("/ok", "/fallback")).toBe("/ok");
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
});
