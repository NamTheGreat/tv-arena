import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveShow, escapeXml, buildSparklineSvg, type ShowShareEnv } from '../../functions/_shared/showShare';

const mockEnv: ShowShareEnv = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
};

describe('showShare helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('escapeXml', () => {
    it('escapes &, <, >, ", and single quotes', () => {
      expect(escapeXml('Law & Order: "Special" <SVU> \'26')).toBe(
        'Law &amp; Order: &quot;Special&quot; &lt;SVU&gt; &#39;26'
      );
    });

    it('returns empty string unmodified', () => {
      expect(escapeXml('')).toBe('');
    });
  });

  describe('buildSparklineSvg', () => {
    it('returns empty string for empty or single-point series', () => {
      expect(buildSparklineSvg([])).toBe('');
      expect(buildSparklineSvg([100])).toBe('');
    });

    it('builds coordinate points within the bounding box', () => {
      const points = buildSparklineSvg([10, 20, 30], 100, 50);
      expect(points).toBeTruthy();
      const coords = points.split(' ').map((p) => p.split(',').map(Number));
      expect(coords).toHaveLength(3);
      expect(coords[0][0]).toBe(0); // x start
      expect(coords[2][0]).toBe(100); // x end
      expect(coords[0][1]).toBeGreaterThan(coords[2][1]); // lower value has higher y in SVG
    });
  });

  describe('resolveShow', () => {
    it('returns unconfigured when Supabase credentials are missing', async () => {
      const result = await resolveShow('severance', {});
      expect(result).toEqual({ kind: 'unconfigured' });
    });

    it('returns not-found for invalid or empty slugs', async () => {
      const emptyResult = await resolveShow('', mockEnv);
      expect(emptyResult).toEqual({ kind: 'not-found' });

      const invalidCharsResult = await resolveShow('invalid/slug!@#', mockEnv);
      expect(invalidCharsResult).toEqual({ kind: 'not-found' });
    });

    it('returns not-found when PostgREST returns an empty array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await resolveShow('unknown-show', mockEnv);
      expect(result).toEqual({ kind: 'not-found' });
    });

    it('returns not-found when PostgREST returns HTTP 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

      const result = await resolveShow('missing-show', mockEnv);
      expect(result).toEqual({ kind: 'not-found' });
    });

    it('resolves show record and telemetry for a valid show slug', async () => {
      const mockLeaderboardRow = {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'severance',
        title: 'Severance',
        network: 'Apple TV+',
        genre_group: 'Drama & Sci-Fi',
        current_7d_score: 9500,
        previous_7d_score: 8000,
        delta_pct: 18.75,
        rank: 1,
      };

      const mockTelemetryRow = {
        daily_series: [8000, 8500, 9000, 9500],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('series_leaderboard')) {
          return new Response(JSON.stringify([mockLeaderboardRow]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('series_recent_telemetry')) {
          return new Response(JSON.stringify([mockTelemetryRow]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await resolveShow('severance', mockEnv);
      expect(result.kind).toBe('found');
      if (result.kind === 'found') {
        expect(result.show.title).toBe('Severance');
        expect(result.show.network).toBe('Apple TV+');
        expect(result.show.current7dScore).toBe(9500);
        expect(result.show.previous7dScore).toBe(8000);
        expect(result.show.deltaPct).toBe(18.75);
        expect(result.show.rank).toBe(1);
        expect(result.show.dailySeries).toEqual([8000, 8500, 9000, 9500]);
      }
    });

    it('handles null deltaPct and missing telemetry gracefully without failing', async () => {
      const mockLeaderboardRow = {
        id: '00000000-0000-0000-0000-000000000002',
        slug: 'new-show',
        title: 'New Show',
        network: 'Netflix',
        genre_group: 'Comedy',
        current_7d_score: 1200,
        previous_7d_score: null,
        delta_pct: null,
        rank: null,
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([mockLeaderboardRow]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await resolveShow('new-show', mockEnv);
      expect(result.kind).toBe('found');
      if (result.kind === 'found') {
        expect(result.show.title).toBe('New Show');
        expect(result.show.deltaPct).toBeNull();
        expect(result.show.previous7dScore).toBeNull();
        expect(result.show.rank).toBeNull();
        expect(result.show.dailySeries).toEqual([]);
      }
    });
  });
});
