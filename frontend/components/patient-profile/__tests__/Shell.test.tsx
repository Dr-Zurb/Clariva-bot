/**
 * `<PatientProfileShell>` — unit tests (Vitest + RTL).
 *
 * Covers the public contract from ppr-03:
 *   - Pure helpers (`getCollapsedSizePct`, `findAbsorber`,
 *     `buildShellLayoutMap`).
 *   - Render shape: N panes + 1 spacer (asserted via `[data-pane-id]`
 *     count on a mocked `<ResizablePanelGroup>`).
 *   - Header chevron click flips the pane's collapse state and calls
 *     `panel.collapse()` / `panel.expand()`.
 *   - dnd-kit drag-end fires the swap.
 *   - All-collapsed sanity (every pane lands at `collapsedSizePct`,
 *     spacer absorbs the leftover).
 *   - localStorage persists across re-mounts via `storageKey`.
 *
 * The shadcn `resizable` wrapper is mocked because react-resizable-panels
 * needs real DOM measurement for its layout math which jsdom doesn't
 * provide. The mock exposes the imperative `collapse / expand /
 * setLayout` surface so the absorber math can be exercised end-to-end.
 *
 * @dnd-kit/core is partially mocked: we capture the `onDragEnd`
 * callback off `<DndContext>` and invoke it directly with a synthetic
 * `DragEndEvent`. Simulating real pointer drags through
 * react-testing-library is fragile and not what we're testing here —
 * we want the shell's reorder behaviour given a drag-end event with
 * known `active` / `over` payloads.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the component under test.
// ---------------------------------------------------------------------------

// Mock useMediaQuery so we can flip between desktop and mobile.
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true), // default: desktop (lg+)
}));

// Mock the shadcn resizable wrapper. The mock:
//   - Renders `<ResizablePanelGroup>` as a div with a captured `groupRef`
//     that exposes `setLayout(map)` for our assertions.
//   - Renders `<ResizablePanel>` as a div with `data-pane-id={id}`,
//     a stub `panelRef` exposing `collapse / expand / isCollapsed`,
//     and an internal collapsed-state mirror so the shell's render
//     logic (which renders the collapsed stub conditionally) can
//     respond to imperative collapse/expand calls.
//   - Renders `<ResizableHandle>` as a stub div.
interface MockPanelHandle {
  collapse: () => void;
  expand: () => void;
  isCollapsed: () => boolean;
  resize: (pct: number) => void;
}

interface MockGroupHandle {
  setLayout: (map: Record<string, number>) => void;
  getLastLayout: () => Record<string, number> | null;
}

const groupHandles: MockGroupHandle[] = [];
const lastSetLayoutCalls: Record<string, number>[] = [];

vi.mock("@/components/ui/resizable", () => {
  const MockResizablePanelGroup = ({
    children,
    className,
    id,
    groupRef,
  }: {
    children: React.ReactNode;
    className?: string;
    id?: string;
    // react-resizable-panels v4 accepts a Ref or RefObject.
    groupRef?: React.MutableRefObject<MockGroupHandle | null>;
  }) => {
    const lastLayoutRef = React.useRef<Record<string, number> | null>(null);
    const handle = React.useMemo<MockGroupHandle>(
      () => ({
        setLayout: (map) => {
          lastLayoutRef.current = map;
          lastSetLayoutCalls.push(map);
        },
        getLastLayout: () => lastLayoutRef.current,
      }),
      [],
    );
    React.useEffect(() => {
      if (groupRef && "current" in groupRef) {
        groupRef.current = handle;
      }
      groupHandles.push(handle);
      return () => {
        const i = groupHandles.indexOf(handle);
        if (i >= 0) groupHandles.splice(i, 1);
      };
    }, [groupRef, handle]);
    return (
      <div data-panel-group data-group-id={id} className={className}>
        {children}
      </div>
    );
  };

  const MockResizablePanel = ({
    id,
    panelRef,
    defaultSize,
    collapsedSize,
    onCollapse,
    onExpand,
    children,
    className,
    "data-pane-id": dataPaneId,
  }: {
    id?: string;
    panelRef?:
      | React.MutableRefObject<MockPanelHandle | null>
      | ((el: MockPanelHandle | null) => void);
    defaultSize?: number | string;
    collapsedSize?: number | string;
    onCollapse?: () => void;
    onExpand?: () => void;
    children?: React.ReactNode;
    className?: string;
    "data-pane-id"?: string;
  }) => {
    const [collapsed, setCollapsed] = React.useState(false);
    const handle = React.useMemo<MockPanelHandle>(
      () => ({
        collapse: () => {
          setCollapsed((prev) => {
            if (!prev) onCollapse?.();
            return true;
          });
        },
        expand: () => {
          setCollapsed((prev) => {
            if (prev) onExpand?.();
            return false;
          });
        },
        isCollapsed: () => collapsed,
        resize: (_pct: number) => {
          // Test-only: re-trigger the collapse / expand bit if the
          // simulated size crosses collapsedSize. Not exercised by
          // the current tests but kept symmetric with the real lib.
        },
      }),
      [collapsed, onCollapse, onExpand],
    );
    React.useEffect(() => {
      if (typeof panelRef === "function") {
        panelRef(handle);
        return () => panelRef(null);
      }
      if (panelRef && "current" in panelRef) {
        panelRef.current = handle;
      }
    }, [panelRef, handle]);
    return (
      <div
        data-panel
        data-pane-id={dataPaneId ?? id}
        data-default-size={defaultSize}
        data-collapsed-size={collapsedSize}
        data-collapsed={collapsed ? "true" : "false"}
        className={className}
      >
        {children}
      </div>
    );
  };

  const MockResizableHandle = ({ className }: { className?: string }) => (
    <div data-separator role="separator" className={className} />
  );

  return {
    __esModule: true,
    ResizablePanelGroup: MockResizablePanelGroup,
    ResizablePanel: MockResizablePanel,
    ResizableHandle: MockResizableHandle,
  };
});

// Capture @dnd-kit's onDragEnd callback so tests can fire synthetic
// drag-end events. We keep useDraggable / useDroppable real-ish (they
// just need to return harmless stubs) so the shell's JSX renders.
const dragEndHandlers: Array<(event: unknown) => void> = [];

vi.mock("@dnd-kit/core", () => {
  const DndContext = ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
  }) => {
    React.useEffect(() => {
      if (onDragEnd) {
        dragEndHandlers.push(onDragEnd);
        return () => {
          const i = dragEndHandlers.indexOf(onDragEnd);
          if (i >= 0) dragEndHandlers.splice(i, 1);
        };
      }
      return undefined;
    }, [onDragEnd]);
    return <div data-dnd-context>{children}</div>;
  };
  const PointerSensor = vi.fn();
  const useSensor = (s: unknown) => s;
  const useSensors = (...s: unknown[]) => s;
  return {
    __esModule: true,
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PatientProfileShell, {
  SHELL_SPACER_ID,
  getCollapsedSizePct,
  findAbsorber,
  buildShellLayoutMap,
} from "../Shell";
import type { PaneDefinition } from "@/lib/patient-profile/types";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePanes(): PaneDefinition[] {
  return [
    {
      id: "chart",
      title: "Patient chart",
      render: () => <div data-testid="pane-chart-body">chart</div>,
      naturalSizePct: 26,
      minSizePct: 16,
    },
    {
      id: "body",
      title: "Consultation",
      render: () => <div data-testid="pane-body-body">body</div>,
      naturalSizePct: 48,
      minSizePct: 28,
    },
    {
      id: "rx",
      title: "Prescription",
      render: () => <div data-testid="pane-rx-body">rx</div>,
      naturalSizePct: 26,
      minSizePct: 16,
    },
  ];
}

// Default storage key per test. We rotate keys so leakage between
// tests is impossible regardless of `localStorage.clear()` timing.
let storageKeyCounter = 0;
function nextStorageKey(): string {
  storageKeyCounter += 1;
  return `test:shell:${storageKeyCounter}`;
}

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("getCollapsedSizePct", () => {
  it("returns 3 when container width is zero", () => {
    expect(getCollapsedSizePct(0)).toBe(3);
  });
  it("returns 3 when container width is negative", () => {
    expect(getCollapsedSizePct(-100)).toBe(3);
  });
  it("returns 3 when container width is NaN", () => {
    expect(getCollapsedSizePct(NaN)).toBe(3);
  });
  it("returns 3.125 for a 1280px container (40 / 1280 * 100)", () => {
    // 40 / 1280 = 0.03125 → 3.125%
    expect(getCollapsedSizePct(1280)).toBeCloseTo(3.125, 5);
  });
  it("returns the floor (3) for very wide containers where the raw pct < 3", () => {
    // 40 / 4000 = 0.01 → 1% raw, clamped to 3%
    expect(getCollapsedSizePct(4000)).toBe(3);
  });
});

describe("findAbsorber", () => {
  const order = ["chart", "body", "rx"];
  it("returns the left expanded neighbour first (collapse rx → body)", () => {
    expect(
      findAbsorber("rx", order, { chart: false, body: false, rx: false }),
    ).toBe("body");
  });
  it("returns the only expanded pane when others are collapsed (collapse body → chart, both side-collapsed)", () => {
    // Collapse chart already → body collapses now → scan left finds chart (collapsed),
    // scan right finds rx (expanded) → returns rx.
    expect(
      findAbsorber("body", order, { chart: true, body: false, rx: false }),
    ).toBe("rx");
  });
  it("returns the spacer when no other pane is expanded", () => {
    expect(
      findAbsorber("rx", order, { chart: true, body: true, rx: false }),
    ).toBe(SHELL_SPACER_ID);
  });
  it("returns the spacer when the collapsing id is unknown", () => {
    expect(
      findAbsorber("ghost", order, { chart: false, body: false, rx: false }),
    ).toBe(SHELL_SPACER_ID);
  });
  it("scans left FIRST, not right (collapse body → chart preferred over rx)", () => {
    expect(
      findAbsorber("body", order, { chart: false, body: false, rx: false }),
    ).toBe("chart");
  });
});

describe("buildShellLayoutMap", () => {
  const baseInput = {
    paneOrder: ["chart", "body", "rx"],
    sizeById: { chart: 26, body: 48, rx: 26 },
    minSizeById: { chart: 16, body: 28, rx: 16 },
    collapsedSizePct: 3,
  };

  it("steady state — no collapse, no freed width, spacer at 0", () => {
    const map = buildShellLayoutMap({
      ...baseInput,
      collapsedById: { chart: false, body: false, rx: false },
      absorberId: "body",
      freedPct: 0,
    });
    expect(map.chart).toBe(26);
    expect(map.body).toBe(48);
    expect(map.rx).toBe(26);
    expect(map[SHELL_SPACER_ID]).toBe(0);
  });

  it("single collapse — absorber receives the freed budget; spacer stays at 0", () => {
    // Collapse chart (26%); body absorbs 26 - 3 = 23%.
    const map = buildShellLayoutMap({
      ...baseInput,
      collapsedById: { chart: true, body: false, rx: false },
      absorberId: "body",
      freedPct: 23,
    });
    expect(map.chart).toBe(3);
    expect(map.body).toBe(48 + 23);
    expect(map.rx).toBe(26);
    expect(map[SHELL_SPACER_ID]).toBe(0);
  });

  it("all-collapsed — every pane at collapsedSizePct, spacer absorbs the leftover", () => {
    const map = buildShellLayoutMap({
      ...baseInput,
      collapsedById: { chart: true, body: true, rx: true },
      absorberId: SHELL_SPACER_ID,
      freedPct: 26 + 48 + 26 - 3 * 3,
    });
    expect(map.chart).toBe(3);
    expect(map.body).toBe(3);
    expect(map.rx).toBe(3);
    // 100 - (3 + 3 + 3) = 91
    expect(map[SHELL_SPACER_ID]).toBe(91);
  });

  it("clamps absorber to minSize even if natural is 0", () => {
    const map = buildShellLayoutMap({
      ...baseInput,
      sizeById: { chart: 26, body: 0, rx: 26 },
      collapsedById: { chart: false, body: false, rx: false },
      absorberId: "body",
      freedPct: 0,
    });
    expect(map.body).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// Component render tests
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> render shape", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 3 content panes + 1 spacer panel (4 [data-pane-id] nodes)", () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    const panels = document.querySelectorAll("[data-pane-id]");
    expect(panels).toHaveLength(4);
    const ids = Array.from(panels).map((p) => p.getAttribute("data-pane-id"));
    expect(ids).toEqual(["chart", "body", "rx", SHELL_SPACER_ID]);
  });

  it("renders the column title for each non-collapsed pane", () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    expect(screen.getByText("Patient chart")).toBeInTheDocument();
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Prescription")).toBeInTheDocument();
  });

  it("renders the pane body via pane.render()", () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    expect(screen.getByTestId("pane-chart-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-rx-body")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Collapse via header chevron
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> collapse via header chevron", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("clicking 'Collapse Patient chart' calls setLayout with the absorber map", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    const chevron = screen.getByRole("button", {
      name: /collapse patient chart/i,
    });
    await act(async () => {
      fireEvent.click(chevron);
    });
    // The most recent setLayout call should pin chart to ~3% and
    // give body the freed budget.
    const lastCall = lastSetLayoutCalls[lastSetLayoutCalls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall.chart).toBeCloseTo(3, 1);
    // Body should be at least its natural + freed amount.
    expect(lastCall.body).toBeGreaterThan(48);
  });

  it("after collapse the header chevron is replaced by the default collapsed stub's expand chevron", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    const chevron = screen.getByRole("button", {
      name: /collapse patient chart/i,
    });
    await act(async () => {
      fireEvent.click(chevron);
    });
    // The collapsed pane no longer has a "Collapse" button — only an
    // "Expand" button (rendered by `<DefaultCollapsedStub>`).
    expect(
      screen.queryByRole("button", { name: /collapse patient chart/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand patient chart/i }),
    ).toBeInTheDocument();
  });

  it("clicking the expand chevron restores the natural layout", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /collapse patient chart/i }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /expand patient chart/i }),
      );
    });
    // After the expand, the most recent setLayout call should restore
    // chart to its natural size (26%) and body to natural (48%).
    const lastCall = lastSetLayoutCalls[lastSetLayoutCalls.length - 1];
    expect(lastCall.chart).toBeCloseTo(26, 1);
    expect(lastCall.body).toBeCloseTo(48, 1);
    expect(lastCall.rx).toBeCloseTo(26, 1);
  });
});

// ---------------------------------------------------------------------------
// All-collapsed sanity
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> all-collapsed sanity", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("collapsing every pane lands all three at ~collapsedSizePct and the spacer absorbs the rest", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /collapse patient chart/i }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /collapse consultation/i }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /collapse prescription/i }),
      );
    });
    const lastCall = lastSetLayoutCalls[lastSetLayoutCalls.length - 1];
    expect(lastCall).toBeDefined();
    // Every pane pinned at ~collapsedSizePct (3% on the test fallback).
    expect(lastCall.chart).toBeCloseTo(3, 1);
    expect(lastCall.body).toBeCloseTo(3, 1);
    expect(lastCall.rx).toBeCloseTo(3, 1);
    // Spacer absorbs the rest. Sum must total 100 within FP tolerance.
    const sum =
      lastCall.chart +
      lastCall.body +
      lastCall.rx +
      lastCall[SHELL_SPACER_ID];
    expect(sum).toBeCloseTo(100, 1);
    expect(lastCall[SHELL_SPACER_ID]).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Reorder via drag
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> reorder via drag-end", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("firing onDragEnd with body→rx swaps the two panes' order", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    expect(dragEndHandlers).toHaveLength(1);
    const onDragEnd = dragEndHandlers[0];
    await act(async () => {
      onDragEnd({
        active: { id: "pane-drag-body", data: { current: { paneId: "body" } } },
        over: { id: "pane-drop-rx", data: { current: { paneId: "rx" } } },
      });
    });
    // After the swap, the rendered DOM order should be chart, rx, body.
    const panels = document
      .querySelectorAll("[data-pane-id]");
    const ids = Array.from(panels).map((p) => p.getAttribute("data-pane-id"));
    expect(ids).toEqual(["chart", "rx", "body", SHELL_SPACER_ID]);
  });

  it("firing onDragEnd with no over (dropped on empty space) is a no-op", async () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    const onDragEnd = dragEndHandlers[0];
    await act(async () => {
      onDragEnd({
        active: { id: "pane-drag-body", data: { current: { paneId: "body" } } },
        over: null,
      });
    });
    const panels = document.querySelectorAll("[data-pane-id]");
    const ids = Array.from(panels).map((p) => p.getAttribute("data-pane-id"));
    expect(ids).toEqual(["chart", "body", "rx", SHELL_SPACER_ID]);
  });
});

// ---------------------------------------------------------------------------
// Persistence across re-mounts
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> persistence across re-mounts", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("a paneOrder change persisted via the hook survives unmount + remount under the same storageKey", async () => {
    const key = nextStorageKey();
    const { unmount } = render(
      <PatientProfileShell panes={makePanes()} storageKey={key} />,
    );
    await act(async () => {
      const onDragEnd = dragEndHandlers[0];
      onDragEnd({
        active: { id: "pane-drag-chart", data: { current: { paneId: "chart" } } },
        over: { id: "pane-drop-rx", data: { current: { paneId: "rx" } } },
      });
    });
    // Wait for the hook's 200ms debounce to flush to localStorage.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    unmount();

    // Re-mount under the same key — the order should now be
    // [rx, body, chart] (chart and rx swapped).
    render(
      <PatientProfileShell panes={makePanes()} storageKey={key} />,
    );
    const panels = document.querySelectorAll("[data-pane-id]");
    const ids = Array.from(panels).map((p) => p.getAttribute("data-pane-id"));
    expect(ids).toEqual(["rx", "body", "chart", SHELL_SPACER_ID]);
  });
});

// ---------------------------------------------------------------------------
// Mobile branch
// ---------------------------------------------------------------------------

describe("<PatientProfileShell> mobile branch (DL-11)", () => {
  beforeEach(() => {
    localStorage.clear();
    groupHandles.length = 0;
    lastSetLayoutCalls.length = 0;
    dragEndHandlers.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders panes stacked vertically without DndContext or panel group when viewport is below lg", () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey={nextStorageKey()}
      />,
    );
    expect(
      screen.getByTestId("patient-profile-shell-mobile"),
    ).toBeInTheDocument();
    // No spacer, no panel group, no DndContext on mobile.
    expect(document.querySelector("[data-panel-group]")).toBeNull();
    expect(document.querySelector("[data-dnd-context]")).toBeNull();
    expect(
      document.querySelector(`[data-pane-id="${SHELL_SPACER_ID}"]`),
    ).toBeNull();
    // All three panes still render.
    expect(screen.getByTestId("pane-chart-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-rx-body")).toBeInTheDocument();
  });
});
