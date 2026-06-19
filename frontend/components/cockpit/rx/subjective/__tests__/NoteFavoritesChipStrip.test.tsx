import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteFavoritesChipStrip } from "../NoteFavoritesChipStrip";

describe("NoteFavoritesChipStrip", () => {
  it("renders favourites ranked chips and applies on click", () => {
    const onApply = vi.fn();
    render(
      <NoteFavoritesChipStrip
        favorites={[
          {
            id: "f-1",
            fieldKey: "family_history",
            value: "Father — HTN",
            useCount: 5,
            lastUsedAt: "",
            createdAt: "",
            updatedAt: "",
          },
        ]}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Insert favourite Father/i }));
    expect(onApply).toHaveBeenCalledWith("Father — HTN");
  });

  it("shows fallback chips when no favourites", () => {
    const onApplyFallback = vi.fn();
    render(
      <NoteFavoritesChipStrip
        favorites={[]}
        onApply={() => {}}
        fallbackChips={["Non-smoker"]}
        onApplyFallback={onApplyFallback}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Insert Non-smoker/i }));
    expect(onApplyFallback).toHaveBeenCalledWith("Non-smoker");
  });
});
