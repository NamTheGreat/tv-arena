import { describe, expect, it } from 'vitest';
import { scoreDailyAnswers } from '../lib/dailyChallenge';
import fixture from '../../supabase/tests/fixtures/daily-grading.csv?raw';

const rows = fixture
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(','));

describe('daily client/RPC grading contract fixture', () => {
  it('matches submit_daily_score strict comparisons including ties', () => {
    const scores = rows.map(([, wiki, comments, upvotes]) =>
      Number(wiki) * 10 + Number(comments) * 150 + Number(upvotes) * 25
    );
    const answers = rows.slice(1).map((row) => row[4] as 'higher' | 'lower');

    expect(scoreDailyAnswers(answers, scores)).toBe(2);
  });
});
