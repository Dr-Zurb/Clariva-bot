import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const updateUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) =>
        signInWithPasswordMock(...args),
      signUp: (...args: unknown[]) => signUpMock(...args),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
    },
  }),
}));

import {
  authErrorMessage,
  isOAuthOnlyUser,
  MIN_PASSWORD_LENGTH,
  resetPasswordWithEmailOtp,
  sendEmailOtp,
  sendPasswordResetOtp,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
  verifyOtpThenSetPassword,
} from "@/lib/auth/methods";

describe("authErrorMessage (password branches)", () => {
  it("maps wrong credentials to password + code hint", () => {
    expect(
      authErrorMessage({ message: "Invalid login credentials" })
    ).toMatch(/incorrect password/i);
    expect(authErrorMessage({ code: "invalid_credentials" })).toMatch(
      /use a code instead/i
    );
  });

  it("maps already-registered", () => {
    expect(
      authErrorMessage({ message: "User already registered" })
    ).toMatch(/already exists/i);
    expect(authErrorMessage({ code: "email_exists" })).toMatch(/sign in/i);
  });

  it("maps weak / short password", () => {
    expect(
      authErrorMessage({
        code: "weak_password",
        message: "Password should be at least 8 characters",
      })
    ).toMatch(new RegExp(`min ${MIN_PASSWORD_LENGTH}`, "i"));
  });

  it("maps leaked password", () => {
    expect(
      authErrorMessage({
        code: "weak_password",
        message: "Password has been found in a data breach (HIBP)",
      })
    ).toMatch(/data breach/i);
  });

  it("maps login-OTP unknown-email to no-account copy", () => {
    expect(
      authErrorMessage({ message: "Signups not allowed for otp" })
    ).toMatch(/no account found/i);
    expect(authErrorMessage({ code: "otp_disabled" })).toMatch(
      /create one/i
    );
    expect(authErrorMessage({ code: "user_not_found" })).toMatch(
      /no account found/i
    );
  });

  it("maps Auth email-send failures to a clear retry message", () => {
    expect(
      authErrorMessage({ message: "Error sending confirmation email" })
    ).toMatch(/couldn't send your verification code/i);
    expect(
      authErrorMessage({
        code: "unexpected_failure",
        message: "Error sending email",
      })
    ).toMatch(/wait a minute/i);
    expect(authErrorMessage({ code: "smtp_error" })).toMatch(
      /verification code/i
    );
  });
});

describe("sendEmailOtp", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
  });

  it("defaults shouldCreateUser to true", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    await sendEmailOtp("Doc@Example.com");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      options: { shouldCreateUser: true },
    });
  });

  it("passes createIfMissing:false through", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    await sendEmailOtp("doc@example.com", { createIfMissing: false });
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      options: { shouldCreateUser: false },
    });
  });

  it("maps no-account error", async () => {
    signInWithOtpMock.mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp" },
    });
    const result = await sendEmailOtp("ghost@example.com", {
      createIfMissing: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no account found/i);
  });
});

describe("verifyOtpThenSetPassword", () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    updateUserMock.mockReset();
  });

  it("guards short password client-side", async () => {
    const result = await verifyOtpThenSetPassword(
      "doc@example.com",
      "123456",
      "short"
    );
    expect(result).toEqual({
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    });
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("verifies OTP then updateUser password", async () => {
    const user = { id: "u4" } as User;
    verifyOtpMock.mockResolvedValue({
      data: { user },
      error: null,
    });
    updateUserMock.mockResolvedValue({ data: { user }, error: null });

    const result = await verifyOtpThenSetPassword(
      "Doc@Example.com",
      "123456",
      "secret12"
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      token: "123456",
      type: "email",
    });
    expect(updateUserMock).toHaveBeenCalledWith({ password: "secret12" });
    expect(result).toEqual({ ok: true, user });
  });

  it("skips updateUser when verify fails", async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Token has expired", code: "otp_expired" },
    });
    const result = await verifyOtpThenSetPassword(
      "doc@example.com",
      "000000",
      "secret12"
    );
    expect(result.ok).toBe(false);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe("signInWithPassword", () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
  });

  it("guards empty inputs", async () => {
    expect(await signInWithPassword("", "x")).toEqual({
      ok: false,
      message: "Please enter your email.",
    });
    expect(await signInWithPassword("a@b.com", "")).toEqual({
      ok: false,
      message: "Please enter your password.",
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("returns user on success", async () => {
    const user = { id: "u1" } as User;
    signInWithPasswordMock.mockResolvedValue({
      data: { user },
      error: null,
    });
    const result = await signInWithPassword("Doc@Example.com", "secret12");
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      password: "secret12",
    });
    expect(result).toEqual({ ok: true, user });
  });

  it("maps wrong-creds error", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    const result = await signInWithPassword("doc@example.com", "wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/use a code instead/i);
  });
});

describe("signUpWithPassword", () => {
  beforeEach(() => {
    signUpMock.mockReset();
  });

  it("guards short password client-side", async () => {
    const result = await signUpWithPassword("doc@example.com", "short");
    expect(result).toEqual({
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    });
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("returns user on success", async () => {
    const user = { id: "u2" } as User;
    signUpMock.mockResolvedValue({ data: { user }, error: null });
    const result = await signUpWithPassword("doc@example.com", "secret12");
    expect(signUpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      password: "secret12",
    });
    expect(result).toEqual({ ok: true, user });
  });

  it("maps already-registered", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered", code: "email_exists" },
    });
    const result = await signUpWithPassword("doc@example.com", "secret12");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/already exists/i);
  });
});

describe("updatePassword", () => {
  beforeEach(() => {
    updateUserMock.mockReset();
  });

  it("updates via updateUser", async () => {
    const user = { id: "u3" } as User;
    updateUserMock.mockResolvedValue({ data: { user }, error: null });
    const result = await updatePassword("newsecret1");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newsecret1" });
    expect(result).toEqual({ ok: true, user });
  });
});

describe("sendPasswordResetOtp", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
  });

  it("sends OTP with shouldCreateUser:false", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    await sendPasswordResetOtp("Doc@Example.com");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      options: { shouldCreateUser: false },
    });
  });
});

describe("resetPasswordWithEmailOtp", () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    updateUserMock.mockReset();
  });

  it("verifies OTP then updates password", async () => {
    const user = { id: "u5" } as User;
    verifyOtpMock.mockResolvedValue({ data: { user }, error: null });
    updateUserMock.mockResolvedValue({ data: { user }, error: null });

    const result = await resetPasswordWithEmailOtp(
      "doc@example.com",
      "123456",
      "newsecret1"
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "doc@example.com",
      token: "123456",
      type: "email",
    });
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newsecret1" });
    expect(result).toEqual({ ok: true, user });
  });

  it("skips update when OTP invalid", async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Token has expired", code: "otp_expired" },
    });
    const result = await resetPasswordWithEmailOtp(
      "doc@example.com",
      "000000",
      "newsecret1"
    );
    expect(result.ok).toBe(false);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe("isOAuthOnlyUser", () => {
  it("true when every identity is non-email", () => {
    expect(
      isOAuthOnlyUser({
        identities: [{ provider: "google" }],
      } as User)
    ).toBe(true);
  });

  it("false when an email identity exists", () => {
    expect(
      isOAuthOnlyUser({
        identities: [{ provider: "email" }, { provider: "google" }],
      } as User)
    ).toBe(false);
  });
});
