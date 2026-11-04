import { resolveDailyShare, type DailyShareEnv } from '../_shared/dailyShare';

interface Env extends DailyShareEnv {
  ASSETS: { fetch: (request: Request | string) => Promise<Response> };
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const url = new URL(request.url);
  const result = await resolveDailyShare(String(params.n || ''), url.searchParams, env);
  if (!result) return new Response('Invalid or unavailable daily result share.', { status: 404 });

  const asset = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  if (!asset.ok) return asset;

  const imageUrl = new URL(`/og/daily/${result.dailyNumber}?${result.query}`, url.origin).toString();
  const pageTitle = `TV Arena Daily Run #${result.dailyNumber}: ${result.score}/10`;
  const description = `Daily challenge result: ${result.score} out of 10.`;
  const tags = `
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(url.href)}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  `;
  let html = await asset.text();
  html = html.replace(/<title>.*?<\/title>/i, '');
  html = html.replace('</head>', `${tags}\n</head>`);
  const headers = new Headers(asset.headers);
  headers.set('content-type', 'text/html;charset=UTF-8');
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  return new Response(html, { status: 200, headers });
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
