import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: mockClient }));

import { useWatchlist } from '../lib/useWatchlist';

describe('useWatchlist', () => {
  const selectEq = vi.fn();
  const insert = vi.fn();
  const deleteSeriesEq = vi.fn();
  const deleteUserEq = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    selectEq.mockResolvedValue({ data: [{ series_id: 'show-1' }], error: null });
    insert.mockResolvedValue({ error: null });
    deleteSeriesEq.mockResolvedValue({ error: null });
    deleteUserEq.mockReturnValue({ eq: deleteSeriesEq });
    mockClient.from.mockReturnValue({
      select: () => ({ eq: selectEq }),
      insert,
      delete: () => ({ eq: deleteUserEq }),
    });
  });

  it('loads and changes only the signed-in user’s watchlist', async () => {
    const { result } = renderHook(() => useWatchlist('user-1'));

    await waitFor(() => expect(result.current.seriesIds).toEqual(['show-1']));
    expect(mockClient.from).toHaveBeenCalledWith('user_watchlist');
    expect(selectEq).toHaveBeenCalledWith('user_id', 'user-1');

    await act(async () => result.current.toggle('show-2'));
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', series_id: 'show-2' });
    expect(result.current.seriesIds).toContain('show-2');

    await act(async () => result.current.toggle('show-1'));
    expect(deleteUserEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteSeriesEq).toHaveBeenCalledWith('series_id', 'show-1');
    expect(result.current.seriesIds).toEqual(['show-2']);
  });

  it('keeps the saved list unchanged when a write fails', async () => {
    insert.mockResolvedValueOnce({ error: new Error('denied') });
    const { result } = renderHook(() => useWatchlist('user-1'));
    await waitFor(() => expect(result.current.seriesIds).toEqual(['show-1']));

    await act(async () => result.current.toggle('show-2'));

    expect(result.current.seriesIds).toEqual(['show-1']);
    expect(result.current.error).toBe('Could not update your watchlist.');
  });
});
