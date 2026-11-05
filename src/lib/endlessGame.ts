import { SeriesItem } from './supabase';

export function getEndlessDeck(seriesList: SeriesItem[]): SeriesItem[] {
  const eligible = seriesList.filter((show) => show.buzz_score > 0 && (show.daily_dates?.length || 0) >= 7);
  const counts = new Map<number, number>();
  for (const show of eligible) counts.set(show.buzz_score, (counts.get(show.buzz_score) || 0) + 1);
  return eligible.filter((show) => counts.get(show.buzz_score) === 1);
}

export function shuffledIndexes(length: number, random = Math.random): number[] {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

export function drawNextEndlessIndex(
  bag: number[],
  deckLength: number,
  currentIndex: number,
  random = Math.random
): { index: number; bag: number[] } {
  let nextBag = bag.filter((index) => index !== currentIndex);
  if (nextBag.length === 0) {
    nextBag = shuffledIndexes(deckLength, random).filter((index) => index !== currentIndex);
  }
  return { index: nextBag[0] ?? -1, bag: nextBag.slice(1) };
}
