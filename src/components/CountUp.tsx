import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/** Counts from 0 up to `to`, starting after `delay` seconds. */
export function CountUp({ to, delay = 0, duration = 0.7, prefix = '' }: { to: number; delay?: number; duration?: number; prefix?: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setN(to);
      return;
    }
    let raf = 0;
    const startAt = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / (duration * 1000)));
      // Ease out, so it slows as it reaches the score.
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration, reduce]);
  return (
    <>
      <span aria-hidden="true">
        {prefix}
        {n}
      </span>
      <span className="sr-only">
        {prefix}
        {to}
      </span>
    </>
  );
}
