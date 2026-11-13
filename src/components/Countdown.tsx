import { useEffect, useState } from 'react';
import { formatCountdown, msUntilUkMidnight } from '../lib/ukDate.ts';

/** "Next worksheet in 07:12:44": counts down to midnight in London. */
export function Countdown() {
  const [ms, setMs] = useState(() => msUntilUkMidnight());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilUkMidnight()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="countdown">
      Next worksheet in <time className="mono">{formatCountdown(ms)}</time>
    </p>
  );
}
