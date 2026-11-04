import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export function useWatchlist(userId?: string) {
  const [seriesIds, setSeriesIds] = useState<string[]>([]);
  const [pendingSeriesIds, setPendingSeriesIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeUserId = useRef(userId);
  activeUserId.current = userId;

  useEffect(() => {
    let active = true;
    setSeriesIds([]);
    setPendingSeriesIds([]);
    setError(null);

    if (!userId || !supabase) {
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('user_watchlist')
          .select('series_id')
          .eq('user_id', userId);
        if (!active) return;
        if (queryError) {
          setError('Could not load your watchlist.');
          return;
        }
        setSeriesIds(data.map((row) => row.series_id));
      } catch {
        if (active) setError('Could not load your watchlist.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const toggle = useCallback(async (seriesId: string) => {
    if (!userId || !supabase || pendingSeriesIds.includes(seriesId)) return;

    const isSaved = seriesIds.includes(seriesId);
    setPendingSeriesIds((previous) => [...previous, seriesId]);
    setError(null);
    try {
      const result = isSaved
        ? await supabase
            .from('user_watchlist')
            .delete()
            .eq('user_id', userId)
            .eq('series_id', seriesId)
        : await supabase.from('user_watchlist').insert({ user_id: userId, series_id: seriesId });

      if (result.error) {
        if (activeUserId.current === userId) setError('Could not update your watchlist.');
        return;
      }
      if (activeUserId.current === userId) {
        setSeriesIds((previous) => (
          isSaved ? previous.filter((id) => id !== seriesId) : [...previous, seriesId]
        ));
      }
    } catch {
      if (activeUserId.current === userId) setError('Could not update your watchlist.');
    } finally {
      if (activeUserId.current === userId) {
        setPendingSeriesIds((previous) => previous.filter((id) => id !== seriesId));
      }
    }
  }, [pendingSeriesIds, seriesIds, userId]);

  return { seriesIds, pendingSeriesIds, isLoading, error, toggle };
}
