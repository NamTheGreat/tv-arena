import { SeriesItem } from './supabase';

export function findSimilarShows(show: SeriesItem, seriesList: SeriesItem[]): SeriesItem[] {
  return seriesList
    .filter((candidate) => candidate.slug !== show.slug
      && (candidate.network === show.network || candidate.genre_group === show.genre_group))
    .sort((a, b) => Math.abs(a.buzz_score - show.buzz_score) - Math.abs(b.buzz_score - show.buzz_score)
      || a.title.localeCompare(b.title))
    .slice(0, 3);
}
