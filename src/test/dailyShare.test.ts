import { describe, expect, it, vi } from 'vitest';
import { dailyNumberForDate, parseDailyNumber, parseDailyShareInput, resolveDailyShare } from '../../functions/_shared/dailyShare';

const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('daily share input validation', () => {
  it('accepts only positive integer challenge numbers', () => {
    expect(parseDailyNumber('42')).toBe(42);
    expect(parseDailyNumber('0')).toBeNull();
    expect(parseDailyNumber('042')).toBeNull();
    expect(parseDailyNumber('4.2')).toBeNull();
  });

  it('accepts exactly one anonymous 10-bit grid and derives its score', () => {
    expect(parseDailyShareInput(new URLSearchParams('g=1101110110'))).toEqual({
      kind: 'anonymous', grid: '1101110110', score: 7,
    });
    expect(parseDailyShareInput(new URLSearchParams('g=110111011'))).toBeNull();
    expect(parseDailyShareInput(new URLSearchParams('g=110111011x'))).toBeNull();
    expect(parseDailyShareInput(new URLSearchParams('g=1101110110&score=7'))).toBeNull();
  });

  it('uses the database score and grid for a signed-in share token', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      date: '2026-11-04',
      score: 7,
      correctness: [true, true, false, true, true, true, false, true, false, true],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await resolveDailyShare('21', new URLSearchParams(`s=${token}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key',
    });
    expect(result).toEqual({
      dailyNumber: 21, score: 7,
      correctness: [true, true, false, true, true, true, false, true, false, true],
      query: `s=${token}`,
    });
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockRestore();
  });

  it('rejects a token whose server row belongs to another challenge number', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      date: '2026-11-04', score: 7,
      correctness: [true, true, false, true, true, true, false, true, false, true],
    }), { status: 200 }));
    expect(dailyNumberForDate('2026-11-04')).toBe(21);
    await expect(resolveDailyShare('22', new URLSearchParams(`s=${token}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key',
    })).resolves.toBeNull();
    vi.restoreAllMocks();
  });
});
