import { SeriesItem } from '../lib/supabase';
import { ChartRange } from './trajectoryChartTypes';

export function getCumulativeScore(show: SeriesItem, range: ChartRange): number {
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : show.daily_series.length;
  const values = show.daily_series.slice(-days);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : show.buzz_score;
}
