import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PasswordPanel } from "../PasswordPanel";

const getUser = vi.fn();
const signInWithPassword = vi.fn();
const updatePassword = vi.fn();
const sendPasswordResetOtp = vi.fn();
const resetPasswordWithEmailOtp = vi.fn();
const isOAuthOnlyUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
    },
  }),
}));

vi.mock("@/lib/auth/methods", () => ({
  MIN_PASSWORD_LENGTH: 8,
  signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
  updatePassword: (...args: unknown[]) => updatePassword(...args),
  sendPasswordResetOtp: (...args: unknown[]) => sendPasswordResetOtp(...args),
  resetPasswordWithEmailOtp: (...args: unknown[]) =>
    resetPasswordWithEmailOtp(...args),
  isOAuthOnlyUser: (...args: unknown[]) => isOAuthOnlyUser(...args),
}));

describe("PasswordPanel", () => {
  beforeEach(() => {
    getUser.mockReset();
    signInWithPassword.mockReset();
    updatePassword.mockReset();
    sendPasswordResetOtp.mockReset();
    resetPasswordWithEmailOtp.mockReset();
    isOAuthOnlyUser.mockReset();
  });

  it("set path (OAuth-only): updates without current password", async () => {
    const user = {
      email: "doc@example.com",
      identities: [{ provider: "google" }],
    };
    getUser.mockResolvedValue({ data: { user } });
    isOAuthOnlyUser.mockReturnValue(true);
    updatePassword.mockResolvedValue({ ok: true, user });

    render(<PasswordPanel />);

    await screen.findByRole("heading", { name: /set a password/i });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^set password$/i }));

    await waitFor(() => {
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(updatePassword).toHaveBeenCalledWith("secret12");
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/password set/i);
  });

  it("change path: verifies current then updates", async () => {
    const user = {
      email: "doc@example.com",
      identities: [{ provider: "email" }],
    };
    getUser.mockResolvedValue({ data: { user } });
    isOAuthOnlyUser.mockReturnValue(false);
    signInWithPassword.mockResolvedValue({ ok: true, user });
    updatePassword.mockResolvedValue({ ok: true, user });

    render(<PasswordPanel />);

    await screen.findByRole("heading", { name: /change password/i });

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "oldsecret1" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newsecret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith(
        "doc@example.com",
        "oldsecret1"
      );
      expect(updatePassword).toHaveBeenCalledWith("newsecret1");
    });
  });

  it("change path: wrong current → error, no update", async () => {
    const user = {
      email: "doc@example.com",
      identities: [{ provider: "email" }],
    };
    getUser.mockResolvedValue({ data: { user } });
    isOAuthOnlyUser.mockReturnValue(false);
    signInWithPassword.mockResolvedValue({
      ok: false,
      message: "Incorrect password — or use a code instead.",
    });

    render(<PasswordPanel />);

    await screen.findByRole("heading", { name: /change password/i });

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrong" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newsecret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /current password is incorrect/i
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("reset path: send code → verify OTP + set password", async () => {
    const user = {
      email: "doc@example.com",
      identities: [{ provider: "email" }],
    };
    getUser.mockResolvedValue({ data: { user } });
    isOAuthOnlyUser.mockReturnValue(false);
    sendPasswordResetOtp.mockResolvedValue({ ok: true });
    resetPasswordWithEmailOtp.mockResolvedValue({ ok: true, user });

    render(<PasswordPanel />);

    await screen.findByRole("heading", { name: /change password/i });

    fireEvent.click(
      screen.getByRole("button", {
        name: /forgot your current password\? use a code/i,
      })
    );

    await screen.findByRole("heading", {
      name: /reset password with a code/i,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /send code to my email/i })
    );

    await screen.findByLabelText(/verification code/i);
    expect(sendPasswordResetOtp).toHaveBeenCalledWith("doc@example.com");

    fireEvent.change(screen.getByLabelText(/verification code/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newsecret1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /verify & update password/i })
    );

    await waitFor(() => {
      expect(resetPasswordWithEmailOtp).toHaveBeenCalledWith(
        "doc@example.com",
        "123456",
        "newsecret1"
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /password updated/i
    );
    // No open re-auth bypass link.
    expect(
      screen.queryByRole("button", { name: /i don't have a password yet/i })
    ).toBeNull();
  });

  it("does not expose no-proof set bypass for email users", async () => {
    const user = {
      email: "doc@example.com",
      identities: [{ provider: "email" }],
    };
    getUser.mockResolvedValue({ data: { user } });
    isOAuthOnlyUser.mockReturnValue(false);

    render(<PasswordPanel />);
    await screen.findByRole("heading", { name: /change password/i });

    expect(
      screen.queryByRole("button", { name: /i don't have a password yet/i })
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /forgot your current password\? use a code/i,
      })
    ).toBeInTheDocument();
  });
});
