/**
 * ModeScheduleDateRangeEditor — add, edit, delete, drag, PD-Q8 advisory.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ModeScheduleDateRangeEditor } from '@/components/settings/doctor/opd/ModeScheduleDateRangeEditor';
import type { ModeScheduleDateRangeOverride } from '@/types/doctor-settings';

let capturedOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null =
  null;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: typeof capturedOnDragEnd;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return <div data-testid="dnd-context">{children}</div>;
    },
  };
});

describe('ModeScheduleDateRangeEditor', () => {
  it('add row grows the list', () => {
    const onChange = vi.fn();
    render(<ModeScheduleDateRangeEditor value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add range' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'slot', from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      ])
    );
  });

  it('edit row fires onChange with updated row', () => {
    const rows: ModeScheduleDateRangeOverride[] = [
      { from: '2026-06-01', to: '2026-06-07', mode: 'slot' },
    ];
    const onChange = vi.fn();
    render(<ModeScheduleDateRangeEditor value={rows} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Range start date'), {
      target: { value: '2026-07-01' },
    });
    expect(onChange).toHaveBeenCalledWith([{ from: '2026-07-01', to: '2026-06-07', mode: 'slot' }]);
  });

  it('delete row shrinks the list', () => {
    const rows: ModeScheduleDateRangeOverride[] = [
      { from: '2026-06-01', to: '2026-06-07', mode: 'slot' },
    ];
    const onChange = vi.fn();
    render(<ModeScheduleDateRangeEditor value={rows} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Delete row'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('drag reorders via arrayMove', () => {
    capturedOnDragEnd = null;
    const rows: ModeScheduleDateRangeOverride[] = [
      { from: '2026-06-01', to: '2026-06-03', mode: 'slot' },
      { from: '2026-06-10', to: '2026-06-12', mode: 'queue' },
    ];
    const onChange = vi.fn();
    render(<ModeScheduleDateRangeEditor value={rows} onChange={onChange} />);
    expect(capturedOnDragEnd).toBeTruthy();
    capturedOnDragEnd!({ active: { id: 'range-0' }, over: { id: 'range-1' } });
    expect(onChange).toHaveBeenCalledWith([
      { from: '2026-06-10', to: '2026-06-12', mode: 'queue' },
      { from: '2026-06-01', to: '2026-06-03', mode: 'slot' },
    ]);
  });

  it('shows PD-Q8 advisory when from is in the past', () => {
    const rows: ModeScheduleDateRangeOverride[] = [
      { from: '2020-01-01', to: '2026-12-31', mode: 'queue' },
    ];
    render(<ModeScheduleDateRangeEditor value={rows} onChange={vi.fn()} />);
    expect(screen.getByText(/This rule starts in the past/)).toBeInTheDocument();
  });
});
