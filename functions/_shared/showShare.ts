export interface ShowShareEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export interface ShowShareData {
  id: string;
  slug: string;
  title: string;
  network: string;
  genreGroup: string;
  current7dScore: number;
  previous7dScore: number | null;
  deltaPct: number | null;
  rank: number | null;
  dailySeries: number[];
}

export type ShowResolveResult =
  | { kind: 'found'; show: ShowShareData }
  | { kind: 'not-found' }
  | { kind: 'unconfigured' };

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildSparklineSvg(series: number[], width = 380, height = 80): string {
  if (!series || series.length < 2) return '';
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const padding = 8;
  const usableHeight = height - padding * 2;

  const points = series.map((val, idx) => {
    const x = Math.round((idx / (series.length - 1)) * width);
    const y = Math.round(height - padding - ((val - min) / range) * usableHeight);
    return `${x},${y}`;
  });

  return points.join(' ');
}

export async function resolveShow(slug: string, env: ShowShareEnv): Promise<ShowResolveResult> {
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
    return { kind: 'not-found' };
  }

  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return { kind: 'unconfigured' };
  }

  try {
    const url = `${supabaseUrl}/rest/v1/series_leaderboard?slug=eq.${encodeURIComponent(cleanSlug)}&select=id,slug,title,network,genre_group,current_7d_score,previous_7d_score,delta_pct,rank`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) return { kind: 'not-found' };
      return { kind: 'unconfigured' };
    }

    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { kind: 'not-found' };
    }

    const row = rows[0];

    let dailySeries: number[] = [];
    try {
      const telemetryRes = await fetch(
        `${supabaseUrl}/rest/v1/series_recent_telemetry?series_id=eq.${row.id}&select=daily_series`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Accept: 'application/json',
          },
        }
      );
      if (telemetryRes.ok) {
        const telemetryRows = (await telemetryRes.json()) as any[];
        if (Array.isArray(telemetryRows) && telemetryRows.length > 0) {
          dailySeries = (telemetryRows[0].daily_series || []).map(Number);
        }
      }
    } catch {
      // Telemetry sparkline is non-critical
    }

    return {
      kind: 'found',
      show: {
        id: row.id,
        slug: row.slug,
        title: row.title || cleanSlug,
        network: row.network || 'Unknown',
        genreGroup: row.genre_group || 'General',
        current7dScore: Number(row.current_7d_score) || 0,
        previous7dScore:
          row.previous_7d_score !== null && row.previous_7d_score !== undefined
            ? Number(row.previous_7d_score)
            : null,
        deltaPct:
          row.delta_pct !== null && row.delta_pct !== undefined
            ? Number(row.delta_pct)
            : null,
        rank: row.rank ? Number(row.rank) : null,
        dailySeries,
      },
    };
  } catch {
    return { kind: 'unconfigured' };
  }
}
