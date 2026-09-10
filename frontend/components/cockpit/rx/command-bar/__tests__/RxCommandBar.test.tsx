import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isEditableFocusTarget,
  RxCommandBar,
} from "@/components/cockpit/rx/command-bar/RxCommandBar";
import {
  registerRxHiddenSource,
  resetRxHiddenSourcesForTests,
  searchShowHits,
  type RxHiddenTarget,
} from "@/components/cockpit/rx/command-bar/rx-hidden-set";
import { SUBJECTIVE_SECTION_LABELS } from "@/lib/cockpit/subjective-section-order";
import { hiddenOverridesToPersist } from "@/lib/cockpit/subjective-section-visibility";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";
import { vitalsHiddenOverridesToPersist } from "@/lib/cockpit/vitals-visibility";

const {
  replace,
  searchRef,
  setField,
  rxCommandBarOpened,
  rxCommandBarSearched,
  rxCommandBarSelected,
} = vi.hoisted(() => ({
  replace: vi.fn(),
  searchRef: { current: "from=opd" },
  setField: vi.fn(),
  rxCommandBarOpened: vi.fn(),
  rxCommandBarSearched: vi.fn(),
  rxCommandBarSelected: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/appointments/appt-1",
  useSearchParams: () => new URLSearchParams(searchRef.current),
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/cockpit/rx/RxFormContext", () => ({
  useRxForm: () => ({
    setField,
    state: { fields: { vitalsBpReadings: [], vitalsGlucoseReadings: [] } },
  }),
}));

vi.mock("@/lib/telemetry/rx-command-bar", () => ({
  rxCommandBarOpened,
  rxCommandBarSearched,
  rxCommandBarSelected,
}));

function spo2Label(): string {
  const def = VITALS_REGISTRY.find((v) => v.key === "vitalsSpo2");
  if (!def) throw new Error("vitalsSpo2 missing from VITALS_REGISTRY");
  return def.label;
}

function gcsLabel(): string {
  const def = VITALS_REGISTRY.find((v) => v.key === "vitalsGcsTotal");
  if (!def) throw new Error("vitalsGcsTotal missing from VITALS_REGISTRY");
  return def.label;
}

const JUMP_PLACEHOLDER = "Jump, show, or set a vital…";

function pressSlash(target: EventTarget = document.body) {
  fireEvent.keyDown(target, { key: "/", bubbles: true, cancelable: true });
}

describe("isEditableFocusTarget (rfec-01)", () => {
  it("treats text inputs, textareas, contenteditable, and combobox as editable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    const combo = document.createElement("div");
    combo.setAttribute("role", "combobox");
    expect(isEditableFocusTarget(input)).toBe(true);
    expect(isEditableFocusTarget(textarea)).toBe(true);
    expect(isEditableFocusTarget(editable)).toBe(true);
    expect(isEditableFocusTarget(combo)).toBe(true);
  });

  it("treats body and button-type inputs as not editable", () => {
    const button = document.createElement("input");
    button.type = "button";
    expect(isEditableFocusTarget(document.body)).toBe(false);
    expect(isEditableFocusTarget(button)).toBe(false);
  });
});

describe("RxCommandBar (rfec-01)", () => {
  beforeEach(() => {
    replace.mockReset();
    setField.mockReset();
    rxCommandBarOpened.mockReset();
    rxCommandBarSearched.mockReset();
    rxCommandBarSelected.mockReset();
    searchRef.current = "from=opd";
    resetRxHiddenSourcesForTests();
  });

  afterEach(() => {
    resetRxHiddenSourcesForTests();
  });

  it("does not open when / is typed in a text input", () => {
    render(
      <div>
        <input aria-label="Complaint" />
        <RxCommandBar />
      </div>
    );
    const input = screen.getByLabelText("Complaint");
    input.focus();
    pressSlash(input);
    expect(
      screen.queryByPlaceholderText(JUMP_PLACEHOLDER)
    ).not.toBeInTheDocument();
  });

  it("opens on / when focus is not editable", async () => {
    render(<RxCommandBar />);
    pressSlash(document.body);
    expect(
      await screen.findByPlaceholderText(JUMP_PLACEHOLDER)
    ).toBeInTheDocument();
  });

  it("does not open on Cmd-K", () => {
    render(<RxCommandBar />);
    fireEvent.keyDown(document.body, {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    expect(
      screen.queryByPlaceholderText(JUMP_PLACEHOLDER)
    ).not.toBeInTheDocument();
  });

  it("jump sets rxFocus on this visit via the Phase 1 consumer", async () => {
    render(<RxCommandBar />);
    pressSlash(document.body);
    const fieldInput = await screen.findByPlaceholderText(JUMP_PLACEHOLDER);
    fireEvent.change(fieldInput, { target: { value: "spo2" } });

    const hit = await screen.findByText(spo2Label());
    fireEvent.click(hit);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-1?from=opd&rxFocus=objective.vitals.vitalsSpo2",
        { scroll: false }
      );
    });
    expect(rxCommandBarSelected).toHaveBeenCalledWith("jump");
    expect(
      screen.queryByPlaceholderText(JUMP_PLACEHOLDER)
    ).not.toBeInTheDocument();
  });
});

