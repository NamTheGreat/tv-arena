import { resolveShow, escapeXml, type ShowShareEnv } from '../_shared/showShare';

interface Env extends ShowShareEnv {
  ASSETS: { fetch: (request: Request | string) => Promise<Response> };
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const slug = String(params.slug || '');
  const result = await resolveShow(slug, env);

  if (result.kind === 'not-found') {
    return new Response('Show not found', { status: 404 });
  }

  const assetResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  if (!assetResponse.ok) return assetResponse;

  if (result.kind === 'unconfigured') {
    // Missing Supabase credentials: serve standard SPA app without fabricated score metadata
    return assetResponse;
  }

  const show = result.show;
  const url = new URL(request.url);
  const ogImageUrl = new URL(`/og/show/${encodeURIComponent(show.slug)}`, url.origin).toString();
  const canonicalUrl = new URL(`/show/${encodeURIComponent(show.slug)}`, url.origin).toString();

  const changeText =
    show.deltaPct === null
      ? ' (New)'
      : Math.abs(show.deltaPct) < 0.5
      ? ' (Steady)'
      : show.deltaPct > 0
      ? ` (+${show.deltaPct.toFixed(1)}% this week)`
      : ` (${show.deltaPct.toFixed(1)}% this week)`;

  const pageTitle = `${show.title} — TV Arena Intelligence`;
  const description = `${show.title} (${show.network}) 7-Day Engagement Index: ${show.current7dScore.toLocaleString()}${changeText}. Track live audience metrics and compare television series on TV Arena.`;

  const metaTags = `
    <title>${escapeXml(pageTitle)}</title>
    <meta name="description" content="${escapeXml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeXml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeXml(pageTitle)}" />
    <meta property="og:description" content="${escapeXml(description)}" />
    <meta property="og:image" content="${escapeXml(ogImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeXml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeXml(description)}" />
    <meta name="twitter:image" content="${escapeXml(ogImageUrl)}" />
  `;

  let html = await assetResponse.text();
  html = html.replace(/<title>.*?<\/title>/i, '');
  html = html.replace('</head>', `${metaTags}\n  </head>`);

  const headers = new Headers(assetResponse.headers);
  headers.set('content-type', 'text/html;charset=UTF-8');
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=60, s-maxage=300');

  return new Response(html, { status: 200, headers });
};
