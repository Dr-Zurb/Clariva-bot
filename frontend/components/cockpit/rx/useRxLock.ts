"use client";

import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  canEditPrescriptionDraft,
  type CockpitState,
} from "@/lib/patient-profile/state";

/**
 * Rx content/preference lock (rxl-01).
 *
 * Phase 1 reads {@link CockpitState}. rxl-06 swaps this module's input for the
 * attest stamp — callers keep using {@link useRxLock} / {@link useRxSectionLock}.
 *
 * Fail-closed: {@link resolveRxLock} with no input locks clinical content.
 * Isolated tests without a provider stay editable via {@link useRxSectionLock}.
 */

export type RxLockInput = {
  /**
   * Cockpit visit state. `undefined` + `standalone: false` fails closed.
   * `standalone: true` (non-cockpit PrescriptionForm) stays editable.
   */
  cockpitState?: CockpitState;
  /**
   * rxl-07 — whether the form's current note is closed.
   * `false` (draft or unminted continuation) unlocks content even on an
   * ended visit. `true` locks. `undefined` keeps the Phase 1 visit-status
   * fallback (loading / historical).
   */
  noteClosed?: boolean;
  /** In-call / standalone mount — no visit state, content stays editable. */
  standalone?: boolean;
  /** In-flight send (not autosave). Content freeze only. */
  saving?: boolean;
};

export type RxLock = {
  /** Clinical fields, templates, clear-all. */
  contentLocked: boolean;
  /** Section order / collapse / hidden sets. Always false in Phase 1 (RXL-Q3). */
  prefsLocked: boolean;
};

export function resolveRxLock(input: RxLockInput | undefined): RxLock {
  if (input == null) {
    return { contentLocked: true, prefsLocked: false };
  }

  if (input.standalone) {
    return { contentLocked: Boolean(input.saving), prefsLocked: false };
  }

  if (input.noteClosed === false) {
    return { contentLocked: Boolean(input.saving), prefsLocked: false };
  }

  if (input.noteClosed === true) {
    return { contentLocked: true, prefsLocked: false };
  }

  if (input.cockpitState == null) {
    return { contentLocked: true, prefsLocked: false };
  }

  const visitLocked = !canEditPrescriptionDraft(input.cockpitState);
  return {
    contentLocked: visitLocked || Boolean(input.saving),
    prefsLocked: false,
  };
}

const RxLockContext = createContext<RxLockInput | undefined>(undefined);

export function RxLockProvider({
  cockpitState,
  noteClosed,
  standalone,
  saving = false,
  children,
}: RxLockInput & { children: ReactNode }): JSX.Element {
  const parent = useContext(RxLockContext);
  const value = useMemo((): RxLockInput => {
    return {
      cockpitState: cockpitState ?? parent?.cockpitState,
      // Nested PrescriptionForm provider omits noteClosed — inherit rxl-07.
      noteClosed: noteClosed ?? parent?.noteClosed,
      standalone: standalone ?? parent?.standalone ?? false,
      saving,
    };
  }, [cockpitState, noteClosed, standalone, saving, parent]);
  return createElement(RxLockContext.Provider, { value }, children);
}

/** Raw lock from the nearest provider. No provider → fail closed. */
export function useRxLock(): RxLock {
  return resolveRxLock(useContext(RxLockContext));
}

/**
 * Section helper: parent `disabled` ORs with the visit lock.
 * No provider → honour `disabledProp` only so isolated section tests stay editable.
 */
export function useRxSectionLock(disabledProp = false): RxLock {
  const input = useContext(RxLockContext);
  if (input === undefined) {
    return { contentLocked: disabledProp, prefsLocked: false };
  }
  const resolved = resolveRxLock(input);
  return {
    contentLocked: disabledProp || resolved.contentLocked,
    prefsLocked: resolved.prefsLocked,
  };
}
