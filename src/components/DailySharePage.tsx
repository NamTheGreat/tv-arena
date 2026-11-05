import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { dailyNumberForDate, parseDailyNumber, parseDailyShareInput } from '../../functions/_shared/dailyShare';
import { supabase } from '../lib/supabase';

interface SharedResult {
  score: number;
  correctness: boolean[];
  verified: boolean;
}

export function DailySharePage() {
  const { n } = useParams();
  const [searchParams] = useSearchParams();
  const dailyNumber = parseDailyNumber(n || '');
  const query = searchParams.toString();
  const share = parseDailyShareInput(new URLSearchParams(query));
  const [result, setResult] = useState<SharedResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setResult(null);

    if (dailyNumber === null || !share) {
      setIsLoading(false);
      return () => { active = false; };
    }

    if (share.kind === 'anonymous') {
      setResult({
        score: share.score,
        correctness: [...share.grid].map((bit) => bit === '1'),
        verified: false,
      });
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    if (!supabase) {
      setIsLoading(false);
      return () => { active = false; };
    }

    void supabase.rpc('get_daily_score_share', { p_share_token: share.token }).then(({ data, error }) => {
      if (!active) return;
      const value = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      const { date, score, correctness } = value || {};
      if (
        error ||
        typeof date !== 'string' || dailyNumberForDate(date) !== dailyNumber ||
        !Number.isInteger(score) || Number(score) < 0 || Number(score) > 10 ||
        !Array.isArray(correctness) || correctness.length !== 10 ||
        !correctness.every((item) => typeof item === 'boolean') ||
        correctness.filter(Boolean).length !== score
      ) {
        setResult(null);
      } else {
        setResult({ score: Number(score), correctness, verified: true });
      }
      setIsLoading(false);
    }, () => {
      if (active) {
        setResult(null);
        setIsLoading(false);
      }
    });

    return () => { active = false; };
  }, [dailyNumber, query]);

  return (
    <main className="min-h-screen bg-arena-sand flex flex-col items-center justify-center p-4 text-arena-charcoal">
      <section className="w-full max-w-xl rounded-[28px] border border-stone-200/80 bg-white/90 p-8 text-center shadow-soft-card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-arena-muted">TV Arena</p>
        <h1 className="mb-5 font-serif text-3xl font-semibold">Daily Run #{dailyNumber || '—'}</h1>
        {isLoading ? (
          <p role="status" className="text-sm text-stone-600">Loading shared result…</p>
        ) : result ? (
          <>
            <p className="mb-2 text-lg font-semibold">Score: {result.score}/10</p>
            <p className="mb-5 text-xs text-stone-600">
              {result.verified ? 'Verified server result.' : 'Shared from a device; not server-verified.'}
            </p>
            <div className="mb-7 flex justify-center gap-1.5" role="img" aria-label="Daily result grid">
              {result.correctness.map((correct, index) => (
                <span key={index} aria-label={correct ? 'Correct' : 'Incorrect'}>{correct ? '🟩' : '🟥'}</span>
              ))}
            </div>
          </>
        ) : (
          <p role="alert" className="mb-6 text-sm text-stone-600">This shared result is invalid or no longer available.</p>
        )}
        <Link to="/guess/daily" className="inline-block rounded-full bg-arena-terracotta px-5 py-2 text-sm font-semibold text-white">
          Play today’s challenge
        </Link>
      </section>
    </main>
  );
}
