/**
 * FavoritesSideSheet — unit tests (rx-polish-favorites · rxf-04).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FavoritesSideSheet } from "@/components/cockpit/rx/favorites/FavoritesSideSheet";
import type { DoctorDrugFavorite } from "@/lib/api/doctor-drug-favorites";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";

const mockClose = vi.fn();
const mockListFavorites = vi.fn();
const mockUpdateFavorite = vi.fn();
const mockDeleteFavorite = vi.fn();

vi.mock("@/components/patient-profile/SideSheetHost", () => ({
  useSideSheet: () => ({
    open: vi.fn(),
    close: mockClose,
    register: vi.fn(() => () => undefined),
    isOpen: vi.fn(),
  }),
}));

vi.mock("@/lib/api/doctor-drug-favorites", () => ({
  listFavorites: (...args: unknown[]) => mockListFavorites(...args),
  updateFavorite: (...args: unknown[]) => mockUpdateFavorite(...args),
  deleteFavorite: (...args: unknown[]) => mockDeleteFavorite(...args),
}));

const template: MedicineRowValue = {
  medicineName: "Paracetamol",
  dosage: "500mg",
  route: "oral",
  frequency: "Three times daily",
  duration: "5 days",
  instructions: "After meals",
  drugMasterId: null,
  frequencyCode: "TID",
  durationValue: 5,
  durationUnit: "days",
  routeCode: "oral",
  doseQty: null,
  doseUnit: null,
  form: null,
  foodTiming: null,
};

const favorites: DoctorDrugFavorite[] = [
  {
    id: "fav-1",
    name: "PCM fever",
    template,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
];

describe("FavoritesSideSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFavorites.mockResolvedValue(favorites);
    mockUpdateFavorite.mockResolvedValue({ ...favorites[0], name: "PCM 500" });
    mockDeleteFavorite.mockResolvedValue(undefined);
  });

  it("renders the favorites list with preview text", async () => {
    render(<FavoritesSideSheet token="token-1" />);

    expect(await screen.findByText("PCM fever")).toBeInTheDocument();
    expect(screen.getByText(/Paracetamol/)).toBeInTheDocument();
  });

  it("shows empty state when there are no favorites", async () => {
    mockListFavorites.mockResolvedValueOnce([]);
    render(<FavoritesSideSheet token="token-1" />);

    expect(
      await screen.findByText(/No favorites yet\. Save one from any complete medicine row/),
    ).toBeInTheDocument();
  });

  it("supports inline edit name", async () => {
    render(<FavoritesSideSheet token="token-1" />);
    await screen.findByText("PCM fever");

    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    const input = screen.getByLabelText("Favorite name");
    fireEvent.change(input, { target: { value: "PCM 500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateFavorite).toHaveBeenCalledWith("token-1", "fav-1", { name: "PCM 500" });
    });
  });

  it("delete requires confirmation", async () => {
    render(<FavoritesSideSheet token="token-1" />);
    await screen.findByText("PCM fever");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockDeleteFavorite).toHaveBeenCalledWith("token-1", "fav-1");
    });
  });

  it("closes via header CTA", async () => {
    render(<FavoritesSideSheet token="token-1" />);
    await screen.findByText("PCM fever");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockClose).toHaveBeenCalled();
  });
});
