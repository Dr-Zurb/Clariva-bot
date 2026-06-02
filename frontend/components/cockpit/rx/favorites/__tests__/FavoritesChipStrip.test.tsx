/**
 * FavoritesChipStrip — unit tests (rx-polish-favorites · rxf-04).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FavoritesChipStrip } from "@/components/cockpit/rx/favorites/FavoritesChipStrip";
import * as cockpitTelemetry from "@/lib/patient-profile/telemetry";
import type { DoctorDrugFavorite } from "@/lib/api/doctor-drug-favorites";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";

const template: MedicineRowValue = {
  medicineName: "Paracetamol",
  dosage: "500mg",
  route: "oral",
  frequency: "Three times daily",
  duration: "5 days",
  instructions: "",
  drugMasterId: null,
  frequencyCode: "TID",
  durationValue: 5,
  durationUnit: "days",
  routeCode: "oral",
};

const favorites: DoctorDrugFavorite[] = [
  {
    id: "fav-1",
    name: "PCM fever",
    template,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "fav-2",
    name: "Pantop GERD",
    template: { ...template, medicineName: "Pantoprazole" },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
];

describe("FavoritesChipStrip", () => {
  beforeEach(() => {
    window.__cockpitV2RRxPolishFavoritesLanded = undefined;
    vi.restoreAllMocks();
  });

  it("fires favorites landed telemetry once on first mount", () => {
    const spy = vi.spyOn(cockpitTelemetry, "trackCockpitV2RRxPolishFavoritesLanded");
    render(
      <FavoritesChipStrip
        favorites={favorites}
        onApply={vi.fn()}
        onSaveCurrentRow={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ favoritesCount: 2 });
    spy.mockRestore();
  });

  it("fires onApply when a chip is tapped", () => {
    const onApply = vi.fn();
    render(
      <FavoritesChipStrip
        favorites={favorites}
        onApply={onApply}
        onSaveCurrentRow={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply favorite PCM fever" }));
    expect(onApply).toHaveBeenCalledWith(favorites[0]);
  });

  it("fires onSaveCurrentRow when save button is shown and clicked", () => {
    const onSaveCurrentRow = vi.fn();
    render(
      <FavoritesChipStrip
        favorites={favorites}
        canSaveCurrent
        onApply={vi.fn()}
        onSaveCurrentRow={onSaveCurrentRow}
        onManage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("favorites-save-current"));
    expect(onSaveCurrentRow).toHaveBeenCalledTimes(1);
  });

  it("shows cold-start hint when there are zero favorites", () => {
    render(
      <FavoritesChipStrip
        favorites={[]}
        onApply={vi.fn()}
        onSaveCurrentRow={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Save medicines you prescribe often as one-tap chips/),
    ).toBeInTheDocument();
  });

  it("fires onManage from the Manage button", () => {
    const onManage = vi.fn();
    render(
      <FavoritesChipStrip
        favorites={favorites}
        onApply={vi.fn()}
        onSaveCurrentRow={vi.fn()}
        onManage={onManage}
      />,
    );

    fireEvent.click(screen.getByTestId("favorites-manage"));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
