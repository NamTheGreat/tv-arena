import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { buildPremiereReport, type PremiereImpactRow } from '../lib/premiereImpact';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), failing: false, rows: [] as unknown[] }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../lib/premiereImpact', async (orig) => ({
  ...(await orig<typeof import('../lib/premiereImpact')>()),
  fetchPremiereImpact: (id: string) => {
    mocks.fetch(id);
    return mocks.failing ? (async () => { throw new Error('boom'); })() : Promise.resolve(mocks.rows);
  },
}));
import { PremiereImpactCard } from '../components/PremiereImpactCard';

const row = (id: number, date: string, pre: number, post: number, over: Partial<PremiereImpactRow> = {}): PremiereImpactRow => ({
  event_id: id, series_id: 's', event_date: date, label: `Season ${id}`, premiere_number: id,
  pre_days: 7, post_days: 7, pre_avg: pre, post_avg: post, delta: post - pre,
  multiplier: pre > 0 ? Math.round((post / pre) * 100) / 100 : null, ...over,
});

describe('buildPremiereReport', () => {
  it('handles a show with a single premiere (no comparison, no best badge)', () => {
    const r = buildPremiereReport([row(1, '2026-01-01', 100, 300)]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].vsPrevious).toBeNull();
    expect(r.entries[0].isBest).toBe(false);
    expect(r.averageMultiplier).toBe(3);
  });

  it('compares each premiere to the previous one and flags the biggest, regardless of input order', () => {
    const r = buildPremiereReport([
      row(3, '2026-09-01', 200, 300),
      row(1, '2026-01-01', 100, 300),
      row(2, '2026-05-01', 200, 300),
    ]);
    expect(r.entries.map((e) => e.event_id)).toEqual([1, 2, 3]);
    expect(r.entries.map((e) => e.multiplier)).toEqual([3, 1.5, 1.5]);
    expect(r.entries[1].vsPrevious).toBe(0.5);
    expect(r.entries[2].vsPrevious).toBe(1);
    expect(r.entries.map((e) => e.isBest)).toEqual([true, false, false]);
    expect(r.averageMultiplier).toBe(2);
  });

  it('skips comparison across a premiere without baseline and ignores it in the average', () => {
    const r = buildPremiereReport([
      row(1, '2026-01-01', 100, 400),
      row(2, '2026-05-01', 0, 500),
      row(3, '2026-09-01', 100, 200),
    ]);
    expect(r.entries[1].multiplier).toBeNull();
    expect(r.entries[1].vsPrevious).toBeNull();
    expect(r.entries[2].vsPrevious).toBeNull();
    expect(r.averageMultiplier).toBe(3);
    expect(r.entries[0].isBest).toBe(true);
  });

  it('marks a partial post window and handles an empty history', () => {
    expect(buildPremiereReport([row(1, '2026-11-20', 100, 150, { post_days: 5 })]).entries[0].partial).toBe(true);
    expect(buildPremiereReport([])).toEqual({ entries: [], averageMultiplier: null });
  });
});

describe('PremiereImpactCard', () => {
  beforeEach(() => { mocks.fetch.mockReset(); mocks.failing = false; mocks.rows = []; });

  it('renders multipliers and the comparison to the previous season', async () => {
    mocks.rows = [row(1, '2026-01-01', 100, 300), row(2, '2026-05-01', 200, 300)];
    render(<PremiereImpactCard seriesId="s" />);
    expect(await screen.findByTestId('premiere-impact')).toBeInTheDocument();
    const mult = screen.getAllByTestId('premiere-multiplier').map((n) => n.textContent);
    expect(mult[0]).toContain('3×');
    expect(mult[0]).toContain('Biggest premiere');
    expect(mult[1]).toContain('1.5×');
    expect(screen.getByText(/0.5× the previous premiere's bump \(smaller\)/)).toBeInTheDocument();
  });

  it('renders nothing when there are no analysed premieres', async () => {
    const { container } = render(<PremiereImpactCard seriesId="a" />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="premiere-impact"]')).toBeNull();
  });

  it('renders nothing when the query fails', async () => {
    mocks.failing = true;
    const { container } = render(<PremiereImpactCard seriesId="b" />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="premiere-impact"]')).toBeNull();
  });
});
