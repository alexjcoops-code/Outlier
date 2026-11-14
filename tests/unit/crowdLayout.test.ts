import { describe, expect, it } from 'vitest';
import { primeUnder1000, bigPowerOf2, multipleOf7 } from './fixtures.ts';
import { allocateDots, formatPerBall, rackLayout, restingPositions, scalePosition } from '../../src/lib/crowdLayout.ts';

const opts = { pad: 10, floorGap: 30, top: 34, pitch: 11 };
const prime = primeUnder1000;

describe('crowd rack layout', () => {
  it('allocates exactly the requested number of balls', () => {
    const d = allocateDots([{ value: 2, share: 0.333 }, { value: 3, share: 0.333 }, { value: 5, share: 0.334 }], 100);
    expect([...d.values()].reduce((s, x) => s + x, 0)).toBe(100);
  });

  it('uses a log scale for wide ranges', () => {
    const p = bigPowerOf2;
    expect(scalePosition(p, 1000)).toBe(0);
    expect(scalePosition(p, 1_000_000)).toBe(1);
    expect(scalePosition(p, 31_623)).toBeCloseTo(0.5, 2);
    // Narrow ranges stay linear.
    expect(scalePosition(multipleOf7, 600)).toBeCloseTo(0.5, 2);
  });

  it('uses 1% balls when they fit, and bigger ones when a pile would overflow', () => {
    const linear = multipleOf7;
    const flat = Array.from({ length: 10 }, (_, i) => ({ value: 504 + i * 21, share: 0.1 }));
    expect(rackLayout(linear, flat, null, 340, 200, opts).perBall).toBe(0.01);
    const lumpy = [{ value: 7, share: 0.6 }, { value: 683, share: 0.4 }];
    const L = rackLayout(prime, lumpy, null, 340, 200, opts);
    expect(L.perBall).toBeGreaterThan(0.01);
    const rows = Math.floor((L.floor - opts.top) / (L.radius * 2));
    const perTube = new Map<number, number>();
    for (const b of L.balls) perTube.set(b.tube, (perTube.get(b.tube) ?? 0) + 1);
    expect(Math.max(...perTube.values())).toBeLessThanOrEqual(rows);
    expect(formatPerBall(0.025)).toBe('2.5%');
  });

  it('gives the player exactly one red ball, alone if nobody else is near', () => {
    const values = [{ value: 7, share: 0.7 }, { value: 2, share: 0.29 }, { value: 683, share: 0.01 }];
    const L = rackLayout(prime, values, 683, 340, 200, opts);
    expect(L.balls.filter((b) => b.mine)).toHaveLength(1);
    expect(L.alone).toBe(true);
    const crowded = rackLayout(prime, values, 7, 340, 200, opts);
    expect(crowded.balls.filter((b) => b.mine)).toHaveLength(1);
    expect(crowded.alone).toBe(false);
    // At rest, the red ball sits on top of its pile.
    const rest = restingPositions(crowded);
    const red = rest.find((p) => p.mine)!;
    for (const p of rest) if (!p.mine && Math.abs(p.x - red.x) < 1) expect(p.y).toBeGreaterThan(red.y);
  });
});
