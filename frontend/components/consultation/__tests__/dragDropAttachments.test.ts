/**
 * Unit tests for text-B9 drag-and-drop attachment helpers.
 */

import { describe, expect, it, vi } from "vitest";
import {
  dragDataTransferHasFiles,
  preventDefaultIfFileDrag,
} from "../TextConsultRoom";

describe("dragDataTransferHasFiles", () => {
  it("returns false when dataTransfer is null", () => {
    expect(dragDataTransferHasFiles(null)).toBe(false);
  });

  it("returns true when Files is in types", () => {
    expect(
      dragDataTransferHasFiles({ types: ["Files"] } as DataTransfer),
    ).toBe(true);
  });

  it("returns false for text-only drags", () => {
    expect(
      dragDataTransferHasFiles({ types: ["text/plain"] } as DataTransfer),
    ).toBe(false);
  });
});

describe("preventDefaultIfFileDrag", () => {
  it("calls preventDefault on dragover when Files are present", () => {
    const preventDefault = vi.fn();
    preventDefaultIfFileDrag({
      dataTransfer: { types: ["Files"] } as DataTransfer,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not call preventDefault for non-file drags", () => {
    const preventDefault = vi.fn();
    preventDefaultIfFileDrag({
      dataTransfer: { types: ["text/plain"] } as DataTransfer,
      preventDefault,
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
