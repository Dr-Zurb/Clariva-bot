import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RxLockProvider,
  resolveRxLock,
  useRxLock,
  useRxSectionLock,
} from "@/components/cockpit/rx/useRxLock";

describe("resolveRxLock", () => {
  it("fails closed when nothing is wired", () => {
    expect(resolveRxLock(undefined)).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
  });

  it("fails closed when cockpit state is missing and the mount is not standalone", () => {
    expect(resolveRxLock({})).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
  });

  it("keeps standalone mounts editable, except while sending", () => {
    expect(resolveRxLock({ standalone: true })).toEqual({
      contentLocked: false,
      prefsLocked: false,
    });
    expect(resolveRxLock({ standalone: true, saving: true })).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
  });

  it("locks content on ended/terminal and leaves prefs unlocked", () => {
    expect(resolveRxLock({ cockpitState: "ended" })).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
    expect(resolveRxLock({ cockpitState: "terminal" })).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
  });

  it("keeps live/wrap_up/ready/lobby editable", () => {
    for (const cockpitState of ["ready", "lobby", "live", "wrap_up"] as const) {
      expect(resolveRxLock({ cockpitState })).toEqual({
        contentLocked: false,
        prefsLocked: false,
      });
    }
  });
});

function LockProbe() {
  const { contentLocked } = useRxLock();
  return (
    <input aria-label="probe" disabled={contentLocked} />
  );
}

function SectionProbe({ disabled = false }: { disabled?: boolean }) {
  const { contentLocked } = useRxSectionLock(disabled);
  return <input aria-label="section-probe" disabled={contentLocked} />;
}

describe("useRxLock", () => {
  it("renders a section read-only when the hook is used with no provider", () => {
    render(<LockProbe />);
    expect(screen.getByLabelText("probe")).toBeDisabled();
  });

  it("locks through the provider on an ended visit", () => {
    render(
      <RxLockProvider cockpitState="ended">
        <LockProbe />
      </RxLockProvider>,
    );
    expect(screen.getByLabelText("probe")).toBeDisabled();
  });
});

describe("useRxSectionLock", () => {
  it("stays editable in isolation so existing section tests keep working", () => {
    render(<SectionProbe />);
    expect(screen.getByLabelText("section-probe")).not.toBeDisabled();
  });

  it("honours an explicit disabled prop without a provider", () => {
    render(<SectionProbe disabled />);
    expect(screen.getByLabelText("section-probe")).toBeDisabled();
  });

  it("locks when the provider says the visit has ended", () => {
    render(
      <RxLockProvider cockpitState="ended">
        <SectionProbe />
      </RxLockProvider>,
    );
    expect(screen.getByLabelText("section-probe")).toBeDisabled();
  });

  it("inherits noteClosed from a parent provider (rxl-19)", () => {
    render(
      <RxLockProvider cockpitState="ended" noteClosed={false}>
        <RxLockProvider cockpitState="ended" saving={false}>
          <SectionProbe />
        </RxLockProvider>
      </RxLockProvider>,
    );
    expect(screen.getByLabelText("section-probe")).not.toBeDisabled();
  });
});
