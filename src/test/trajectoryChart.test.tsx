import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrajectoryChart } from '../components/TrajectoryChart';
import { SeriesItem } from '../lib/supabase';

function show(slug: string, network: string, score: number): SeriesItem {
  return {
    id: slug,
    tmdb_id: score,
    slug,
    title: slug,
    network,
    genre_group: 'Drama',
    release_years: '2020–present',
    chart_color: '#c66a3d',
    wiki_slug: slug,
    reddit_query: slug,
    buzz_score: score,
    delta_pct: 0,
    updated_at: null,
    daily_series: [],
    daily_dates: [],
  };
}

function renderChart(seriesList: SeriesItem[]) {
  return render(
    <MemoryRouter>
      <TrajectoryChart
        seriesList={seriesList}
        chartRange="7D"
        setChartRange={() => undefined}
      />
    </MemoryRouter>
  );
}

describe('TrajectoryChart', () => {
  it('renders when shows have no telemetry values', () => {
    renderChart([show('show-without-history', 'Netflix', 10)]);

    expect(screen.getByText(/Cumulative Period Telemetry/)).toBeInTheDocument();
    expect(screen.getAllByText('show-without-history').length).toBeGreaterThan(0);
  });

  it('applies the selected network preset to plotted shows', () => {
    renderChart([
      show('netflix-title', 'Netflix', 20),
      show('hbo-title', 'HBO Max', 10),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Netflix Top 6' }));

    const legend = document.querySelector('[data-purpose="chart-legend"]');
    expect(legend).not.toBeNull();
    expect(within(legend as HTMLElement).getByText('netflix-title')).toBeInTheDocument();
    expect(within(legend as HTMLElement).queryByText('hbo-title')).not.toBeInTheDocument();
  });
});
