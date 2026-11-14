// How loudly the page celebrates each tier. The rarer the answer, the bigger
// the fuss: Obvious gets a plain tick; Lone Wolf shakes the page.
import { GREEN_INK } from './format.ts';

import type { TierId } from './scoring.ts';

export interface Fanfare {
  /** Hole-punch confetti pieces. */
  chads: number;
  /** Gold star stickers among the confetti. */
  stars: number;
  /** Page shake strength, 0 to 1. */
  shake: number;
  /** How hard the player's ball knocks the crowd in the rack, 0 to 1.5. */
  shockwave: number;
  /** Phone vibration pattern (ms), if any. */
  vibrate: number[] | null;
  /** A rubber stamp slammed onto the page. */
  stamp: { text: string; ink: string } | null;
  /** Points count up into the circle. */
  countUp: boolean;
  /** Red ticks next to the points: 2 is a teacher's "very good". */
  ticks: number;
}

const QUIET: Fanfare = { chads: 0, stars: 0, shake: 0, shockwave: 0, vibrate: null, stamp: null, countUp: false, ticks: 0 };

export const FANFARE: Record<TierId, Fanfare> = {
  none: QUIET,
  obvious: { ...QUIET },
  clever: { ...QUIET },
  fair: { ...QUIET, countUp: true, ticks: 1 },
  rare: { ...QUIET, countUp: true, ticks: 2, chads: 14, shockwave: 0.3, vibrate: [18] },
  outlier: {
    chads: 36,
    stars: 3,
    shake: 0.5,
    shockwave: 0.75,
    vibrate: [25, 40, 25],
    stamp: { text: 'Bold', ink: '#c2223f' },
    countUp: true,
    ticks: 2,
  },
  lone: {
    chads: 80,
    stars: 8,
    shake: 1,
    shockwave: 1.4,
    vibrate: [30, 50, 30, 50, 120],
    stamp: { text: 'Nobody else', ink: GREEN_INK },
    countUp: true,
    ticks: 3,
  },
};

/** Award stamps for the day's total. */
export function awardFor(total: number): { text: string; ink: string; chads: number; stars: number } | null {
  if (total >= 600) return { text: "Headteacher's award", ink: GREEN_INK, chads: 180, stars: 30 };
  if (total >= 450) return { text: 'Distinction', ink: '#c2223f', chads: 110, stars: 14 };
  if (total >= 300) return { text: 'Merit', ink: '#1f2a44', chads: 50, stars: 4 };
  return null;
}

// ── Confetti bus: any component can fire a burst; the layer in App draws it. ──

export interface Burst {
  /** Viewport coordinates of the origin. */
  x: number;
  y: number;
  chads: number;
  stars: number;
  /** Highlighter colour mixed into the confetti. */
  colour: string;
}

const listeners = new Set<(b: Burst) => void>();

export function burst(b: Burst): void {
  for (const l of listeners) l(b);
}

export function onBurst(listener: (b: Burst) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Jolt the whole page. strength 0 to 1. */
export function shakePage(strength: number): void {
  const page = document.querySelector<HTMLElement>('.page');
  if (!page?.animate || strength <= 0) return;
  const a = 7 * strength;
  const t = 0.5 * strength;
  page.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: `translate(${-a}px, ${a * 0.4}px) rotate(${-t}deg)` },
      { transform: `translate(${a * 0.8}px, ${-a * 0.3}px) rotate(${t * 0.8}deg)` },
      { transform: `translate(${-a * 0.5}px, ${a * 0.2}px) rotate(${-t * 0.4}deg)` },
      { transform: `translate(${a * 0.25}px, 0) rotate(0deg)` },
      { transform: 'translate(0, 0) rotate(0deg)' },
    ],
    { duration: 380 + 160 * strength, easing: 'ease-out' },
  );
}

export function buzz(pattern: number[] | null): void {
  if (!pattern) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
