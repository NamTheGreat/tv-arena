import { SeriesItem } from './supabase';

export function findSimilarShows(show: SeriesItem, seriesList: SeriesItem[]): SeriesItem[] {
  return seriesList
    .filter((candidate) => candidate.slug !== show.slug
      && ((show.network_group !== 'Other' && candidate.network_group === show.network_group)
        || candidate.genre_group === show.genre_group))
    .sort((a, b) => Math.abs(a.buzz_score - show.buzz_score) - Math.abs(b.buzz_score - show.buzz_score)
      || a.title.localeCompare(b.title))
    .slice(0, 3);
}
