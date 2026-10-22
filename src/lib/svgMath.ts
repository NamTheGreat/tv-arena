export interface SvgPoint {
  x: number;
  y: number;
  value: number;
}

export function formatMetricNumber(val: number): string {
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return (m >= 10 ? m.toFixed(1) : m.toFixed(2)) + 'M';
  }
  if (val >= 1_000) {
    return Math.round(val / 1_000) + 'K';
  }
  return val.toLocaleString();
}

export function calculateNiceMaxScale(maxValue: number): number {
  if (maxValue <= 0) return 400_000;
  if (maxValue > 800_000) {
    return Math.ceil((maxValue * 1.05) / 400_000) * 400_000;
  }
  if (maxValue > 100_000) {
    return Math.ceil((maxValue * 1.05) / 50_000) * 50_000;
  }
  if (maxValue > 10_000) {
    return Math.ceil((maxValue * 1.05) / 10_000) * 10_000;
  }
  return Math.max(1_000, Math.ceil((maxValue * 1.1) / 1_000) * 1_000);
}

export function sampleDailyValues(
  dailyValues: number[],
  range: '7D' | '30D' | '90D' | 'All-Time'
): number[] {
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : Math.max(7, dailyValues.length);
  const window = dailyValues.slice(-days);
  if (window.length <= 7) {
    return window;
  }
  // Divide into 7 buckets and compute average per bucket to preserve spikes across multi-week views
  const bucketSize = window.length / 7;
  const sampled: number[] = [];
  for (let b = 0; b < 7; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(window.length, Math.floor((b + 1) * bucketSize));
    const slice = window.slice(start, Math.max(start + 1, end));
    const avg = Math.round(slice.reduce((acc, v) => acc + v, 0) / slice.length);
    sampled.push(avg);
  }
  return sampled;
}

export function buildChartGeometry(dailyValues: number[], maxScale = 1600000): {
  pathD: string;
  points: SvgPoint[];
} {
  const X_START = 85;
  const X_STEP = 145; // 85, 230, 375, 520, 665, 810, 955
  const Y_ZERO = 340;
  const Y_SPAN = 300; // Y=340 (0) to Y=40 (maxScale)

  // Take the latest up-to-7 points without injecting fake zero padding
  const recentValues = dailyValues.slice(-7);
  if (recentValues.length === 0) {
    return { pathD: '', points: [] };
  }

  const startIdx = 7 - recentValues.length;
  const safeScale = Math.max(1, maxScale);
  const points: SvgPoint[] = recentValues.map((value, i) => {
    const gridIdx = startIdx + i;
    const x = X_START + gridIdx * X_STEP;
    const ratio = Math.min(1, Math.max(0, value / safeScale));
    const y = Math.round(Y_ZERO - ratio * Y_SPAN);
    return { x, y, value };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');
  return { pathD, points };
}

export function buildMobileChartGeometry(dailyValues: number[], maxScale = 1600000): {
  pathD: string;
  points: SvgPoint[];
} {
  const X_START = 35;
  const X_STEP = 49; // 35, 84, 133, 182, 231, 280, 329
  const Y_ZERO = 162;
  const Y_SPAN = 142; // Y=162 (0) to Y=20 (maxScale)

  // Take the latest up-to-7 points without injecting fake zero padding
  const recentValues = dailyValues.slice(-7);
  if (recentValues.length === 0) {
    return { pathD: '', points: [] };
  }

  const startIdx = 7 - recentValues.length;
  const safeScale = Math.max(1, maxScale);
  const points: SvgPoint[] = recentValues.map((value, i) => {
    const gridIdx = startIdx + i;
    const x = X_START + gridIdx * X_STEP;
    const ratio = Math.min(1, Math.max(0, value / safeScale));
    const y = Math.round(Y_ZERO - ratio * Y_SPAN);
    return { x, y, value };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');
  return { pathD, points };
}

/**
 * Maps an event date into the horizontal X coordinate of the trajectory chart.
 * Returns null if the event date is strictly outside the visible [startDate, endDate] window.
 *
 * Desktop chart span: X_START=85, X_STEP=145, 7 buckets => span from 85 to 955 (870 px)
 * Mobile chart span: X_START=35, X_STEP=49, 7 buckets => span from 35 to 329 (294 px)
 */
export function calculateEventX(
  eventDate: string | Date,
  startDate: string | Date,
  endDate: string | Date,
  isMobile = false
): number | null {
  const parseToMs = (d: string | Date): number => {
    if (typeof d === 'string') {
      const parts = d.split('T')[0].split('-');
      if (parts.length === 3) {
        return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }
    const dt = new Date(d);
    return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  };

  const eventMs = parseToMs(eventDate);
  const startMs = parseToMs(startDate);
  const endMs = parseToMs(endDate);

  if (isNaN(eventMs) || isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return null;
  }

  // Event must fall strictly within the visible window
  if (eventMs < startMs || eventMs > endMs) {
    return null;
  }

  const ratio = (eventMs - startMs) / (endMs - startMs);

  if (isMobile) {
    const X_START = 35;
    const X_SPAN = 294; // 35 -> 329
    return Math.round(X_START + ratio * X_SPAN);
  } else {
    const X_START = 85;
    const X_SPAN = 870; // 85 -> 955
    return Math.round(X_START + ratio * X_SPAN);
  }
}
