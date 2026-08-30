import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaCallbackStatus } from "../MetaCallbackStatus";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MetaCallbackStatus", () => {
  it("shows the confirmation code and a received status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "del-1780000000000-abcdef123456",
          status: "received",
        }),
      }),
    );

    render(<MetaCallbackStatus code="del-1780000000000-abcdef123456" />);

    expect(screen.getByText("del-1780000000000-abcdef123456")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Request received/i)).toBeInTheDocument();
    });
  });
});
