import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  DashboardLiveFocusProvider,
  useDashboardLiveFocus,
} from "../DashboardLiveFocusContext";

function Probe() {
  const { liveFocus, setLiveFocus } = useDashboardLiveFocus();
  return (
    <div>
      <span data-testid="flag">{liveFocus ? "on" : "off"}</span>
      <button type="button" onClick={() => setLiveFocus(true)}>
        focus
      </button>
      <button type="button" onClick={() => setLiveFocus(false)}>
        clear
      </button>
    </div>
  );
}

describe("DashboardLiveFocusContext", () => {
  it("defaults off and toggles via setLiveFocus", () => {
    render(
      <DashboardLiveFocusProvider>
        <Probe />
      </DashboardLiveFocusProvider>,
    );
    expect(screen.getByTestId("flag")).toHaveTextContent("off");
    act(() => {
      screen.getByRole("button", { name: "focus" }).click();
    });
    expect(screen.getByTestId("flag")).toHaveTextContent("on");
    act(() => {
      screen.getByRole("button", { name: "clear" }).click();
    });
    expect(screen.getByTestId("flag")).toHaveTextContent("off");
  });

  it("no-ops safely outside the provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("flag")).toHaveTextContent("off");
    act(() => {
      screen.getByRole("button", { name: "focus" }).click();
    });
    expect(screen.getByTestId("flag")).toHaveTextContent("off");
  });
});
