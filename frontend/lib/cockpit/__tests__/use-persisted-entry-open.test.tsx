import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  usePersistedComplaintChildOpen,
  usePersistedMedicineOpen,
  usePersistedOpenFlag,
  usePersistedOpenId,
} from "@/lib/cockpit/use-persisted-entry-open";
import { readEntryCardUi } from "@/lib/cockpit/entry-card-ui-state";

const SCOPE = "appt-hook-1";

describe("usePersistedOpenId", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("hydrates from sessionStorage and writes on change", () => {
    sessionStorage.setItem(
      `clariva:entry-card-ui:${SCOPE}`,
      JSON.stringify({ medicines: "m1" }),
    );
    const { result } = renderHook(() =>
      usePersistedOpenId(SCOPE, "medicines"),
    );
    expect(result.current[0]).toBe("m1");

    act(() => {
      result.current[1]("m2");
    });
    expect(result.current[0]).toBe("m2");
    expect(readEntryCardUi(SCOPE).medicines).toBe("m2");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() =>
      usePersistedOpenId(SCOPE, "complaints"),
    );
    act(() => {
      result.current[1]("c1");
    });
    act(() => {
      result.current[1]((prev) => (prev === "c1" ? null : prev));
    });
    expect(result.current[0]).toBeNull();
    expect(readEntryCardUi(SCOPE).complaints).toBeNull();
  });
});

describe("usePersistedComplaintChildOpen", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("scopes child open id under the parent complaint", () => {
    const { result } = renderHook(() =>
      usePersistedComplaintChildOpen(SCOPE, "parent-1"),
    );
    act(() => {
      result.current[1]("child-9");
    });
    expect(readEntryCardUi(SCOPE).complaintChildren).toEqual({
      "parent-1": "child-9",
    });
  });
});

describe("usePersistedMedicineOpen", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("restores by row index when instance ids regenerate", () => {
    const { result, rerender } = renderHook(
      ({ ids }) => usePersistedMedicineOpen(SCOPE, ids),
      { initialProps: { ids: ["old-a", "old-b", "old-c"] } },
    );
    act(() => {
      result.current[1]("old-b");
    });
    expect(readEntryCardUi(SCOPE)).toMatchObject({
      medicines: "old-b",
      medicinesIndex: 1,
    });

    rerender({ ids: ["new-a", "new-b", "new-c"] });
    expect(result.current[0]).toBe("new-b");
  });
});

describe("usePersistedOpenFlag", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists expand/collapse for a PMH condition id", () => {
    const { result } = renderHook(() =>
      usePersistedOpenFlag(SCOPE, "cond-1", false),
    );
    expect(result.current[0]).toBe(false);
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(readEntryCardUi(SCOPE).pmhConditions).toEqual(["cond-1"]);

    act(() => {
      result.current[1](false);
    });
    expect(readEntryCardUi(SCOPE).pmhConditions ?? []).toEqual([]);
  });
});
