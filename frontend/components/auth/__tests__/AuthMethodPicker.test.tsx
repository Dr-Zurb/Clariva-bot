import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthMethodPicker } from "../AuthMethodPicker";

const signInWithGoogle = vi.fn();
const sendEmailOtp = vi.fn();
const verifyEmailOtp = vi.fn();
const signInWithPassword = vi.fn();
const verifyOtpThenSetPassword = vi.fn();
const completeEmailSignupProfile = vi.fn();
const checkEmailStatus = vi.fn();
const routeAfterAuth = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/auth/methods", () => ({
  MIN_PASSWORD_LENGTH: 8,
  signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
  sendEmailOtp: (...args: unknown[]) => sendEmailOtp(...args),
  verifyEmailOtp: (...args: unknown[]) => verifyEmailOtp(...args),
  signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
  verifyOtpThenSetPassword: (...args: unknown[]) =>
    verifyOtpThenSetPassword(...args),
}));

vi.mock("@/lib/auth/complete-signup-profile", () => ({
  completeEmailSignupProfile: (...args: unknown[]) =>
    completeEmailSignupProfile(...args),
}));

vi.mock("@/lib/auth/email-status", () => ({
  checkEmailStatus: (...args: unknown[]) => checkEmailStatus(...args),
}));

vi.mock("@/lib/auth/route-after-auth", () => ({
  routeAfterAuth: (...args: unknown[]) => routeAfterAuth(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("AuthMethodPicker", () => {
  beforeEach(() => {
    signInWithGoogle.mockReset();
    sendEmailOtp.mockReset();
    verifyEmailOtp.mockReset();
    signInWithPassword.mockReset();
    verifyOtpThenSetPassword.mockReset();
    completeEmailSignupProfile.mockReset();
    checkEmailStatus.mockReset();
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: false,
      confirmed: false,
    });
    routeAfterAuth.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("Google card calls signInWithGoogle", async () => {
    signInWithGoogle.mockResolvedValue({ ok: true });
    render(<AuthMethodPicker mode="signin" />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it("renders email form above Google", () => {
    render(<AuthMethodPicker mode="signin" />);
    const email = screen.getByLabelText(/^email$/i);
    const google = screen.getByRole("button", { name: /continue with google/i });
    expect(
      email.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("signin: password submit calls signInWithPassword and routes", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: true,
      confirmed: true,
    });
    signInWithPassword.mockResolvedValue({
      ok: true,
      user: { user_metadata: { profile_completed: true } },
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(checkEmailStatus).toHaveBeenCalledWith("doc@example.com");
      expect(signInWithPassword).toHaveBeenCalledWith(
        "doc@example.com",
        "secret12"
      );
      expect(routeAfterAuth).toHaveBeenCalled();
    });
  });

  it("signin: unregistered email shows no-account copy", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: false,
      confirmed: false,
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "ghost@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no account found/i
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("signin: unconfirmed stub points doctor back to Create account", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: true,
      confirmed: false,
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "stub@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /finish creating your account/i
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("signup: name+email+password → OTP → verify → stamp profile → getting-started", async () => {
    sendEmailOtp.mockResolvedValue({ ok: true });
    verifyOtpThenSetPassword.mockResolvedValue({
      ok: true,
      user: { user_metadata: {} },
    });
    completeEmailSignupProfile.mockResolvedValue({
      ok: true,
      user: { user_metadata: { profile_completed: true } },
    });

    render(<AuthMethodPicker mode="signup" />);
    fireEvent.change(screen.getByLabelText(/^full name$/i), {
      target: { value: "Ada Sharma" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.change(screen.getByLabelText(/practice name/i), {
      target: { value: "Ada Clinic" },
    });
    fireEvent.change(screen.getByLabelText(/specialty/i), {
      target: { value: "Derm" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByLabelText(/verification code/i);
    expect(sendEmailOtp).toHaveBeenCalledWith("doc@example.com", {
      createIfMissing: true,
    });

    fireEvent.change(screen.getByLabelText(/verification code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => {
      expect(verifyOtpThenSetPassword).toHaveBeenCalledWith(
        "doc@example.com",
        "123456",
        "secret12"
      );
      expect(completeEmailSignupProfile).toHaveBeenCalledWith({
        fullName: "Ada Sharma",
        practiceName: "Ada Clinic",
        specialty: "Derm",
      });
      expect(push).toHaveBeenCalledWith("/dashboard/getting-started");
      expect(refresh).toHaveBeenCalled();
      expect(routeAfterAuth).not.toHaveBeenCalled();
    });
  });

  it("signup: requires name before sending OTP", async () => {
    render(<AuthMethodPicker mode="signup" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/full name/i);
    expect(sendEmailOtp).not.toHaveBeenCalled();
  });

  it("signup: confirmed existing email shows already-registered and skips OTP", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: true,
      confirmed: true,
    });

    render(<AuthMethodPicker mode="signup" />);
    fireEvent.change(screen.getByLabelText(/^full name$/i), {
      target: { value: "Ada Sharma" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already exists/i
    );
    expect(checkEmailStatus).toHaveBeenCalledWith("doc@example.com");
    expect(sendEmailOtp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
  });

  it("signup: unconfirmed stub may re-request OTP", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: true,
      confirmed: false,
    });
    sendEmailOtp.mockResolvedValue({ ok: true });

    render(<AuthMethodPicker mode="signup" />);
    fireEvent.change(screen.getByLabelText(/^full name$/i), {
      target: { value: "Ada Sharma" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "stub@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByLabelText(/verification code/i);
    expect(sendEmailOtp).toHaveBeenCalledWith("stub@example.com", {
      createIfMissing: true,
    });
  });

  it("signup: shows Dr. prefix chrome and no standalone use-a-code link", () => {
    render(<AuthMethodPicker mode="signup" />);
    expect(screen.getByText("Dr.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /use a code instead/i })
    ).toBeNull();
  });

  it("signin: use a code instead → OTP with createIfMissing:false → verify → route", async () => {
    sendEmailOtp.mockResolvedValue({ ok: true });
    verifyEmailOtp.mockResolvedValue({
      ok: true,
      user: { user_metadata: {} },
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /forgot password\? use a code instead/i })
    );

    await screen.findByLabelText(/verification code/i);
    expect(sendEmailOtp).toHaveBeenCalledWith("doc@example.com", {
      createIfMissing: false,
    });

    fireEvent.change(screen.getByLabelText(/verification code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => {
      expect(verifyEmailOtp).toHaveBeenCalledWith("doc@example.com", "123456");
      expect(routeAfterAuth).toHaveBeenCalled();
    });
  });

  it("signin: use a code on unknown email shows no-account copy", async () => {
    sendEmailOtp.mockResolvedValue({
      ok: false,
      message: "No account found — create one.",
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "ghost@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /forgot password\? use a code instead/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no account found/i
    );
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
  });

  it("shows helper error copy on password failure", async () => {
    checkEmailStatus.mockResolvedValue({
      ok: true,
      exists: true,
      confirmed: true,
    });
    signInWithPassword.mockResolvedValue({
      ok: false,
      message: "Incorrect password — or use a code instead.",
    });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /incorrect password/i
    );
  });

  it("resend is disabled during cooldown", async () => {
    sendEmailOtp.mockResolvedValue({ ok: true });

    render(<AuthMethodPicker mode="signin" />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "doc@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /forgot password\? use a code instead/i })
    );

    const resend = await screen.findByRole("button", {
      name: /resend code in/i,
    });
    expect(resend).toBeDisabled();
    expect(sendEmailOtp).toHaveBeenCalledTimes(1);
  });
});
