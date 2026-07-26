import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const updateUser = vi.fn();
const getSession = vi.fn();
const patchDoctorSettings = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { updateUser, getSession },
  }),
}));

vi.mock("@/lib/api", () => ({
  patchDoctorSettings: (...args: unknown[]) => patchDoctorSettings(...args),
}));

import { completeEmailSignupProfile } from "@/lib/auth/complete-signup-profile";

describe("completeEmailSignupProfile", () => {
  beforeEach(() => {
    updateUser.mockReset();
    getSession.mockReset();
    patchDoctorSettings.mockReset();
  });

  it("guards empty name", async () => {
    const result = await completeEmailSignupProfile({ fullName: "  " });
    expect(result).toEqual({
      ok: false,
      message: "Please enter your full name.",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("stamps Dr. name + profile_completed and patches settings", async () => {
    const user = {
      id: "u1",
      user_metadata: { full_name: "Dr. Ada", profile_completed: true },
    } as User;
    updateUser.mockResolvedValue({ data: { user }, error: null });
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    patchDoctorSettings.mockResolvedValue({});

    const result = await completeEmailSignupProfile({
      fullName: "Ada",
      practiceName: "Ada Clinic",
      specialty: "Derm",
    });

    expect(updateUser).toHaveBeenCalledWith({
      data: { full_name: "Dr. Ada", profile_completed: true },
    });
    expect(patchDoctorSettings).toHaveBeenCalledWith("tok", {
      practice_name: "Ada Clinic",
      specialty: "Derm",
    });
    expect(result).toEqual({ ok: true, user });
  });

  it("skips settings patch when practice/specialty empty", async () => {
    const user = { id: "u2" } as User;
    updateUser.mockResolvedValue({ data: { user }, error: null });

    await completeEmailSignupProfile({ fullName: "Ada" });

    expect(patchDoctorSettings).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});
