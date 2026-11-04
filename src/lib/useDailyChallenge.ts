import { useEffect, useMemo, useRef, useState } from 'react';
import { getDailyChallengeNumber, getTodayDateString } from './dailyChallenge';

export function useDailyChallenge(isActive: boolean) {
  const [todayStr, setTodayStr] = useState(getTodayDateString);
  const dailyRunDateRef = useRef<string | null>(null);
  const challengeNumber = useMemo(() => getDailyChallengeNumber(todayStr), [todayStr]);

  useEffect(() => {
    const refreshUtcDate = () => {
      if (isActive) return;
      const currentDate = getTodayDateString();
      setTodayStr((previous) => (previous === currentDate ? previous : currentDate));
    };
    const interval = window.setInterval(refreshUtcDate, 30_000);
    window.addEventListener('focus', refreshUtcDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshUtcDate);
    };
  }, [isActive]);

  return { todayStr, setTodayStr, challengeNumber, dailyRunDateRef };
}
