// Geometry for the crowd rack: which tube each answer falls into, how many
// balls to use, and where they come to rest. Pure, so it can be tested and
// used for the static (reduced-motion and compact) drawings.

import type { Prompt } from '../prompts.ts';

export interface CrowdValue {
  value: number;
  share: number;
}

/** Split `total` balls between values in proportion to their shares (largest remainder). */
export function allocateDots(values: readonly CrowdValue[], total: number): Map<number, number> {
  const sum = values.reduce((s, v) => s + v.share, 0) || 1;
  const exact = values.map((v) => (v.share / sum) * total);
  const dots = exact.map(Math.floor);
  let left = total - dots.reduce((s, x) => s + x, 0);
  const order = values.map((_, i) => i).sort((a, b) => exact[b]! - dots[b]! - (exact[a]! - dots[a]!) || a - b);
  for (const i of order) {
    if (left-- <= 0) break;
    dots[i]!++;
  }
  const out = new Map<number, number>();
  values.forEach((v, i) => {
    if (dots[i]! > 0) out.set(v.value, dots[i]!);
  });
  return out;
}

/** Position along the line, 0 to 1. Wide ranges use a log scale so small numbers don't all collapse together. */
export function scalePosition(prompt: Prompt, value: number): number {
  const lo = Math.max(1, prompt.min);
  const hi = Math.max(lo + 1, prompt.max);
  const v = Math.min(hi, Math.max(lo, value));
  if (hi / lo > 50) return Math.log(v / lo) / Math.log(hi / lo);
  return (v - lo) / (hi - lo);
}

export interface Ball {
  tube: number;
  mine: boolean;
}

export interface RackLayout {
  width: number;
  height: number;
  /** y of the rack floor. */
  floor: number;
  /** Left edge of the first tube and the width of each. */
  left: number;
  tubeWidth: number;
  tubes: number;
  radius: number;
  /** Each ball stands for this share of the answers (0.01 = 1%). */
  perBall: number;
  balls: Ball[];
  /** Tube holding the crowd's favourite answer. */
  peakTube: number | null;
  mineTube: number | null;
  /** The player's ball has no others in its tube. */
  alone: boolean;
}

/** Ball counts to try, largest first: each ball is then 1%, 2%, 2.5%, 4% or 5% of answers. */
const BALL_COUNTS = [100, 50, 40, 25, 20] as const;

export function rackLayout(
  prompt: Prompt,
  values: readonly CrowdValue[],
  mine: number | null,
  width: number,
  height: number,
  opts: { pad: number; floorGap: number; top: number; pitch: number },
): RackLayout {
  const plotW = Math.max(60, width - opts.pad * 2);
  const tubes = Math.max(8, Math.floor(plotW / opts.pitch));
  const tubeWidth = plotW / tubes;
  const radius = Math.max(1.2, tubeWidth / 2 - 0.9);
  const floor = height - opts.floorGap;
  const rows = Math.max(3, Math.floor((floor - opts.top) / (radius * 2)));
  const tubeOf = (v: number) => Math.min(tubes - 1, Math.floor(scalePosition(prompt, v) * tubes));

  // Use as many balls as the tallest tube allows.
  let count: number = BALL_COUNTS[BALL_COUNTS.length - 1]!;
  let dots = allocateDots(values, count);
  for (const n of BALL_COUNTS) {
    const d = allocateDots(values, n);
    const perTube = new Map<number, number>();
    for (const [value, k] of d) perTube.set(tubeOf(value), (perTube.get(tubeOf(value)) ?? 0) + k);
    const extra = mine !== null && !d.has(mine) ? 1 : 0;
    const tallest = Math.max(0, ...perTube.values()) + extra;
    if (tallest <= rows) {
      count = n;
      dots = d;
      break;
    }
  }

  const balls: Ball[] = [];
  let mineDone = false;
  for (const [value, k] of dots) {
    for (let i = 0; i < k; i++) {
      // The player's own answer: one of its balls is theirs.
      const isMine = !mineDone && value === mine;
      if (isMine) mineDone = true;
      balls.push({ tube: tubeOf(value), mine: isMine });
    }
  }
  if (mine !== null && !mineDone) balls.push({ tube: tubeOf(mine), mine: true });

  const mineTube = mine === null ? null : tubeOf(mine);
  const best = values[0];
  return {
    width,
    height,
    floor,
    left: opts.pad,
    tubeWidth,
    tubes,
    radius,
    perBall: 1 / count,
    balls,
    peakTube: best && dots.has(best.value) ? tubeOf(best.value) : null,
    mineTube,
    alone: mineTube !== null && !balls.some((b) => !b.mine && b.tube === mineTube),
  };
}

/** Where every ball comes to rest if they are simply stacked: the drawing without physics. */
export function restingPositions(layout: RackLayout): { x: number; y: number; mine: boolean }[] {
  const heights = new Map<number, number>();
  // The player's ball goes on top of its pile, as if it fell last.
  const ordered = [...layout.balls.filter((b) => !b.mine), ...layout.balls.filter((b) => b.mine)];
  return ordered.map((b) => {
    const h = heights.get(b.tube) ?? 0;
    heights.set(b.tube, h + 1);
    return {
      x: layout.left + (b.tube + 0.5) * layout.tubeWidth,
      y: layout.floor - layout.radius - h * layout.radius * 2,
      mine: b.mine,
    };
  });
}

/** "1%", "2.5%" */
export function formatPerBall(perBall: number): string {
  return `${Math.round(perBall * 1000) / 10}%`;
}
