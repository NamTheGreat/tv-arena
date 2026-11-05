import { SeriesItem } from './supabase';

export interface ComparisonDay {
  date: string;
  left: number | null;
  right: number | null;
}

export function compareLast30Days(leftShow: SeriesItem, rightShow: SeriesItem) {
  const toDateMap = (show: SeriesItem) => {
    const values = new Map<string, number>();
    for (let i = 0; i < Math.min(show.daily_dates?.length || 0, show.daily_series.length); i++) {
      const date = show.daily_dates?.[i];
      const value = show.daily_series[i];
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) values.set(date, value);
    }
    return values;
  };

  const left = toDateMap(leftShow);
  const right = toDateMap(rightShow);
  const availableDates = [...left.keys(), ...right.keys()].sort();
  const latestDate = availableDates[availableDates.length - 1];
  if (!latestDate) return { days: [] as ComparisonDay[], leftLeads: 0, rightLeads: 0, comparableDays: 0 };

  const endDate = new Date(`${latestDate}T00:00:00Z`);
  const days: ComparisonDay[] = [];
  for (let offset = 29; offset >= 0; offset--) {
    const date = new Date(endDate);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, left: left.get(key) ?? null, right: right.get(key) ?? null });
  }

  const comparable = days.filter((day) => day.left !== null && day.right !== null);
  return {
    days,
    leftLeads: comparable.filter((day) => (day.left as number) > (day.right as number)).length,
    rightLeads: comparable.filter((day) => (day.right as number) > (day.left as number)).length,
    comparableDays: comparable.length,
  };
}

export function buildComparisonPath(days: ComparisonDay[], side: 'left' | 'right', maxValue: number): string {
  const commands: string[] = [];
  let drawing = false;
  days.forEach((day, index) => {
    const value = day[side];
    if (value === null) {
      drawing = false;
      return;
    }
    const x = 20 + index * (760 / Math.max(days.length - 1, 1));
    const y = 90 - (value / Math.max(maxValue, 1)) * 75;
    commands.push(`${drawing ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    drawing = true;
  });
  return commands.join(' ');
}
