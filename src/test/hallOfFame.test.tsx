import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  HallOfFameRow,
  formatPlace,
  formatRecordPeriod,
  groupHallOfFame,
  HALL_OF_FAME_CATEGORIES,
} from '../lib/hallOfFame';
import { HallOfFameView } from '../components/HallOfFameView';

const row = (over: Partial<HallOfFameRow>): HallOfFameRow => ({
  category: 'record_day', place: 1, record_rank: 1, series_id: 'a', slug: 'a', title: 'A',
  chart_color: null, value: 10, start_date: '2026-01-02', end_date: '2026-01-02', ...over,
});

describe('hall of fame helpers', () => {
  it('groups rows by category and orders by place', () => {
    const g = groupHallOfFame([row({ place: 2, series_id: 'b' }), row({ place: 1 }), row({ category: 'top3_days' })]);
    expect(g.get('record_day')?.map((r) => r.place)).toEqual([1, 2]);
    expect(g.get('top3_days')).toHaveLength(1);
  });

  it('marks ties with T- and leaves unique ranks plain', () => {
    const rows = [row({ place: 1, record_rank: 1 }), row({ place: 2, record_rank: 2, series_id: 'b' }), row({ place: 3, record_rank: 2, series_id: 'c' })];
    expect(formatPlace(rows[0], rows)).toBe('1');
    expect(formatPlace(rows[1], rows)).toBe('T-2');
    expect(formatPlace(rows[2], rows)).toBe('T-2');
  });

  it('formats single days and ranges', () => {
    expect(formatRecordPeriod('2026-03-05', '2026-03-05')).toBe('Mar 5, 2026');
    expect(formatRecordPeriod('2026-03-04', '2026-03-07')).toBe('Mar 4, 2026 to Mar 7, 2026');
  });

  it('pluralises units correctly', () => {
    const streak = HALL_OF_FAME_CATEGORIES.find((c) => c.key === 'number_one_streak')!;
    expect(streak.unit(1)).toBe('1 day');
    expect(streak.unit(4)).toBe('4 days');
  });
});

describe('HallOfFameView', () => {
  it('renders a message instead of crashing when the database is not configured', () => {
    render(<MemoryRouter><HallOfFameView /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Hall of Fame' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/live database/i);
  });
});
