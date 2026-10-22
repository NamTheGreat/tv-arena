interface Env {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
}

interface SeriesRecord {
  slug: string;
  title: string;
  viewers_premiere_28d: number;
  delta_pct: number;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const a = (params.a as string) || '';
  const b = (params.b as string) || '';

  const url = new URL(request.url);

  // Fetch the SPA index.html from static assets
  const assetResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  let html = await assetResponse.text();

  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  let titleA = a.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let titleB = b.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let scoreA = 0;
  let scoreB = 0;

  if (supabaseUrl && supabaseKey && a && b) {
    try {
      const apiUrl = `${supabaseUrl}/rest/v1/series?slug=in.("${encodeURIComponent(a)}","${encodeURIComponent(b)}")&select=slug,title,viewers_premiere_28d,delta_pct`;
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
      // Graceful fallback to formatted slugs
    }
  }

  const pageTitle = `${titleA} vs ${titleB} | TV Arena Battle`;
  const description =
    scoreA > 0 && scoreB > 0
      ? `${titleA} (${scoreA.toLocaleString()} buzz) faces off against ${titleB} (${scoreB.toLocaleString()} buzz). Predict which television series commands greater 7-day engagement on TV Arena.`
      : `Compare 7-day audience engagement metrics for ${titleA} vs ${titleB}. Predict the winner in the TV Arena.`;

  const ogImageUrl = `${url.origin}/og/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;
  const canonicalUrl = `${url.origin}/arena/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;

  // Inject metadata into <head>
  const metaTags = `
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  `;

  if (html.includes('<title>')) {
    html = html.replace(/<title>.*?<\/title>/i, '');
  }
  html = html.replace('</head>', `${metaTags}\n  </head>`);

  const headers = new Headers(assetResponse.headers);
  headers.set('content-type', 'text/html;charset=UTF-8');
  headers.set('cache-control', 'public, max-age=60, s-maxage=300');

  return new Response(html, {
    status: 200,
    headers,
  });
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
