// ponytail: 25-line requestAnimationFrame count-up hook; no third-party package
import { useEffect, useState } from 'react';

export function useCountUp(target: number, duration: number = 1000, enabled: boolean = true): number {
  const [count, setCount] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setCount(target);
      return;
    }

    let startTime: number | null = null;
    let animId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(ease * target));

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      }
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [target, duration, enabled]);

  return count;
}
