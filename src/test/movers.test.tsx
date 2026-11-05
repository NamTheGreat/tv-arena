import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MoversView } from '../components/MoversView';
import { getMovers } from '../lib/movers';
import { SeriesItem } from '../lib/supabase';

function series(slug: string, change: number | null, breakout = false): SeriesItem {
  return {
    id: slug,
    tmdb_id: 1,
    slug,
    title: slug,
    network: 'Network',
    network_group: 'Network',
    genre_group: 'Drama',
    release_years: '2020–present',
    chart_color: '#c66a3d',
    wiki_slug: slug,
    reddit_query: slug,
    buzz_score: 100,
    delta_pct: change,
    updated_at: null,
    daily_series: [],
    current_7d_score: 120,
    previous_7d_score: 100,
    is_breakout: breakout,
    breakout_reason: breakout ? 'Recent rise' : undefined,
  };
}

describe('MoversView', () => {
  it('separates risers, fallers, and breakouts, excluding shows without prior-week comparison', () => {
    const shows = [series('riser', 25, true), series('faller', -12), series('new-show', null)];
    const result = getMovers(shows);

    expect(result.risers.map((show) => show.slug)).toEqual(['riser']);
    expect(result.fallers.map((show) => show.slug)).toEqual(['faller']);
    expect(result.breakouts.map((show) => show.slug)).toEqual(['riser']);

    render(<MemoryRouter><MoversView seriesList={shows} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Top Movers' })).toBeInTheDocument();
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(screen.getByText('-12.0%')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to RSS')).toHaveAttribute('href', '/movers.xml');
    expect(screen.queryByText('new-show')).not.toBeInTheDocument();
  });
});
