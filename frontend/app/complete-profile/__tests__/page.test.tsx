import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CompleteProfilePage from "../page";

const getUser = vi.fn();
const getSession = vi.fn();
const updateUser = vi.fn();
const patchDoctorSettings = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser, getSession, updateUser },
  }),
}));

vi.mock("@/lib/api", () => ({
  patchDoctorSettings: (...args: unknown[]) => patchDoctorSettings(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt} />;
  },
}));

describe("CompleteProfilePage", () => {
  beforeEach(() => {
    getUser.mockReset();
    getSession.mockReset();
    updateUser.mockReset();
    patchDoctorSettings.mockReset();
    push.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("prefills bare name and shows Dr. prefix chrome", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          user_metadata: { full_name: "Dr. Ada" },
        },
      },
    });
    render(<CompleteProfilePage />);
    expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByText("Dr.")).toBeInTheDocument();
  });

  it("blocks submit without name", async () => {
    getUser.mockResolvedValue({
      data: { user: { user_metadata: {} } },
    });
    render(<CompleteProfilePage />);
    await screen.findByLabelText(/full name/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/full name/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("submits Dr.-prefixed name + settings + stamps flag + routes", async () => {
    getUser.mockResolvedValue({
      data: { user: { user_metadata: { full_name: "Dr. Ada" } } },
    });
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    updateUser.mockResolvedValue({ error: null });
    patchDoctorSettings.mockResolvedValue({});

    render(<CompleteProfilePage />);
    await screen.findByDisplayValue("Ada");

    fireEvent.change(screen.getByLabelText(/practice name/i), {
      target: { value: "Ada Clinic" },
    });
    fireEvent.change(screen.getByLabelText(/specialty/i), {
      target: { value: "Derm" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({
        data: { full_name: "Dr. Ada", profile_completed: true },
      });
      expect(patchDoctorSettings).toHaveBeenCalledWith("tok", {
        practice_name: "Ada Clinic",
        specialty: "Derm",
      });
      expect(push).toHaveBeenCalledWith("/dashboard/getting-started");
      expect(refresh).toHaveBeenCalled();
    });
  });
});
