import React from 'react';
import { ChartSeries, Point, Regression } from '../lib/insights';

const W = 640;
const H = 260;
const PAD = { top: 12, right: 16, bottom: 28, left: 40 };

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${m}/${d}` : iso;
};

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

interface LineChartProps {
  title: string;
  labels: string[];
  series: ChartSeries[];
  unit?: string;
}

/** Responsive (viewBox scaled, never fixed width) multi-line chart with a visually hidden data table. */
export function LineChart({ title, labels, series, unit = '%' }: LineChartProps) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const x = (i: number) => PAD.left + (labels.length <= 1 ? (W - PAD.left - PAD.right) / 2 : (i / (labels.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const ticks = [0, max / 2, max];
  const step = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. Data table follows.`} data-testid="line-chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E7E0D8" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#57534E">{Math.round(t * 10) / 10}{unit}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 || i === labels.length - 1) && (
          <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#57534E">{shortDate(l)}</text>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return (
            <g key={s.name}>
              {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
              {s.values.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r={labels.length === 1 ? 4 : 2.5} fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-700">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Week of</th>{series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{s.values[i] === null ? '' : `${s.values[i]}${unit}`}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

interface ScatterProps {
  title: string;
  xLabel: string;
  yLabel: string;
  points: (Point & { title: string })[];
  regression: Regression | null;
  logScale: boolean;
}

export function ScatterChart({ title, xLabel, yLabel, points, regression, logScale }: ScatterProps) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const px = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);
  const fmt = (v: number) => (logScale ? `e^${Math.round(v * 10) / 10}` : Math.round(v).toLocaleString());

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${points.length} shows${regression ? `, R squared ${regression.r2.toFixed(2)}` : ''}`} data-testid="scatter-chart">
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#D6CEC4" />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#D6CEC4" />
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#57534E">{xLabel}{logScale ? ' (log)' : ''}</text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize={11} fill="#57534E" transform={`rotate(-90 12 ${H / 2})`}>{yLabel}{logScale ? ' (log)' : ''}</text>
        <text x={PAD.left} y={H - 16} fontSize={10} fill="#78716C">{fmt(xMin)}</text>
        <text x={W - PAD.right} y={H - 16} textAnchor="end" fontSize={10} fill="#78716C">{fmt(xMax)}</text>
        {points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3.5} fill="#C66A3D" fillOpacity={0.55} stroke="#C66A3D"><title>{p.title}</title></circle>
        ))}
        {regression && (
          <line
            data-testid="trendline"
            x1={px(xMin)} y1={py(regression.slope * xMin + regression.intercept)}
            x2={px(xMax)} y2={py(regression.slope * xMax + regression.intercept)}
            stroke="#2F2A26" strokeWidth={2} strokeDasharray="6 4"
          />
        )}
      </svg>
    </figure>
  );
}
