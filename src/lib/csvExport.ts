import type { SeriesItem } from './supabase';

/**
 * Formats and escapes a single cell for RFC 4180 CSV compatibility.
 * Neutralizes spreadsheet formula injection by prepending a single quote (')
 * to string values that start with '=', '+', '-', or '@'.
 */
export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Pure numbers are formatted as numbers without formula prefixing
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  let str = String(value);

  // Pure numbers or negative number literals (e.g. -3.5) are safe
  // Strings starting with =, @, +, or non-numeric - are neutralized
  const isPureNumber = typeof value === 'number';
  const isNumericValue = /^-?\d+(\.\d+)?$/.test(str) && !str.startsWith('+');

  if (!isPureNumber && !isNumericValue && /^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // Quote cells that contain double quotes, commas, or newlines
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export const LEADERBOARD_CSV_HEADERS = [
  'Rank',
  'Title',
  'Platform',
  'Genre',
  'Current 7-Day Score',
  'Prior 7-Day Score',
  'Change %',
];

/**
 * Generates an RFC 4180 compliant CSV string from the active filtered/sorted shows.
 */
export function generateLeaderboardCsv(
  shows: SeriesItem[],
  sortBy: 'score' | 'growth' | 'new' = 'score'
): string {
  const rows = shows.map((show, idx) => {
    const rank = sortBy === 'score' ? show.rank ?? idx + 1 : idx + 1;
    const currentScore = show.current_7d_score ?? show.buzz_score ?? null;
    const priorScore = show.previous_7d_score ?? null;
    const deltaPct =
      show.delta_pct !== null && show.delta_pct !== undefined
        ? Number(show.delta_pct)
        : null;

    return [
      formatCsvCell(rank),
      formatCsvCell(show.title),
      formatCsvCell(show.network || show.network_group),
      formatCsvCell(show.genre_group),
      formatCsvCell(currentScore),
      formatCsvCell(priorScore),
      formatCsvCell(deltaPct !== null ? deltaPct.toFixed(1) : null),
    ].join(',');
  });

  return [LEADERBOARD_CSV_HEADERS.join(','), ...rows].join('\r\n');
}

/**
 * Triggers a client-side download of a CSV file with a UTF-8 BOM.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
