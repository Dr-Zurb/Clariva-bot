/**
 * OpdSessionDatePicker — trigger label, prev/next day, Today jump.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { OpdSessionDatePicker } from "@/components/opd/shared/OpdSessionDatePicker";

describe("OpdSessionDatePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 9, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a larger Today label for today's date", () => {
    render(
      <OpdSessionDatePicker value="2026-08-11" onChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /Session date, Today/i }),
    ).toBeInTheDocument();
  });

  it("steps previous and next day from the side controls", () => {
    const onChange = vi.fn();
    render(
      <OpdSessionDatePicker value="2026-08-11" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-10");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-12");
  });

  it("jumps to today from the popover footer", () => {
    const onChange = vi.fn();
    render(
      <OpdSessionDatePicker value="2026-08-09" onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Session date,/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-11");
  });
});
