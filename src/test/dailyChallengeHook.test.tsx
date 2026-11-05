import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDailyChallenge } from '../lib/useDailyChallenge';

afterEach(() => vi.useRealTimers());

describe('useDailyChallenge date lifecycle', () => {
  it('refreshes UTC dates while idle and freezes the active run date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T23:59:00.000Z'));
    const { result, rerender } = renderHook(({ active }) => useDailyChallenge(active), {
      initialProps: { active: false },
    });
    expect(result.current.todayStr).toBe('2026-11-04');

    vi.setSystemTime(new Date('2026-11-05T00:00:01.000Z'));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.todayStr).toBe('2026-11-05');

    rerender({ active: true });
    vi.setSystemTime(new Date('2026-11-06T00:00:01.000Z'));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.todayStr).toBe('2026-11-05');
  });
});
