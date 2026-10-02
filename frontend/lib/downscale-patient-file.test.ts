import { describe, expect, it } from "vitest";
import { downscalePatientFile } from "./downscale-patient-file";

describe("downscalePatientFile", () => {
  it("leaves a PDF unchanged", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "report.pdf", {
      type: "application/pdf",
    });
    const result = await downscalePatientFile(file);
    expect(result.contentType).toBe("application/pdf");
    expect(result.body).toBe(file);
  });

  it("leaves a small image unchanged", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "strip.jpg", {
      type: "image/jpeg",
    });
    const result = await downscalePatientFile(file);
    expect(result.body).toBe(file);
    expect(result.contentType).toBe("image/jpeg");
  });
});
