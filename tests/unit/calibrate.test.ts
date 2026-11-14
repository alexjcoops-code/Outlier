import { describe, expect, it } from 'vitest';
import { getPrompt } from '../../src/prompts.ts';
import { dailyPromptIds } from '../../src/lib/daily.ts';
import { jensenShannon } from '../../src/lib/divergence.ts';
import { ABILITIES, GHOST_CONFIG, STYLES, type GhostConfig } from '../../src/lib/ghostConfig.ts';
import { generateRuleGhosts } from '../../src/lib/ghostModel.ts';
import { fitGhostMix, type Observation } from '../../src/lib/calibrate.ts';
import { seededRng } from '../../src/lib/rng.ts';
import { addDays } from '../../src/lib/ukDate.ts';

describe('Jensen-Shannon divergence', () => {
  const m = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  it('is 0 for identical shapes and 1 for disjoint ones', () => {
    expect(jensenShannon(m({ 1: 2, 2: 2 }), m({ 1: 50, 2: 50 }))).toBeCloseTo(0, 10);
    expect(jensenShannon(m({ 1: 1 }), m({ 2: 1 }))).toBeCloseTo(1, 10);
    const half = jensenShannon(m({ 1: 1, 2: 1 }), m({ 1: 1 }));
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.5);
  });
});

describe('suggesting a new ghost mix', () => {
  // Pretend real players are a cleverer, riskier crowd than the config assumes.
  const truth: GhostConfig = {
    ...GHOST_CONFIG,
    abilities: {
      ultra: { ...GHOST_CONFIG.abilities.ultra, share: 0.3 },
      pretty: { ...GHOST_CONFIG.abilities.pretty, share: 0.3 },
      average: { ...GHOST_CONFIG.abilities.average, share: 0.25 },
      weak: { ...GHOST_CONFIG.abilities.weak, share: 0.1 },
      panicker: { ...GHOST_CONFIG.abilities.panicker, share: 0.05 },
    },
    styles: { safe: { share: 0.2 }, mid: { share: 0.3 }, risk: { share: 0.35 }, showoff: { share: 0.15 } },
  };

  const observations: Observation[] = [];
  for (let d = 0; d < 14; d++) {
    const date = addDays('2026-10-30', d);
    dailyPromptIds(date).forEach((id) => {
      const players = generateRuleGhosts(getPrompt(id), 600, seededRng(`real:${date}:${id}`), { year: 2026, config: truth });
      const counts = new Map<number, number>();
      for (const p of players) if (p.value !== null) counts.set(p.value, (counts.get(p.value) ?? 0) + 1);
      observations.push({ date, promptId: id, counts, timeouts: players.filter((p) => p.value === null).length });
    });
  }
  const fit = fitGhostMix(observations);
  const l1 = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(a).reduce((s, k) => s + Math.abs(a[k]! - b[k]!), 0);
  const shares = (c: GhostConfig) => ({
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, c.abilities[a].share])),
    styles: Object.fromEntries(STYLES.map((s) => [s, c.styles[s].share])),
  });

  it('returns shares that add up to 1', () => {
    expect(Object.values(fit.abilities).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(Object.values(fit.styles).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(fit.answers).toBeGreaterThan(50000);
    expect(fit.unexplained).toBe(0);
  });

  it('moves the mix towards the real crowd', () => {
    const before = shares(GHOST_CONFIG);
    const target = shares(truth);
    expect(l1(fit.abilities, target.abilities)).toBeLessThan(l1(before.abilities, target.abilities) / 2);
    expect(l1(fit.styles, target.styles)).toBeLessThan(l1(before.styles, target.styles) / 2);
    expect(fit.abilities.ultra).toBeGreaterThan(GHOST_CONFIG.abilities.ultra.share);
    expect(fit.styles.risk).toBeGreaterThan(GHOST_CONFIG.styles.risk.share);
  });

  it('fits the answers better than before', () => {
    expect(fit.jsAfter).toBeLessThan(fit.jsBefore);
    expect(fit.timeouts.observed).not.toBeNull();
    expect(Math.abs(fit.timeouts.suggested - fit.timeouts.observed!)).toBeLessThan(
      Math.abs(fit.timeouts.configured - fit.timeouts.observed!),
    );
  });
});
