import { describe, it, expect } from 'vitest';
import {
  formatMetricNumber,
  calculateNiceMaxScale,
  sampleDailyValues,
  buildChartGeometry,
  buildMobileChartGeometry,
  calculateDelta,
  getTierCategory,
  computeArenaStats,
} from '../lib/svgMath';
import { SeriesItem } from '../lib/supabase';

const mockShowA: SeriesItem = {
  id: 'show-a-id',
  tmdb_id: 100,
  slug: 'severance',
  title: 'Severance',
  network: 'Apple TV+',
  genre_group: 'Drama & Sci-Fi',
  release_years: '2024–2025',
  chart_color: '#C66A3D',
  wiki_slug: 'Severance_(TV_series)',
  reddit_query: 'subreddit:SeveranceAppleTVPlus',
  buzz_score: 1_200_000,
  delta_pct: 12.5,
  updated_at: null,
  daily_series: [100000, 120000, 150000, 180000, 200000, 220000, 230000],
};

const mockShowB: SeriesItem = {
  id: 'show-b-id',
  tmdb_id: 101,
  slug: 'the-bear',
  title: 'The Bear',
  network: 'FX / Hulu',
  genre_group: 'Comedy & Drama',
  release_years: '2024–2025',
  chart_color: '#5C828C',
  wiki_slug: 'The_Bear_(TV_series)',
  reddit_query: 'subreddit:TheBear',
  buzz_score: 800_000,
  delta_pct: -5.2,
  updated_at: null,
  daily_series: [70000, 75000, 80000, 85000, 90000, 95000, 100000],
};

describe('svgMath & metrics helpers', () => {
  describe('formatMetricNumber', () => {
    it('formats values in millions with decimals', () => {
      expect(formatMetricNumber(1_250_000)).toBe('1.25M');
      expect(formatMetricNumber(12_400_000)).toBe('12.4M');
    });

    it('formats values in thousands', () => {
      expect(formatMetricNumber(450_000)).toBe('450K');
      expect(formatMetricNumber(12_500)).toBe('13K');
    });

    it('formats small values as locale strings', () => {
      expect(formatMetricNumber(850)).toBe('850');
      expect(formatMetricNumber(0)).toBe('0');
    });
  });

  describe('calculateNiceMaxScale', () => {
    it('returns sensible default for non-positive values', () => {
      expect(calculateNiceMaxScale(0)).toBe(400_000);
      expect(calculateNiceMaxScale(-500)).toBe(400_000);
    });

    it('scales large values above 800K to nearest 400K step', () => {
      const scale = calculateNiceMaxScale(1_200_000);
      expect(scale % 400_000).toBe(0);
      expect(scale).toBeGreaterThanOrEqual(1_200_000);
    });

    it('scales values between 100K and 800K to nearest 50K step', () => {
      const scale = calculateNiceMaxScale(350_000);
      expect(scale % 50_000).toBe(0);
      expect(scale).toBeGreaterThanOrEqual(350_000);
    });

    it('scales values under 10K with minimum floor', () => {
      expect(calculateNiceMaxScale(500)).toBe(1_000);
    });
  });

  describe('sampleDailyValues', () => {
    it('returns exact values for 7D window', () => {
      const values = [10, 20, 30, 40, 50, 60, 70];
      expect(sampleDailyValues(values, '7D')).toEqual(values);
    });

    it('averages buckets when daily points exceed 7', () => {
      const values = Array.from({ length: 28 }, (_, i) => (i + 1) * 1000);
      const sampled = sampleDailyValues(values, '30D');
      expect(sampled.length).toBe(7);
      expect(sampled[0]).toBeLessThan(sampled[6]);
    });
  });

  describe('buildChartGeometry & buildMobileChartGeometry', () => {
    it('returns empty path and points for empty dataset', () => {
      expect(buildChartGeometry([])).toEqual({ pathD: '', points: [] });
      expect(buildMobileChartGeometry([])).toEqual({ pathD: '', points: [] });
    });

    it('computes monotonic SVG points across grid coordinates', () => {
      const values = [100000, 200000, 300000, 400000, 500000, 600000, 700000];
      const { pathD, points } = buildChartGeometry(values, 1_000_000);
      expect(points.length).toBe(7);
      expect(pathD.startsWith('M 85,')).toBe(true);
      expect(points[0].x).toBe(85);
      expect(points[6].x).toBe(955);
      // Higher value should correspond to smaller Y (SVG origin is top-left)
      expect(points[6].y).toBeLessThan(points[0].y);
    });

    it('computes mobile chart geometry accurately within mobile bounds', () => {
      const values = [50000, 80000, 120000];
      const { points } = buildMobileChartGeometry(values, 500_000);
      expect(points.length).toBe(3);
      points.forEach((pt) => {
        expect(pt.x).toBeGreaterThanOrEqual(35);
        expect(pt.y).toBeGreaterThanOrEqual(20);
        expect(pt.y).toBeLessThanOrEqual(162);
      });
    });
  });

  describe('calculateDelta', () => {
    it('computes positive, negative, and zero percentage deltas', () => {
      expect(calculateDelta(150, 100)).toBe(50.0);
      expect(calculateDelta(50, 100)).toBe(-50.0);
      expect(calculateDelta(100, 100)).toBe(0.0);
    });

    it('handles zero previous without division by zero', () => {
      expect(calculateDelta(100, 0)).toBe(0.0);
      expect(calculateDelta(100, -5)).toBe(0.0);
    });

    it('clamps extreme deltas', () => {
      expect(calculateDelta(10_000_000, 1)).toBe(99999.0);
    });
  });

  describe('getTierCategory', () => {
    it('categorizes shows into correct viewership tiers', () => {
      expect(getTierCategory(6_000_000)).toBe('Flagship');
      expect(getTierCategory(1_500_000)).toBe('Breakout');
      expect(getTierCategory(350_000)).toBe('Mid-Tier');
      expect(getTierCategory(50_000)).toBe('Developing');
    });
  });

  describe('computeArenaStats', () => {
    it('computes correct tug-of-war proportions and winner', () => {
      const stats = computeArenaStats(mockShowA, mockShowB);
      expect(stats.leftLeads).toBe(true);
      expect(stats.winner.slug).toBe('severance');
      expect(stats.diff).toBe(400_000);
      expect(stats.diffPct).toBe('50.0'); // 400K / 800K = 50%
      expect(stats.leftPct).toBe(60.0);
      expect(stats.rightPct).toBe(40.0);
    });

    it('reverses winner when right show leads', () => {
      const stats = computeArenaStats(mockShowB, mockShowA);
      expect(stats.leftLeads).toBe(false);
      expect(stats.winner.slug).toBe('severance');
      expect(stats.diffPct).toBe('50.0');
    });
  });
});
