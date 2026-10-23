import { ImageResponse } from 'workers-og';

interface Env {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface SeriesRecord {
  slug: string;
  title: string;
  network?: string;
  viewers_premiere_28d: number;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const a = (params.a as string) || '';
  const b = (params.b as string) || '';

  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  let titleA = a.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let titleB = b.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let scoreA = 0;
  let scoreB = 0;

  if (supabaseUrl && supabaseKey && a && b) {
    try {
      const apiUrl = `${supabaseUrl}/rest/v1/series?slug=in.("${encodeURIComponent(a)}","${encodeURIComponent(b)}")&select=slug,title,viewers_premiere_28d`;
      const res = await fetch(apiUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        const rows = (await res.json()) as SeriesRecord[];
        const showA = rows.find((r) => r.slug === a);
        const showB = rows.find((r) => r.slug === b);
        if (showA) {
          titleA = showA.title;
          scoreA = Number(showA.viewers_premiere_28d) || 0;
        }
        if (showB) {
          titleB = showB.title;
          scoreB = Number(showB.viewers_premiere_28d) || 0;
        }
      }
    } catch {
      // Fallback gracefully
    }
  }

  const totalScore = scoreA + scoreB;
  const pctA = totalScore > 0 ? Math.round((scoreA / totalScore) * 100) : 50;
  const pctB = 100 - pctA;

  const html = `
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background-color: #faf6f0; padding: 48px 64px; font-family: sans-serif; justify-content: space-between; border: 12px solid #f4ede6;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eae0d5; padding-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="display: flex; width: 16px; height: 16px; border-radius: 9999px; background-color: #c66a3d;"></span>
          <span style="font-size: 24px; font-weight: 800; letter-spacing: 0.15em; color: #231e1a; text-transform: uppercase;">TV ARENA</span>
        </div>
        <span style="font-size: 16px; font-weight: 600; letter-spacing: 0.08em; color: #65584f; text-transform: uppercase; background-color: #f4ede6; padding: 6px 16px; border-radius: 9999px;">
          7-Day Audience Engagement Battle
        </span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 32px 0;">
        <div style="display: flex; flex-direction: column; width: 440px; text-align: left;">
          <span style="font-size: 16px; font-weight: 700; color: #c66a3d; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">BENCHMARK</span>
          <h1 style="font-size: 46px; font-weight: 700; color: #231e1a; margin: 0 0 12px 0; line-height: 1.1;">${titleA}</h1>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span style="font-size: 38px; font-weight: 800; color: #c66a3d;">${scoreA > 0 ? scoreA.toLocaleString() : 'N/A'}</span>
            <span style="font-size: 16px; font-weight: 500; color: #65584f;">engagement</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; width: 76px; height: 76px; border-radius: 9999px; background-color: #231e1a; color: #faf6f0; font-size: 26px; font-weight: 800; border: 4px solid #eae0d5;">
          VS
        </div>

        <div style="display: flex; flex-direction: column; width: 440px; text-align: right; align-items: flex-end;">
          <span style="font-size: 16px; font-weight: 700; color: #5c828c; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">CHALLENGER</span>
          <h1 style="font-size: 46px; font-weight: 700; color: #231e1a; margin: 0 0 12px 0; line-height: 1.1;">${titleB}</h1>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span style="font-size: 38px; font-weight: 800; color: #5c828c;">${scoreB > 0 ? scoreB.toLocaleString() : 'N/A'}</span>
            <span style="font-size: 16px; font-weight: 500; color: #65584f;">engagement</span>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #65584f;">
          <span style="color: #c66a3d;">${pctA}% Momentum</span>
          <span style="color: #5c828c;">${pctB}% Momentum</span>
        </div>
        <div style="display: flex; width: 100%; height: 20px; border-radius: 9999px; overflow: hidden; background-color: #eae0d5; border: 2px solid #eae0d5;">
          <div style="display: flex; width: ${pctA}%; height: 100%; background-color: #c66a3d;"></div>
          <div style="display: flex; width: ${pctB}%; height: 100%; background-color: #5c828c;"></div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #eae0d5; padding-top: 16px; font-size: 14px; color: #65584f;">
        <span>tv-arena.com • Wikipedia &amp; Reddit verified signals</span>
        <span>Who commands greater buzz? Play now</span>
      </div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: {
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
