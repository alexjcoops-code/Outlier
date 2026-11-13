import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { TIMER_MS } from '../lib/backend/types.ts';

interface Props {
  /** performance.now() timestamp at which time runs out. */
  deadline: number;
  /** Freeze the display (an answer has been handed in). */
  stopped: boolean;
  onExpire: () => void;
}

/** A pencil line that gets shorter. Turns red-pen under five seconds. */
export function TimerLine({ deadline, stopped, onExpire }: Props) {
  const reduce = useReducedMotion();
  const [left, setLeft] = useState(() => Math.max(0, deadline - performance.now()));
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expired.current = false;
  }, [deadline]);

  useEffect(() => {
    if (stopped) return;
    let raf = 0;
    let interval = 0;
    const tick = () => {
      const ms = Math.max(0, deadline - performance.now());
      setLeft(ms);
      if (ms <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current();
      }
    };
    if (reduce) {
      // No smooth motion: step once a second instead.
      interval = window.setInterval(tick, 250);
    } else {
      const loop = () => {
        tick();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    // rAF pauses in background tabs; a slow interval still catches expiry.
    const safety = window.setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
      clearInterval(safety);
    };
  }, [deadline, stopped, reduce]);

  const seconds = Math.ceil(left / 1000);
  const fraction = reduce ? seconds / (TIMER_MS / 1000) : left / TIMER_MS;
  const urgent = left <= 5000;

  return (
    <div
      className={`timer ${urgent ? 'is-urgent' : ''}`}
      role="timer"
      aria-label={`${seconds} seconds left`}
    >
      <div className="timer__track">
        <div className="timer__line" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      </div>
      <span className="timer__seconds" aria-hidden="true">
        {seconds}s
      </span>
    </div>
  );
}
