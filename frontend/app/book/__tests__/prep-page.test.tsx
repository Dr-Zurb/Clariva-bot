import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PrepPage from "../prep/page";

const getPublicClinicHistory = vi.fn();
const postPublicClinicHistory = vi.fn();
const getPublicClinicPhotos = vi.fn();
const postPublicClinicPhoto = vi.fn();
const getPublicMedicineCatalog = vi.fn();

vi.mock("@/lib/api", () => ({
  getPublicClinicHistory: (...args: unknown[]) => getPublicClinicHistory(...args),
  postPublicClinicHistory: (...args: unknown[]) => postPublicClinicHistory(...args),
  getPublicClinicPhotos: (...args: unknown[]) => getPublicClinicPhotos(...args),
  postPublicClinicPhoto: (...args: unknown[]) => postPublicClinicPhoto(...args),
  deletePublicClinicPhoto: vi.fn(),
  getPublicMedicineCatalog: (...args: unknown[]) => getPublicMedicineCatalog(...args),
}));

const downscalePatientFile = vi.fn(async (file: File) => ({
  body: new Blob(["scaled"], { type: "image/jpeg" }),
  contentType: "image/jpeg",
}));

vi.mock("@/lib/downscale-patient-file", () => ({
  downscalePatientFile: (file: File) => downscalePatientFile(file),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("t=history-token"),
}));

describe("Prep page", () => {
  beforeEach(() => {
    getPublicClinicHistory.mockReset();
    postPublicClinicHistory.mockReset();
    getPublicClinicPhotos.mockReset();
    postPublicClinicPhoto.mockReset();
    getPublicMedicineCatalog.mockReset();
    getPublicMedicineCatalog.mockResolvedValue({ data: { drugs: [] } });
    downscalePatientFile.mockClear();
    getPublicClinicPhotos.mockResolvedValue({ data: { photos: [], canRemove: true } });
    getPublicClinicHistory.mockResolvedValue({
      data: {
        listsEditable: true,
        listsHidden: false,
        alreadySent: false,
        consultationType: "video",
        chips: null,
        allergies: { none: false, items: [] },
        medicines: { none: false, items: [] },
        conditions: { none: false, items: [] },
      },
    });
    postPublicClinicHistory.mockResolvedValue({ data: { listsStored: true, chipsSaved: true } });
  });

  it("posts a suggested medicine and a quick-add allergy, and does not ask for age or sex", async () => {
    getPublicMedicineCatalog.mockResolvedValue({
      data: {
        drugs: [
          {
            id: "telma-40",
            genericName: "Telmisartan",
            brandNames: ["Telma"],
            strength: "40 mg",
          },
        ],
      },
    });
    render(<PrepPage />);
    expect(await screen.findByText("⟨fill — counsel⟩")).toBeInTheDocument();
    expect(
      screen.getByText("Sit in a quiet room. Keep your medicine strips in front of the camera.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share this page" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Age")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sex")).not.toBeInTheDocument();
    expect(
      screen.getByText("Add a photo of the prescription, strips, or reports")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Photo kind")).toHaveValue("old_prescription");
    expect(screen.queryByRole("option", { name: "Discharge summary" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Medicines" }), {
      target: { value: "tel" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Telma 40/ }));
    expect(screen.getByText("How long have you been taking this?")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "How long have you been taking this?" }), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Penicillin" }));
    expect(screen.queryByText("How long have you had this?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No conditions" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(postPublicClinicHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "history-token",
        medicines: {
          none: false,
          items: [{ name: "Telma 40 mg", durationValue: 5, durationUnit: "years" }],
        },
        allergies: { none: false, items: [{ name: "Penicillin" }] },
        conditions: { none: true, items: [] },
      })
    );
  });

  it("sends skipped lists as empty when the patient only keeps the photo option", async () => {
    render(<PrepPage />);
    expect(await screen.findByRole("button", { name: "Send" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(postPublicClinicHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        medicines: { none: false, items: [] },
        allergies: { none: false, items: [] },
        conditions: { none: false, items: [] },
      })
    );
  });

  it("downscales a photo and posts it as an old prescription", async () => {
    postPublicClinicPhoto.mockResolvedValue({ data: { documentId: "file-1" } });
    render(<PrepPage />);
    expect(await screen.findByLabelText("Add a photo")).toBeInTheDocument();
    const file = new File(["camera"], "strip.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add a photo"), { target: { files: [file] } });
    await waitFor(() => {
      expect(downscalePatientFile).toHaveBeenCalledWith(file);
      expect(postPublicClinicPhoto).toHaveBeenCalledWith(
        "history-token",
        "old_prescription",
        expect.any(Blob),
        "image/jpeg"
      );
    });
    const posted = postPublicClinicPhoto.mock.calls[0]?.[2];
    expect(posted).not.toBe(file);
  });

  it("lists a patient file and hides remove after check-in", async () => {
    getPublicClinicPhotos.mockResolvedValue({
      data: {
        photos: [{ id: "file-1", documentType: "other", downloadUrl: "https://files.example/a" }],
        canRemove: false,
      },
    });
    render(<PrepPage />);
    expect(await screen.findByRole("link", { name: "Other papers" })).toHaveAttribute(
      "href",
      "https://files.example/a"
    );
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByText("lab_report")).not.toBeInTheDocument();
  });
});
