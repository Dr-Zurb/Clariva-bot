/**
 * RxSectionNav — unit tests (Vitest + RTL).
 *
 * Run: `vitest run frontend/components/consultation/cockpit/__tests__/RxSectionNav.test.tsx`
 *
 * Covers:
 *   - Renders a nav landmark with one button per section.
 *   - Click a button → calls scrollIntoView on the corresponding section element.
 *   - Active section button has the primary styling class.
 *   - Count label: shows "(N)" only when count > 0, never shows "(0)".
 */

import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { RxSectionNav } from "../RxSectionNav";

// ---------------------------------------------------------------------------
// Mock IntersectionObserver (not available in jsdom)
// ---------------------------------------------------------------------------

const observeMock = vi.fn();
const unobserveMock = vi.fn();
const disconnectMock = vi.fn();

const IntersectionObserverMock = vi.fn((callback: IntersectionObserverCallback) => ({
  observe: observeMock,
  unobserve: unobserveMock,
  disconnect: disconnectMock,
  takeRecords: () => [],
  root: null,
  rootMargin: '',
  thresholds: [],
  _callback: callback,
}));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  observeMock.mockClear();
  unobserveMock.mockClear();
  disconnectMock.mockClear();
  IntersectionObserverMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECTIONS = [
  { id: 'rx-symptoms', label: 'Symptoms' },
  { id: 'rx-diagnosis', label: 'Diagnosis' },
  { id: 'rx-medicines', label: 'Medicines', count: 3 },
  { id: 'rx-notes', label: 'Notes' },
];

function makeScrollContainer() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function makeSectionElements(container: HTMLElement, ids: string[]) {
  ids.forEach((id) => {
    const section = document.createElement('section');
    section.id = id;
    section.scrollIntoView = vi.fn();
    container.appendChild(section);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RxSectionNav', () => {
  it('renders a nav landmark with one button per section', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    render(
      <RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />,
    );
    expect(screen.getByRole('navigation', { name: 'Prescription sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(SECTIONS.length);
  });

  it('renders section labels correctly', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);
    expect(screen.getByRole('button', { name: 'Symptoms' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diagnosis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medicines (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notes' })).toBeInTheDocument();
  });

  it('does not show "(0)" count — omits count when count is 0', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    const sections = [{ id: 'rx-medicines', label: 'Medicines', count: 0 }];
    render(<RxSectionNav sections={sections} scrollContainerRef={ref} />);
    expect(screen.getByRole('button', { name: 'Medicines' })).toBeInTheDocument();
    expect(screen.queryByText('(0)')).not.toBeInTheDocument();
  });

  it('shows positive count in the chip label', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    const sections = [{ id: 'rx-medicines', label: 'Medicines', count: 5 }];
    render(<RxSectionNav sections={sections} scrollContainerRef={ref} />);
    expect(screen.getByRole('button', { name: 'Medicines (5)' })).toBeInTheDocument();
  });

  it('clicking a chip calls scrollIntoView on the target section element', () => {
    const container = makeScrollContainer();
    makeSectionElements(container, SECTIONS.map((s) => s.id));

    const ref = { current: container } as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);

    fireEvent.click(screen.getByRole('button', { name: 'Diagnosis' }));

    const target = container.querySelector('#rx-diagnosis') as HTMLElement;
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });

    // Clean up
    document.body.removeChild(container);
  });

  it('clicking a chip for a missing section element is a no-op (does not throw)', () => {
    const container = makeScrollContainer();
    // Only create one section; the others are missing
    makeSectionElements(container, ['rx-symptoms']);

    const ref = { current: container } as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);

    // 'Diagnosis' section is not in the DOM — should not throw
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Diagnosis' }));
    }).not.toThrow();

    document.body.removeChild(container);
  });

  it('first section chip is active by default (has bg-primary class)', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);
    const firstButton = screen.getByRole('button', { name: 'Symptoms' });
    expect(firstButton.className).toContain('bg-primary');
  });

  it('inactive chips do not have the bg-primary class', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);
    const inactiveButton = screen.getByRole('button', { name: 'Diagnosis' });
    expect(inactiveButton.className).not.toContain('bg-primary');
  });

  it('all chips are keyboard-focusable buttons', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLElement | null>;
    render(<RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />);
    screen.getAllByRole('button').forEach((btn) => {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).not.toHaveAttribute('disabled');
    });
  });

  it('disconnects IntersectionObserver on unmount', () => {
    const container = makeScrollContainer();
    const ref = { current: container } as React.RefObject<HTMLElement | null>;
    const { unmount } = render(
      <RxSectionNav sections={SECTIONS} scrollContainerRef={ref} />,
    );
    unmount();
    expect(disconnectMock).toHaveBeenCalled();
    document.body.removeChild(container);
  });
});
