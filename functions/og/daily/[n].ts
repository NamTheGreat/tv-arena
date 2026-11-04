import { ImageResponse } from 'workers-og';
import { resolveDailyShare, type DailyShareEnv } from '../../_shared/dailyShare';

type Env = DailyShareEnv;

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const url = new URL(request.url);
  const result = await resolveDailyShare(String(params.n || ''), url.searchParams, env);
  if (!result) return new Response('Invalid or unavailable daily result share.', { status: 404 });

  const cells = result.correctness.map((correct) => `
    <div style="width: 70px; height: 70px; border-radius: 12px; background-color: ${correct ? '#397b55' : '#a84238'};"></div>
  `).join('');
  const html = `
    <div style="display:flex; flex-direction:column; width:1200px; height:630px; box-sizing:border-box; padding:56px 72px; background:#faf6f0; border:12px solid #f0e7de; font-family:Arial,sans-serif; color:#231e1a; justify-content:space-between;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e5d9cf; padding-bottom:22px;">
        <span style="font-size:26px; font-weight:800; letter-spacing:5px; color:#c66a3d;">TV ARENA</span>
        <span style="font-size:22px; font-weight:700; color:#65584f;">DAILY RUN #${result.dailyNumber}</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:28px;">
        <div style="font-size:94px; font-weight:800; color:#231e1a;">${result.score}<span style="font-size:44px; color:#65584f;"> / 10</span></div>
        <div style="display:flex; gap:12px;">${cells}</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:2px solid #e5d9cf; padding-top:18px; font-size:18px; color:#65584f;">
        <span>Test your TV audience instincts</span>
        <span>tv-arena.pages.dev</span>
      </div>
    </div>
  `;
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' },
  });
};
