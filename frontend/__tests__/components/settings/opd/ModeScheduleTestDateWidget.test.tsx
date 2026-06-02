/**
 * ModeScheduleTestDateWidget — debounced API lookup.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import * as api from '@/lib/api';
import { ModeScheduleTestDateWidget } from '@/components/settings/doctor/opd/ModeScheduleTestDateWidget';

describe('ModeScheduleTestDateWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'previewResolveModeForDate').mockResolvedValue({
      success: true,
      data: { date: '2026-05-20', mode: 'queue', source: 'policy' },
      meta: { timestamp: '', requestId: 'test' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls previewResolveModeForDate after 300ms and shows readout', async () => {
    render(<ModeScheduleTestDateWidget token="tok" />);
    fireEvent.change(screen.getByLabelText('Date to test'), {
      target: { value: '2026-05-20' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(api.previewResolveModeForDate).toHaveBeenCalledWith('tok', '2026-05-20');
    expect(screen.getByText('queue')).toBeInTheDocument();
    expect(screen.getByText(/\(from policy\)/)).toBeInTheDocument();
  });

  it('does not call API for invalid date', async () => {
    render(<ModeScheduleTestDateWidget token="tok" />);
    fireEvent.change(screen.getByLabelText('Date to test'), { target: { value: '2026-05' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(api.previewResolveModeForDate).not.toHaveBeenCalled();
  });

  it('shows error when API fails', async () => {
    vi.mocked(api.previewResolveModeForDate).mockRejectedValue(new Error('Lookup failed'));
    render(<ModeScheduleTestDateWidget token="tok" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Lookup failed');
  });
});
