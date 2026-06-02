/**
 * ModeScheduleEditor — render and save/discard behaviour.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ModeScheduleEditor } from '@/components/settings/doctor/opd/ModeScheduleEditor';
import type { ModeSchedule } from '@/types/doctor-settings';

vi.mock('@/components/settings/doctor/opd/ModeScheduleTestDateWidget', () => ({
  ModeScheduleTestDateWidget: () => <div data-testid="test-date-widget" />,
}));

const emptySchedule: ModeSchedule = {};

const populatedSchedule: ModeSchedule = {
  default_mode: 'queue',
  weekly_overrides: { tue: 'slot' },
  date_range_overrides: [{ from: '2026-06-01', to: '2026-06-07', mode: 'queue' }],
  date_overrides: [{ date: '2026-06-15', mode: 'slot' }],
};

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof ModeScheduleEditor>> = {}
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const props: React.ComponentProps<typeof ModeScheduleEditor> = {
    token: 'test-token',
    initialSchedule: emptySchedule,
    currentOpdModeColumn: 'slot',
    onSave,
    saving: false,
    ...overrides,
  };
  const view = render(<ModeScheduleEditor {...props} />);
  return { ...view, onSave, props };
}

describe('ModeScheduleEditor', () => {
  it('renders sub-editors with empty schedule', () => {
    renderEditor();
    expect(screen.getByText('Mode schedule')).toBeInTheDocument();
    expect(screen.getByText('Default mode')).toBeInTheDocument();
    expect(screen.getByText('Weekly overrides')).toBeInTheDocument();
    expect(screen.getByText('Date-range overrides')).toBeInTheDocument();
    expect(screen.getByText('Single-date overrides')).toBeInTheDocument();
    expect(screen.getByTestId('test-date-widget')).toBeInTheDocument();
  });

  it('renders populated schedule values', () => {
    renderEditor({ initialSchedule: populatedSchedule });
    expect(screen.getByDisplayValue('2026-06-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-06-15')).toBeInTheDocument();
  });

  it('disables Save until dirty', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Queue mode/i }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Discard reverts to initialSchedule', () => {
    renderEditor({ initialSchedule: { default_mode: 'slot' } });
    fireEvent.click(screen.getByRole('radio', { name: /Queue mode/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
