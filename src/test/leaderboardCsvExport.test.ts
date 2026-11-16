import { describe, it, expect, vi } from 'vitest';
import { formatCsvCell, generateLeaderboardCsv, LEADERBOARD_CSV_HEADERS, downloadCsv } from '../lib/csvExport';
import type { SeriesItem } from '../lib/supabase';

const mockShows: SeriesItem[] = [
  {
    id: '1',
    tmdb_id: 114472,
    slug: 'severance',
    title: 'Severance',
    network: 'Apple TV+',
    network_group: 'Apple TV+',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2022–Present',
    chart_color: '#4A7C59',
    buzz_score: 9500,
    current_7d_score: 9500,
    previous_7d_score: 8000,
    delta_pct: 18.75,
    rank: 1,
    daily_series: [9500],
    updated_at: '2026-11-16T00:00:00Z',
    wiki_slug: 'Severance_(TV_series)',
    reddit_query: 'severance',
  },
  {
    id: '2',
    tmdb_id: 66732,
    slug: 'stranger-things',
    title: 'Stranger Things',
    network: 'Netflix',
    network_group: 'Netflix',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2016–2025',
    chart_color: '#C66A3D',
    buzz_score: 8200,
    current_7d_score: 8200,
    previous_7d_score: 8500,
    delta_pct: -3.53,
    rank: 2,
    daily_series: [8200],
    updated_at: '2026-11-16T00:00:00Z',
    wiki_slug: 'Stranger_Things',
    reddit_query: 'strangerthings',
  },
  {
    id: '3',
    tmdb_id: 99999,
    slug: 'new-unranked',
    title: 'Brand New Show',
    network: 'HBO',
    network_group: 'HBO',
    genre_group: 'Comedy',
    release_years: '2026',
    chart_color: '#5C828C',
    buzz_score: 1200,
    current_7d_score: 1200,
    previous_7d_score: undefined,
    delta_pct: null,
    rank: undefined,
    daily_series: [1200],
    updated_at: '2026-11-16T00:00:00Z',
    wiki_slug: '',
    reddit_query: '',
  },
];

describe('formatCsvCell escaping & security', () => {
  it('formats null and undefined as empty strings', () => {
    expect(formatCsvCell(null)).toBe('');
    expect(formatCsvCell(undefined)).toBe('');
  });

  it('formats standard numbers safely', () => {
    expect(formatCsvCell(1)).toBe('1');
    expect(formatCsvCell(9500)).toBe('9500');
    expect(formatCsvCell(-3.5)).toBe('-3.5');
  });

  it('neutralizes spreadsheet formula injection prefixes on strings', () => {
    expect(formatCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(formatCsvCell('+12345')).toBe("'+12345");
    expect(formatCsvCell('-cmd|calc')).toBe("'-cmd|calc");
    expect(formatCsvCell('@dangerous')).toBe("'@dangerous");
  });

  it('escapes cells containing commas, quotes, and newlines', () => {
    // Comma
    expect(formatCsvCell('Drama, Mystery')).toBe('"Drama, Mystery"');
    // Double quotes (doubled up)
    expect(formatCsvCell('The "Bear"')).toBe('"The ""Bear"""');
    // Newlines
    expect(formatCsvCell("Multi\nLine")).toBe('"Multi\nLine"');
    expect(formatCsvCell("Multi\r\nLine")).toBe('"Multi\r\nLine"');
  });

  it('preserves Unicode and international titles cleanly', () => {
    expect(formatCsvCell('Squid Game (오징어 게임)')).toBe('Squid Game (오징어 게임)');
    expect(formatCsvCell('La Casa de Papel')).toBe('La Casa de Papel');
    expect(formatCsvCell('進撃の巨人')).toBe('進撃の巨人');
    expect(formatCsvCell('Dark 🇩🇪')).toBe('Dark 🇩🇪');
  });
});

describe('generateLeaderboardCsv', () => {
  it('returns valid CSV header row when shows list is empty', () => {
    const csv = generateLeaderboardCsv([]);
    expect(csv).toBe(LEADERBOARD_CSV_HEADERS.join(','));
  });

  it('generates expected CSV rows matching the active shows list', () => {
    const csv = generateLeaderboardCsv(mockShows, 'score');
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(4); // 1 header + 3 rows
    expect(lines[0]).toBe('Rank,Title,Platform,Genre,Current 7-Day Score,Prior 7-Day Score,Change %');

    // Row 1: Severance
    expect(lines[1]).toBe('1,Severance,Apple TV+,Drama & Sci-Fi,9500,8000,18.8');
    // Row 2: Stranger Things
    expect(lines[2]).toBe('2,Stranger Things,Netflix,Drama & Sci-Fi,8200,8500,-3.5');
    // Row 3: New Show (null prior score and delta)
    expect(lines[3]).toBe('3,Brand New Show,HBO,Comedy,1200,,');
  });

  it('respects active sort order and rank assignment for growth sorting', () => {
    // In growth sort, rank reflects the sorted order position
    const sortedByGrowth = [mockShows[0], mockShows[1]]; // Severance (18.75%), Stranger Things (-3.53%)
    const csv = generateLeaderboardCsv(sortedByGrowth, 'growth');
    const lines = csv.split('\r\n');

    expect(lines[1]).toContain('1,Severance');
    expect(lines[2]).toContain('2,Stranger Things');
  });

  it('escapes complex titles and neutralizes formula injections in output rows', () => {
    const attackShows: SeriesItem[] = [
      {
        ...mockShows[0],
        title: '=1+1"; cmd',
        network: 'Netflix, Inc.',
        genre_group: 'Drama\nThriller',
      },
    ];

    const csv = generateLeaderboardCsv(attackShows);
    const lines = csv.split('\r\n');

    // Title starts with =, contains quotes and semicolon/comma
    expect(lines[1]).toContain('"\'=1+1""; cmd"');
    // Network contains comma
    expect(lines[1]).toContain('"Netflix, Inc."');
    // Genre contains newline
    expect(lines[1]).toContain('"Drama\nThriller"');
  });
});

describe('downloadCsv trigger', () => {
  it('creates an invisible anchor, attaches BOM, and triggers click', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadCsv('test,data\r\n1,2', 'leaderboard.csv');

    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });
});
