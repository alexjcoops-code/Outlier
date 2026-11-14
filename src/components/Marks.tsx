// The hand-drawn bits: teacher's ticks and circles, tally marks, the loading scribble.

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Shared SVG filters and patterns. Rendered once, at the top of the app. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="rough-edge" x="-5%" y="-15%" width="110%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" />
        </filter>
        <filter id="pencil-texture" x="-2%" y="-200%" width="104%" height="500%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
        </filter>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="1" y1="0" x2="1" y2="5" stroke="#6b6b6b" strokeWidth="1.5" />
        </pattern>
        <pattern id="hatch-ink" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="1" y1="0" x2="1" y2="5" stroke="#1f2a44" strokeWidth="1.8" />
        </pattern>
      </defs>
    </svg>
  );
}

function useDraw(duration: number, delay = 0) {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? false : ({ pathLength: 0, opacity: 0 } as const),
    animate: { pathLength: 1, opacity: 1 },
    transition: { duration: reduce ? 0 : duration, delay: reduce ? 0 : delay, ease: 'easeOut' as const },
  };
}

/** A red-pen tick that draws itself. */
export function RedTick({ size = 40, delay = 0 }: { size?: number; delay?: number }) {
  const draw = useDraw(0.4, delay);
  return (
    <svg className="red-tick" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <motion.path
        d="M5 21 C9 24, 13 30, 15 35 C19 23, 27 11, 37 4"
        fill="none"
        stroke="var(--redpen)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw}
      />
    </svg>
  );
}

/**
 * The teacher's "!!": quick red-pen strokes dashed out round a mark, then two
 * little stars. For an Outlier: smaller than the Lone Wolf's confetti, and drawn
 * rather than thrown.
 */
export function Emphasis({ delay = 0, className = '' }: { delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  // Strokes radiate from an ellipse round the centre of a 200 × 120 box: over the
  // top and out to the right. The left is the tier's name, the top right is the
  // ticks' and underneath is the line of text, so all three stay clear.
  const angles = [214, 236, 258, 280, 352, 14, 38];
  const strokes = angles.map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const inner = 1.12 + (i % 2) * 0.06;
    const outer = inner + 0.2 + (i % 3) * 0.06;
    const pt = (k: number) => `${(100 + Math.cos(a) * 86 * k).toFixed(1)} ${(60 + Math.sin(a) * 48 * k).toFixed(1)}`;
    return `M${pt(inner)} L${pt(outer)}`;
  });
  const star = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      return `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
    });
    return `M${pts.join(' L')} Z`;
  };
  const step = (i: number) => ({
    initial: reduce ? false : ({ pathLength: 0, opacity: 0 } as const),
    animate: { pathLength: 1, opacity: 1 },
    transition: { duration: reduce ? 0 : 0.14, delay: reduce ? 0 : delay + i * 0.045, ease: 'easeOut' as const },
  });
  return (
    <svg className={`emphasis ${className}`} viewBox="0 0 200 120" aria-hidden="true">
      <g fill="none" stroke="var(--redpen)" strokeLinecap="round" strokeLinejoin="round">
        {strokes.map((d, i) => (
          <motion.path key={d} d={d} strokeWidth="3" {...step(i)} />
        ))}
        <motion.path d={star(196, 70, 8)} strokeWidth="2.2" {...step(strokes.length + 1)} />
        <motion.path d={star(18, 2, 6.5)} strokeWidth="2" {...step(strokes.length + 3)} />
      </g>
    </svg>
  );
}

/** A red-pen dash: nothing handed in. */
export function RedDash() {
  const draw = useDraw(0.25);
  return (
    <svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true">
      <motion.path
        d="M4 22 C14 19, 28 21, 40 18"
        fill="none"
        stroke="var(--redpen)"
        strokeWidth="3.4"
        strokeLinecap="round"
        {...draw}
      />
    </svg>
  );
}

/** Wraps its children in a hand-drawn red circle, the way a teacher rings a mark. */
export function Circled({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const draw = useDraw(0.5, delay);
  return (
    <span className={`circled ${className}`}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
          d="M38 16 C92 2, 168 6, 188 40 C204 72, 150 94, 96 95 C44 96, 4 80, 9 48 C13 22, 60 7, 124 9"
          fill="none"
          stroke="var(--redpen)"
          strokeWidth="2.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          {...draw}
        />
      </svg>
      <span className="circled__text">{children}</span>
    </span>
  );
}

/** A merit-star stamp for Lone Wolf answers. */
export function StarStamp({ delay = 0.55 }: { delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      className="star-stamp"
      width="58"
      height="58"
      viewBox="0 0 60 60"
      aria-hidden="true"
      initial={reduce ? false : { scale: 1.7, opacity: 0, rotate: -30 }}
      animate={{ scale: 1, opacity: 1, rotate: -11 }}
      transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : delay, ease: 'easeIn' }}
    >
      <g filter="url(#rough-edge)">
        <circle cx="30" cy="30" r="25" fill="none" stroke="var(--gold)" strokeWidth="3" />
        <path
          d="M30 11 L34.6 23.6 L48 24.2 L37.5 32.6 L41.2 45.5 L30 38 L18.8 45.5 L22.5 32.6 L12 24.2 L25.4 23.6 Z"
          fill="var(--gold)"
        />
      </g>
    </motion.svg>
  );
}

/** Tally marks: four strokes and a strike-through for every five. */
export function Tally({ count }: { count: number }) {
  const shown = Math.min(count, 15);
  const groups: number[] = [];
  for (let left = shown; left > 0; left -= 5) groups.push(Math.min(5, left));
  return (
    <svg
      className="tally"
      width={groups.length * 26}
      height="18"
      viewBox={`0 0 ${groups.length * 26} 18`}
      aria-hidden="true"
    >
      {groups.map((g, gi) => (
        <g key={gi} transform={`translate(${gi * 26 + 2} 0)`} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          {Array.from({ length: Math.min(g, 4) }, (_, i) => (
            <path key={i} d={`M${3 + i * 5} ${2 + (i % 2)} L${2.4 + i * 5} ${16 - (i % 2)}`} />
          ))}
          {g === 5 && <path d="M0 13 L20 4" />}
        </g>
      ))}
    </svg>
  );
}

/** Loading: a pencil scribble, not a spinner. */
export function Scribble({ label = 'Finding the worksheet' }: { label?: string }) {
  return (
    <div className="scribble" role="status">
      <svg width="74" height="26" viewBox="0 0 74 26" aria-hidden="true">
        <path
          d="M3 18 C8 2, 13 2, 14 14 C15 25, 21 24, 23 12 C25 1, 31 2, 32 14 C33 25, 39 24, 41 12 C43 1, 49 2, 50 14 C51 25, 57 24, 59 12 C61 3, 67 4, 71 16"
          pathLength={1}
          fill="none"
          stroke="var(--pencil)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}
