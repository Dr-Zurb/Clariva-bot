/**
 * command-registry — unit tests (Vitest + RTL).
 *
 * Run: `pnpm --filter frontend test lib/patient-profile/__tests__/command-registry.test.ts`
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  registerCommand,
  listCommands,
  executeCommand,
  useCommands,
  type CommandDefinition,
} from "../command-registry";

function makeCmd(
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    id: "test-cmd",
    label: "Test Command",
    action: vi.fn(),
    ...overrides,
  };
}

describe("command-registry", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    vi.clearAllMocks();
  });

  it("register → list returns the cmd", () => {
    const cmd = makeCmd();
    cleanups.push(registerCommand(cmd));

    expect(listCommands()).toEqual([cmd]);
  });

  it("unregister (via returned cleanup) → list returns empty", () => {
    const cmd = makeCmd();
    const unregister = registerCommand(cmd);

    unregister();

    expect(listCommands()).toEqual([]);
  });

  it("useCommands re-renders on register / unregister", () => {
    const { result } = renderHook(() => useCommands());

    expect(result.current).toEqual([]);

    let unregister!: () => void;
    act(() => {
      unregister = registerCommand(makeCmd({ id: "plan-add", label: "Add medicine" }));
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.id).toBe("plan-add");

    act(() => {
      unregister();
    });

    expect(result.current).toEqual([]);
  });

  it("executeCommand runs the action", () => {
    const action = vi.fn();
    const cmd = makeCmd({ id: "send-rx", action });
    cleanups.push(registerCommand(cmd));

    executeCommand("send-rx");

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("executeCommand no-ops if enabled() returns false", () => {
    const action = vi.fn();
    const cmd = makeCmd({
      id: "send-rx",
      action,
      enabled: () => false,
    });
    cleanups.push(registerCommand(cmd));

    executeCommand("send-rx");

    expect(action).not.toHaveBeenCalled();
  });

  it("executeCommand no-ops if id unknown", () => {
    const action = vi.fn();
    cleanups.push(registerCommand(makeCmd({ id: "known", action })));

    executeCommand("unknown-id");

    expect(action).not.toHaveBeenCalled();
  });
});
