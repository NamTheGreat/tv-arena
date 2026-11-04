import { useMemo } from 'react';
import { SeriesItem } from './supabase';
import { getEndlessDeck } from './endlessGame';

export type EndlessDeckFilter = 'all' | 'streaming' | 'classics' | 'scifi';

export function useEndlessGame(seriesList: SeriesItem[], deckFilter: EndlessDeckFilter) {
  const endlessDeck = useMemo(() => {
    const filtered = seriesList.filter((show) => {
      if (deckFilter === 'streaming') {
        return ['Netflix', 'Apple TV+', 'HBO', 'FX / Hulu', 'Prime Video', 'Disney+'].some((network) =>
          show.network.includes(network)
        );
      }
      if (deckFilter === 'classics') {
        const year = Number.parseInt(show.release_years.slice(0, 4), 10);
        return (!Number.isNaN(year) && year <= 2018) ||
          ['The Sopranos', 'The Wire', 'Breaking Bad', 'Mad Men', 'Friends', 'The Office'].includes(show.title);
      }
      if (deckFilter === 'scifi') {
        return ['Sci-Fi', 'Mystery', 'Animation'].some((genre) => show.genre_group.includes(genre));
      }
      return true;
    });
    return getEndlessDeck(filtered);
  }, [seriesList, deckFilter]);

  return endlessDeck;
}