describe("RxCommandBar Show (rfec-02)", () => {
  beforeEach(() => {
    replace.mockReset();
    setField.mockReset();
    rxCommandBarOpened.mockReset();
    rxCommandBarSearched.mockReset();
    rxCommandBarSelected.mockReset();
    searchRef.current = "from=opd";
    resetRxHiddenSourcesForTests();
  });

  afterEach(() => {
    resetRxHiddenSourcesForTests();
  });

  it("offers Show Family history when that section is hidden; persist is remaining ids", async () => {
    const family: RxHiddenTarget = {
      kind: "section",
      pane: "subjective",
      section: "family_history",
      label: SUBJECTIVE_SECTION_LABELS.family_history,
    };
    let liveHidden = ["family_history", "social_history", "past_surgical"];
    registerRxHiddenSource("subjective", {
      hidden: [family],
      show: (target) => {
        liveHidden = liveHidden.filter((id) => id !== target.section);
        return true;
      },
    });

    render(<RxCommandBar />);
    pressSlash(document.body);
    fireEvent.change(await screen.findByPlaceholderText(JUMP_PLACEHOLDER), {
      target: { value: "family" },
    });

    fireEvent.click(await screen.findByText("Show Family history"));

    expect(liveHidden).toEqual(["social_history", "past_surgical"]);
    expect(hiddenOverridesToPersist(liveHidden, [])).toEqual([
      "social_history",
      "past_surgical",
    ]);
    expect(JSON.stringify(liveHidden)).not.toContain("__show_all__");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-1?from=opd&rxFocus=subjective.family_history",
        { scroll: false }
      );
    });
  });

  it("offers Show for a hidden vital and persists vitals_hidden remainder", async () => {
    const gcs: RxHiddenTarget = {
      kind: "vital",
      pane: "objective",
      section: "vitals",
      field: "vitalsGcsTotal",
      label: gcsLabel(),
    };
    let liveHidden = ["vitalsGcsTotal", "vitalsMuacCm"];
    registerRxHiddenSource("vitals", {
      hidden: [gcs],
      show: (target) => {
        liveHidden = liveHidden.filter((id) => id !== target.field);
        return true;
      },
    });

    render(<RxCommandBar />);
    pressSlash(document.body);
    fireEvent.change(await screen.findByPlaceholderText(JUMP_PLACEHOLDER), {
      target: { value: "gcs" },
    });

    fireEvent.click(await screen.findByText(`Show ${gcsLabel()}`));

    expect(liveHidden).toEqual(["vitalsMuacCm"]);
    expect(vitalsHiddenOverridesToPersist(liveHidden)).toEqual([
      "vitalsMuacCm",
    ]);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-1?from=opd&rxFocus=objective.vitals.vitalsGcsTotal",
        { scroll: false }
      );
    });
  });

  it("does not offer Show for a visible section", () => {
    const family: RxHiddenTarget = {
      kind: "section",
      pane: "subjective",
      section: "family_history",
      label: SUBJECTIVE_SECTION_LABELS.family_history,
    };
    expect(searchShowHits("family", [])).toEqual([]);
    expect(searchShowHits("family", [family])).toHaveLength(1);
    expect(searchShowHits("chief", [family])).toEqual([]);
  });
});

describe("RxCommandBar Set (rfec-03)", () => {
  beforeEach(() => {
    replace.mockReset();
    setField.mockReset();
    rxCommandBarOpened.mockReset();
    rxCommandBarSearched.mockReset();
    rxCommandBarSelected.mockReset();
    searchRef.current = "from=opd";
    resetRxHiddenSourcesForTests();
  });

  afterEach(() => {
    resetRxHiddenSourcesForTests();
  });

  it("spo2 98 writes SpO₂ through the form and focuses it", async () => {
    render(<RxCommandBar />);
    pressSlash(document.body);
    expect(rxCommandBarOpened).toHaveBeenCalled();
    fireEvent.change(await screen.findByPlaceholderText(JUMP_PLACEHOLDER), {
      target: { value: "spo2 98" },
    });

    fireEvent.click(await screen.findByText(`Set ${spo2Label()} to 98`));

    expect(setField).toHaveBeenCalledWith("vitalsSpo2", 98);
    expect(rxCommandBarSelected).toHaveBeenCalledWith("set");
    expect(rxCommandBarSelected).not.toHaveBeenCalledWith("jump");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/appointments/appt-1?from=opd&rxFocus=objective.vitals.vitalsSpo2",
        { scroll: false }
      );
    });
  });

  it("unhides a hidden vital before setting it", async () => {
    const spo2: RxHiddenTarget = {
      kind: "vital",
      pane: "objective",
      section: "vitals",
      field: "vitalsSpo2",
      label: spo2Label(),
    };
    let liveHidden = ["vitalsSpo2", "vitalsMuacCm"];
    registerRxHiddenSource("vitals", {
      hidden: [spo2],
      show: (target) => {
        liveHidden = liveHidden.filter((id) => id !== target.field);
        return true;
      },
    });

    render(<RxCommandBar />);
    pressSlash(document.body);
    fireEvent.change(await screen.findByPlaceholderText(JUMP_PLACEHOLDER), {
      target: { value: "spo2 98" },
    });
    fireEvent.click(await screen.findByText(`Set ${spo2Label()} to 98`));

    expect(liveHidden).toEqual(["vitalsMuacCm"]);
    expect(setField).toHaveBeenCalledWith("vitalsSpo2", 98);
  });

  it("does not write an out-of-range command", async () => {
    render(<RxCommandBar />);
    pressSlash(document.body);
    fireEvent.change(await screen.findByPlaceholderText(JUMP_PLACEHOLDER), {
      target: { value: "spo2 200" },
    });
    expect(
      screen.queryByText(`Set ${spo2Label()} to 200`)
    ).not.toBeInTheDocument();
    expect(setField).not.toHaveBeenCalled();
  });
});
