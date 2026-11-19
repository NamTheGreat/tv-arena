import { ImageResponse } from 'workers-og';
import { resolveShow, escapeXml, buildSparklineSvg, type ShowShareEnv } from '../../_shared/showShare';

type Env = ShowShareEnv;

export const onRequest: PagesFunction<Env> = async ({ params, env }) => {
  const slug = String(params.slug || '');
  const result = await resolveShow(slug, env);

  if (result.kind === 'not-found') {
    return new Response('Show not found', { status: 404 });
  }

  if (result.kind === 'unconfigured') {
    return new Response('Service unavailable', { status: 503 });
  }

  const show = result.show;
  const isNew = show.deltaPct === null;
  const isSteady = !isNew && Math.abs(show.deltaPct as number) < 0.5;
  const isUp = !isNew && (show.deltaPct as number) > 0;

  const deltaLabel = isNew
    ? 'NEW'
    : isSteady
    ? 'Steady'
    : isUp
    ? `+${(show.deltaPct as number).toFixed(1)}%`
    : `${(show.deltaPct as number).toFixed(1)}%`;

  const deltaColor = isNew
    ? '#c66a3d'
    : isSteady
    ? '#65584f'
    : isUp
    ? '#2e7d32'
    : '#c62828';

  const deltaBg = isNew
    ? '#fcf0ea'
    : isSteady
    ? '#f4ede6'
    : isUp
    ? '#e8f5e9'
    : '#ffebee';

  const sparklinePoints = buildSparklineSvg(show.dailySeries.slice(-14), 380, 80);

  const html = `
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background-color: #faf6f0; padding: 48px 64px; font-family: sans-serif; justify-content: space-between; border: 12px solid #f4ede6; box-sizing: border-box;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eae0d5; padding-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="display: flex; width: 16px; height: 16px; border-radius: 9999px; background-color: #c66a3d;"></span>
          <span style="font-size: 24px; font-weight: 800; letter-spacing: 0.15em; color: #231e1a; text-transform: uppercase;">TV ARENA</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          ${show.rank ? `<span style="font-size: 15px; font-weight: 700; color: #c66a3d; background-color: #fcf0ea; padding: 6px 14px; border-radius: 9999px; border: 1px solid #f2dcd0;">RANK #${show.rank}</span>` : ''}
          <span style="font-size: 15px; font-weight: 600; letter-spacing: 0.08em; color: #65584f; text-transform: uppercase; background-color: #f4ede6; padding: 6px 16px; border-radius: 9999px;">
            Show Intelligence Dossier
          </span>
        </div>
      </div>

      <!-- Main Body -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 24px 0;">
        <div style="display: flex; flex-direction: column; width: 620px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="font-size: 16px; font-weight: 700; color: #c66a3d; text-transform: uppercase; letter-spacing: 0.1em;">${escapeXml(show.network)}</span>
            <span style="color: #c5b8ad; font-size: 14px;">·</span>
            <span style="font-size: 15px; font-weight: 500; color: #65584f;">${escapeXml(show.genreGroup)}</span>
          </div>
          <h1 style="font-size: 52px; font-weight: 800; color: #231e1a; margin: 0 0 16px 0; line-height: 1.1; letter-spacing: -0.02em;">
            ${escapeXml(show.title)}
          </h1>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 12px; font-weight: 700; color: #786e63; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px;">7-Day Engagement</span>
              <span style="font-size: 44px; font-weight: 800; color: #231e1a; font-family: serif;">${show.current7dScore.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; align-self: flex-end; margin-bottom: 8px; background-color: ${deltaBg}; color: ${deltaColor}; padding: 6px 14px; border-radius: 9999px; font-size: 18px; font-weight: 700;">
              ${escapeXml(deltaLabel)}
            </div>
          </div>
        </div>

        <!-- Trajectory Card / Sparkline -->
        <div style="display: flex; flex-direction: column; width: 420px; background-color: #ffffff; border: 2px solid #eae0d5; border-radius: 24px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #65584f;">Engagement Trajectory</span>
            <span style="font-size: 12px; color: #8e8074;">14-Day Trend</span>
          </div>
          ${sparklinePoints ? `
            <svg width="380" height="80" viewBox="0 0 380 80" style="overflow: visible;">
              <polyline fill="none" stroke="#c66a3d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${sparklinePoints}" />
            </svg>
          ` : `
            <div style="display: flex; height: 80px; align-items: center; justify-content: center; color: #8e8074; font-size: 14px;">
              Continuous 7-day telemetry tracked
            </div>
          `}
        </div>
      </div>

      <!-- Footer -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #eae0d5; padding-top: 18px; font-size: 16px; color: #65584f;">
        <span>Live television engagement intelligence & audience benchmarks</span>
        <span style="font-weight: 600; color: #231e1a;">tv-arena.pages.dev</span>
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
